import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {ROOT, config} from './config';
import {makeBrief} from './director';
import {requestStoryboard} from './storyboard';
import {directorPrompt, writerPrompt} from './prompts';
import {chat, extractJson} from './llm';
import {Ledger} from './ledger';
import {cachePath, cached, hash} from './cache';
import {clientDefaults} from './render';

const judgeSchema = z.object({hook: z.number(), copy: z.number(), structure: z.number(), language: z.number(), overall: z.number(), note: z.string()});

const judge = async (idea: string, scenes: unknown, ledger: Ledger) => {
  const {text} = await chat({
    role: 'judge',
    models: config.models.judge,
    ledger,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Grade this storyboard for a premium short promo video as a strict creative director. Idea: """${idea}"""
Storyboard: ${JSON.stringify(scenes)}
Score 0-10 each: hook (stops the scroll in 2s?), copy (punchy, premium, natural), structure (hook→problem→solution→proof→CTA), language (correct, natural ${/[؀-ۿ]/.test(idea) ? 'Arabic' : 'English'}), overall. Penalize invented facts not in the idea.
JSON only: {"hook":n,"copy":n,"structure":n,"language":n,"overall":n,"note":"one sentence"}`,
      },
    ],
  });
  return judgeSchema.parse(extractJson(text));
};

// Optional second opinion from TypeSafe Jev (set TYPESAFE_API_KEY); probabilities 0-1, averaged into one score.
const jev = async (idea: string, scenes: unknown): Promise<number | null> => {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  const q = (instructions: string) => ({type: 'noul', instructions, criteria: {true: 'Yes', false: 'No'}});
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {Authorization: `Bearer ${key}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      model: 'jev-latest',
      state: {idea, storyboard: scenes},
      questions: {
        hook: q('Does the first scene of `storyboard` open with a scroll-stopping hook (sharp question, bold claim, pain point)?'),
        copy: q('Is the copy in `storyboard` short, premium and natural for a top tech brand?'),
        arc: q('Does `storyboard` follow hook → problem → solution → proof/benefits → call to action?'),
        facts: q('Does `storyboard` avoid inventing numbers, names or testimonials that are not in `idea`?'),
      },
    }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const answers = (await res.json()).answers as Record<string, {noul: number}>;
  const vals = Object.values(answers).map((a) => a.noul);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

// Compares writer models on fixed ideas: validity, retries, speed, tokens, and judged quality.
export const bench = async (opts: {writers: string[]; limit: number}) => {
  const ideas: {client: string; idea: string}[] = JSON.parse(readFileSync(path.join(ROOT, 'bench', 'ideas.json'), 'utf8')).slice(0, opts.limit);
  const ledger = new Ledger();
  const rows: Record<string, unknown>[] = [];
  for (const [n, {client, idea}] of ideas.entries()) {
    const theme = (await clientDefaults(client)).theme;
    const lang = /[؀-ۿ]/.test(idea) ? 'ar' : 'en';
    // Same brief for every writer so only the writer varies.
    // Keyed by the director prompt text too, so prompt changes are actually measured.
    const briefFile = cachePath('bench', hash('brief', JSON.stringify(directorPrompt({idea, client: theme.client, lang, dialect: 'msa', seconds: 30})), config.models.director.join()), 'json');
    const brief = cached(briefFile) ? JSON.parse(readFileSync(briefFile, 'utf8')) : (await makeBrief({idea, client: theme.client, lang, dialect: 'msa', seconds: 30, ledger})).brief;
    writeFileSync(briefFile, JSON.stringify(brief));
    for (const writer of opts.writers) {
      const before = ledger.entries.length;
      const started = Date.now();
      const row: Record<string, unknown> = {idea: n + 1, writer};
      try {
        const sb = await requestStoryboard({role: 'writer', models: [writer], messages: writerPrompt({idea, client: theme.client, lang, dialect: 'msa', brief}), ledger});
        const calls = ledger.entries.slice(before).filter((e) => e.role === 'writer');
        Object.assign(row, {ok: true, attempts: sb.attempts, seconds: (Date.now() - started) / 1000, tokens: calls.reduce((t, e) => t + (e.promptTokens ?? 0) + (e.completionTokens ?? 0), 0)});
        const grade = await judge(idea, sb.scenes, ledger).catch(() => null);
        Object.assign(row, grade ?? {}, {jev: await jev(idea, sb.scenes)});
      } catch (e) {
        Object.assign(row, {ok: false, error: (e as Error).message.split('\n')[0].slice(0, 120), seconds: (Date.now() - started) / 1000});
      }
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  const summary = opts.writers.map((w) => {
    const r = rows.filter((x) => x.writer === w);
    const ok = r.filter((x) => x.ok);
    const avg = (k: string) => (ok.length ? +(ok.reduce((s, x) => s + ((x[k] as number) ?? 0), 0) / ok.length).toFixed(2) : null);
    const jevs = ok.map((x) => x.jev).filter((x): x is number => typeof x === 'number');
    return {writer: w, valid: `${ok.length}/${r.length}`, avgAttempts: avg('attempts'), avgSeconds: avg('seconds'), avgTokens: avg('tokens'), overall: avg('overall'), hook: avg('hook'), copy: avg('copy'), language: avg('language'), jev: jevs.length ? +(jevs.reduce((a, b) => a + b, 0) / jevs.length).toFixed(2) : null};
  });
  const dir = path.join(ROOT, 'bench', 'results');
  mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({writers: opts.writers, judge: config.models.judge, rows, summary, cost: ledger.summary()}, null, 2));
  console.table(summary);
  console.log(`results → ${file}`);
  return {summary, file, exists: existsSync(file)};
};
