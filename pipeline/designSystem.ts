import {execFile} from 'node:child_process';
import {readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {themeSchema, fontNames, displayFonts, type Theme} from '../src/schema';
import {config} from './config';
import {chat, extractJson, type ChatFn, type Message} from './llm';
import type {Ledger} from './ledger';
import {contrast} from './qa';

const run = promisify(execFile);
const TEXT_EXT = new Set(['.md', '.markdown', '.css', '.json', '.html', '.htm', '.txt', '.scss', '.ts', '.tsx', '.js']);
const MAX_ENTRY = 300 * 1024;
const MAX_TOTAL = 60 * 1024;
const HINT = /token|color|colour|variable|theme|typograph|font|readme|design|palette|style/i;

type Entry = {name: string; text: string};

const readZip = async (file: string): Promise<Entry[]> => {
  let names: string[];
  try {
    names = (await run('unzip', ['-Z1', file], {maxBuffer: 8 << 20, timeout: 10_000})).stdout.split('\n').filter(Boolean);
  } catch {
    throw new Error('zip has no readable files');
  }
  const ok = names.filter((n) => !n.endsWith('/') && TEXT_EXT.has(path.extname(n).toLowerCase()) && !n.split('/').some((p) => p === '__MACOSX' || p.startsWith('.')) && !n.includes('..'));
  // tokens/variables first, then other hinted names, shortest paths first
  ok.sort((a, b) => Number(HINT.test(path.basename(b))) - Number(HINT.test(path.basename(a))) || a.length - b.length);
  const out: Entry[] = [];
  let total = 0;
  // At most 200 entries and stop once there is enough text: a zip with thousands of files can't tie up the server.
  for (const name of ok.slice(0, 200)) {
    if (total >= MAX_TOTAL) break;
    try {
      // unzip treats names as wildcard patterns; escape them so exactly this entry is read.
      const {stdout} = await run('unzip', ['-p', file, name.replace(/[*?[\]\\]/g, '\\$&')], {maxBuffer: MAX_ENTRY + 1024, encoding: 'utf8', timeout: 10_000});
      if (Buffer.byteLength(stdout) <= MAX_ENTRY && stdout.trim()) {
        out.push({name, text: stdout});
        total += Buffer.byteLength(stdout);
      }
    } catch {
      /* entry too big or unreadable: skip */
    }
  }
  if (!out.length) throw new Error('zip has no readable files');
  return out;
};

const readEntries = async (file: string, filename: string): Promise<Entry[]> => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.zip') return readZip(file);
  if (!TEXT_EXT.has(ext)) throw new Error('unsupported file type (use .zip, .md, .css, .json, .html or .txt)');
  if (statSync(file).size > MAX_ENTRY) throw new Error('file is too large (300 KB max)');
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) throw new Error('file is empty');
  return [{name: path.basename(filename), text}];
};

const pack = (entries: Entry[]) => {
  const used: string[] = [];
  let left = MAX_TOTAL;
  let body = '';
  for (const e of entries) {
    if (left < 500) break;
    const text = e.text.slice(0, left);
    body += `\n=== ${e.name} ===\n${text}\n`;
    left -= text.length;
    used.push(e.name);
  }
  return {body, used};
};

const deepMerge = (base: unknown, patch: unknown): unknown =>
  base && patch && typeof base === 'object' && typeof patch === 'object' && !Array.isArray(base) && !Array.isArray(patch)
    ? {...base, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, deepMerge((base as Record<string, unknown>)[k], v)]))}
    : patch === undefined ? base : patch;

// Maps an exported design system (zip or single text file) onto our client theme. Nothing is saved here.
export const importDesignSystem = async (file: string, filename: string, theme: Theme, chatFn: ChatFn = chat, ledger?: Ledger): Promise<{theme: Theme; notes: string[]; source: string[]}> => {
  const {body, used} = pack(await readEntries(file, filename));
  if (!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|font|color/i.test(body)) throw new Error('no design tokens found in this file');
  const messages: Message[] = [
    {
      role: 'system',
      content: `You map a design system onto the theme schema of an Arabic-first video studio. Reply with JSON only: {"theme": {...}, "notes": [string]}.
Theme fields: client (keep "${theme.client}" unless the design system clearly names the brand), direction "rtl"|"ltr", numerals "latn"|"arab", font (MUST be one of ${JSON.stringify(fontNames)}: pick the closest Arabic-capable match to the system's body font and say so in notes), displayFont (one of ${JSON.stringify(displayFonts)}, or "none"), colors {background, surface, primary, accent, text, muted} as hex, radius 0-80 (px), glow 0-1, motion {speed 0.5-2, damping 8-200}. Keep logo as is.
Videos are dark or light full-screen; text must be readable on background (contrast >= 4.5:1). Only change fields the design system supports; notes = one short line per decision (font substitutions, dropped tokens).`,
    },
    {role: 'user', content: `Current theme:\n${JSON.stringify(theme)}\n\nDesign system files:\n${body}`},
  ];
  let last: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const {text} = await chatFn({role: 'writer', models: config.models.writer, messages, ledger, temperature: 0.3});
    let raw: unknown;
    try {
      raw = extractJson(text);
    } catch (e) {
      last = [`invalid JSON: ${(e as Error).message}`];
      messages.push({role: 'assistant', content: text.slice(0, 4000)}, {role: 'user', content: 'Not valid JSON. Return {"theme","notes"} JSON only.'});
      continue;
    }
    const r = raw as {theme?: unknown; notes?: unknown};
    // The logo never comes from an uploaded file: text inside it could point renders at any URL.
    const merged = themeSchema.safeParse({...(deepMerge(theme, r?.theme) as object), logo: theme.logo});
    if (merged.success) {
      const notes = (Array.isArray(r.notes) ? r.notes : []).filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 200)).slice(0, 10);
      const c = contrast(merged.data.colors.text, merged.data.colors.background);
      if (c !== null && c < 4.5) notes.push(`low contrast: text on background is ${c}:1 (needs 4.5:1); colors kept as imported`);
      return {theme: merged.data, notes, source: used};
    }
    last = merged.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    messages.push({role: 'assistant', content: JSON.stringify(raw).slice(0, 4000)}, {role: 'user', content: `Validation failed:\n- ${last.slice(0, 15).join('\n- ')}\nFix and return the complete {"theme","notes"} JSON only.`});
  }
  throw new Error(`could not map this design system:\n- ${last.slice(0, 5).join('\n- ')}`);
};
