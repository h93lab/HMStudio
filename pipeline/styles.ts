import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {packIds, packs, packSchema, backgroundNames, cameraModes, displayFonts, transitionNames, type Pack, type PackId} from '../src/design/packs';
import {config, ROOT} from './config';
import {writeAtomic} from './jobs';
import {chat, extractJson, type ChatFn, type Message} from './llm';
import type {Ledger} from './ledger';

// Custom style packs (global): styles.json, path overridable by MOTION_STYLES (tests). Read on every call so tests can switch files.
export type CustomStyle = {id: string; name: string; prompt: string; pack: Pack; createdAt: string; updatedAt?: string};

const file = () => process.env.MOTION_STYLES ?? path.join(ROOT, 'styles.json');

// A hand-edited or corrupt file must never break make/options: keep only valid entries.
export const listStyles = (): CustomStyle[] => {
  if (!existsSync(file())) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file(), 'utf8'));
  } catch {
    console.error(`styles: ${file()} is not valid JSON; ignoring custom styles`);
    return [];
  }
  return Array.isArray(raw) ? raw.filter((s): s is CustomStyle => !!s && typeof s.id === 'string' && /^[a-z0-9-]{1,40}$/.test(s.id) && typeof s.name === 'string' && packSchema.safeParse(s.pack).success) : [];
};
const write = (all: CustomStyle[]) => writeAtomic(file(), JSON.stringify(all, null, 2));

export const getStyle = (id: string) => listStyles().find((s) => s.id === id);
export const isStyleId = (id: string) => (packIds as readonly string[]).includes(id) || !!getStyle(id);
export const resolvePack = (id: string): Pack | undefined => (packIds as readonly string[]).includes(id) ? packs[id as PackId] : getStyle(id)?.pack;

export const styleOptions = (): {id: string; label: string; custom?: boolean}[] => [
  ...packIds.map((id) => ({id, label: packs[id].label})),
  ...listStyles().map((s) => ({id: s.id, label: s.pack.label, custom: true})),
];

const inputSchema = z.object({name: z.string().trim().min(1).max(40), prompt: z.string().max(2000), pack: packSchema});
const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`);

export const saveStyle = (input: unknown, id?: string): CustomStyle => {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`invalid style: ${issues(parsed.error).slice(0, 3).join('; ')}`);
  const {name, prompt, pack} = parsed.data;
  const all = listStyles();
  const now = new Date().toISOString();
  const next = {...pack, label: name};
  if (id !== undefined) {
    const i = all.findIndex((s) => s.id === id);
    if (i < 0) throw new Error(`unknown style "${id}"`);
    all[i] = {...all[i], name, prompt, pack: next, updatedAt: now};
    write(all);
    return all[i];
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'style';
  const taken = (x: string) => isStyleId(x);
  let newId = slug;
  for (let n = 2; taken(newId); n++) newId = `${slug}-${n}`;
  const style: CustomStyle = {id: newId, name, prompt, pack: next, createdAt: now};
  write([...all, style]);
  return style;
};

export const deleteStyle = (id: string) => {
  const all = listStyles();
  if (!all.some((s) => s.id === id)) throw new Error(`unknown style "${id}"`);
  write(all.filter((s) => s.id !== id));
};

const GUIDE = `A style pack is the motion personality of a video (not its colors). Fields, ranges and visual meaning:
- label: display name, 1-40 chars.
- ease: cubic-bezier [x1,y1,x2,y2] of entrances; x in 0..1, y in -1..2. Lower-left heavy = snappy and decisive ([0.16,1,0.3,1]); y above 1 = springy overshoot.
- overshoot: 0..0.6, back-out overshoot of entrances (0 = none, 0.25 = playful).
- enterFrames: 8..60, entrance length at 30fps (14 = punchy, 30 = calm).
- stagger: {each: 0..10 frames between items, from: "start"|"center"|"end"}.
- camera: {mode: ${cameraModes.join('|')}, intensity: 0..1.5} slow virtual camera move.
- transitions: 1-8 names from [${transitionNames.join(', ')}], rotated between scenes (repeat to weight).
- transitionFrames: 8..40, transition length.
- backgrounds: 1-6 names from [${backgroundNames.join(', ')}], rotated between scenes.
- finish: {grain, vignette, leaks (light leaks), chroma (chromatic aberration)}, each 0..1.
- reveal: "blur"|"rise"|"wipe"|"scale", how titles appear.
- displayFont: one of [${displayFonts.join(', ')}] ("none" = brand font).
- tracking: -0.05..0.1 em, title letter-spacing.
- accent: "underline"|"bracket"|"glow", highlight style of emphasized words.`;

// AI draft of a pack from a prompt (not saved). `base` = start from it and change only what the prompt asks.
export const generatePack = async (prompt: string, base?: unknown, opts: {ledger?: Ledger; chatFn?: ChatFn} = {}): Promise<{pack: Pack; notes: string[]}> => {
  const run = opts.chatFn ?? chat;
  const basePack = base === undefined ? undefined : packSchema.parse(base);
  const messages: Message[] = [
    {
      role: 'system',
      content: `You design motion style packs for an Arabic-first AI video studio. Reply with JSON only.\n\n${GUIDE}\n\nBuilt-in examples:\n${packIds.map((id) => `"${id}": ${JSON.stringify(packs[id])}`).join('\n')}\n\nReturn {"pack": <pack>, "notes": [string]} where notes explain your key choices, one short line each (max 6).`,
    },
    {
      role: 'user',
      content: `${basePack ? `Start from this pack and change only what the request asks:\n${JSON.stringify(basePack)}\n\n` : ''}Style request:\n${prompt.trim().slice(0, 2000)}`,
    },
  ];
  let last: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const {text} = await run({role: 'director', models: config.models.director, messages, ledger: opts.ledger, temperature: 0.7});
    let raw: unknown;
    try {
      raw = extractJson(text);
    } catch (e) {
      last = [`invalid JSON: ${(e as Error).message}`];
      messages.push({role: 'assistant', content: text.slice(0, 4000)}, {role: 'user', content: `Not valid JSON (${last[0]}). Return {"pack","notes"} JSON only.`});
      continue;
    }
    const r = z.object({pack: packSchema, notes: z.array(z.string()).default([])}).safeParse(raw);
    if (r.success) return {pack: r.data.pack, notes: r.data.notes.map((n) => n.slice(0, 200)).slice(0, 8)};
    last = issues(r.error);
    messages.push({role: 'assistant', content: JSON.stringify(raw).slice(0, 4000)}, {role: 'user', content: `Validation failed:\n- ${last.slice(0, 15).join('\n- ')}\nFix every problem and return the complete {"pack","notes"} JSON only.`});
  }
  throw new Error(`could not generate a valid style:\n- ${last.slice(0, 5).join('\n- ')}`);
};
