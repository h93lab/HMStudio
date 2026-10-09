import {z} from 'zod';
import {chat, extractJson, type ChatFn} from './llm';
import {config} from './config';
import {languageRule, type Dialect, type Lang} from './prompts';
import type {Ledger} from './ledger';

export const HOOK_TECHNIQUES = ['painful question', 'contrarian claim', 'specific pain moment', 'before/after contrast', 'curiosity gap', 'specific number from the idea', 'POV / "you" statement', 'bold promise'];

// Deterministic cliché filter (cheap, no model): these openings read as generic ad copy.
export const CLICHES = [
  'هل تعبت', 'تعبت من', 'تخيل', 'تخيّل', 'قل وداعا', 'قل وداعاً', 'وداعاً لـ', 'وداعا ل', 'الحل الأمثل', 'الحل النهائي', 'ثورة في', 'عالم من', 'لا مثيل له', 'أفضل حل', 'بكل سهولة', 'بضغطة زر',
  'tired of', 'imagine', 'say goodbye', 'game changer', 'game-changer', 'revolutioniz', 'next level', 'seamless', 'unlock', 'elevate', 'look no further',
];
export const findCliches = (text: string) => CLICHES.filter((c) => text.toLowerCase().includes(c.toLowerCase()));

// Each hook meets `k` opponents; every pair is judged in both orders so position bias cancels out.
export const buildPairs = (n: number, k = 4): [number, number][] => {
  const pairs: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    for (let step = 1; step <= Math.min(k, n - 1); step++) {
      const j = (i + step * 3 + Math.floor(step / 2)) % n; // spread opponents without randomness (reproducible)
      if (j === i) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([i, j], [j, i]);
    }
  }
  return pairs;
};

// Bradley-Terry strengths from pairwise wins (MM iterations). Ties/inconsistent verdicts are dropped before this.
export const bradleyTerry = (n: number, wins: [number, number][], iters = 100) => {
  let p = Array(n).fill(1);
  const w = Array(n).fill(0);
  for (const [a] of wins) w[a]++;
  for (let it = 0; it < iters; it++) {
    const next = p.map((pi, i) => {
      let denom = 0;
      for (const [a, b] of wins) if (a === i || b === i) denom += 1 / (pi + p[a === i ? b : a]);
      return denom ? (w[i] + 0.1) / denom : pi; // +0.1 smoothing keeps winless hooks finite
    });
    const sum = next.reduce((s, x) => s + x, 0);
    p = next.map((x) => (x * n) / sum);
  }
  return p;
};

const hooksSchema = z.object({hooks: z.array(z.object({text: z.string().min(2).max(90), technique: z.string()})).min(2)});

export type RankedHook = {text: string; technique: string; score: number; cliches: string[]};

// Hook tournament: many candidates → cliché filter → pairwise judging in both orders → Bradley-Terry ranking.
export const hookTournament = async (p: {idea: string; brief: Record<string, unknown>; lang: Lang; dialect: Dialect; ledger?: Ledger; chatFn?: ChatFn; count?: number}): Promise<RankedHook[]> => {
  const run = p.chatFn ?? chat;
  const {text} = await run({
    role: 'hooks',
    models: config.models.writer,
    ledger: p.ledger,
    temperature: 1,
    messages: [
      {
        role: 'user',
        content: `Write ${p.count ?? 14} scroll-stopping opening hooks (max 8 words each) for a short promo video.
Idea: """${p.idea}"""
Audience: ${JSON.stringify(p.brief.audience ?? '')}. Angle: ${JSON.stringify(p.brief.angle ?? '')}.
${languageRule(p.lang, p.dialect)}
Use these techniques, at least one hook each: ${HOOK_TECHNIQUES.join('; ')}.
Never use these clichés: ${CLICHES.join(' | ')}. Never invent numbers or facts not in the idea.
JSON only: {"hooks": [{"text": string, "technique": string}]}`,
      },
    ],
  });
  const generated = hooksSchema.parse(extractJson(text)).hooks;
  const fromBrief = Array.isArray(p.brief.hookOptions) ? (p.brief.hookOptions as unknown[]).filter((h): h is string => typeof h === 'string').map((t) => ({text: t, technique: 'director'})) : [];
  const unique = [...new Map([...fromBrief, ...generated].map((h) => [h.text.trim(), h])).values()];
  const pool = unique.filter((h) => !findCliches(h.text).length).slice(0, 16);
  // Never fall back to cliché hooks: with fewer than 2 clean hooks there is nothing to rank.
  if (pool.length < 2) return pool.map((h) => ({...h, score: 1, cliches: []}));
  const pairs = buildPairs(pool.length, 4);
  const {text: verdict} = await run({
    role: 'hook-judge',
    models: config.models.judge,
    ledger: p.ledger,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You judge opening hooks for a short promo video. For each pair, pick the hook that would make a busy scroller stop and keep watching (specific, emotional, natural in its language, no clichés, true to the idea).
Idea: """${p.idea}"""
Hooks:
${pool.map((h, i) => `${i}: ${h.text}`).join('\n')}
Pairs (judge each independently):
${pairs.map(([a, b], i) => `${i}: A=${a} B=${b}`).join('\n')}
JSON only: {"winners": ["A" or "B" for each pair, in order]}`,
      },
    ],
  });
  const winners: string[] = (extractJson(verdict) as {winners?: string[]}).winners ?? [];
  // Keep only pairs where both orderings agree on the same hook.
  const byPair = new Map<string, number[]>();
  pairs.forEach(([a, b], i) => {
    const w = winners[i] === 'A' ? a : winners[i] === 'B' ? b : -1;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    byPair.set(key, [...(byPair.get(key) ?? []), w]);
  });
  const wins: [number, number][] = [];
  for (const [key, ws] of byPair) {
    const [a, b] = key.split('-').map(Number);
    if (ws.length === 2 && ws[0] === ws[1] && ws[0] >= 0) wins.push([ws[0], ws[0] === a ? b : a]);
  }
  const scores = bradleyTerry(pool.length, wins);
  // Hooks with no consistent verdict at all are unproven: rank them below every judged hook.
  const judged = new Set(wins.flat());
  return pool.map((h, i) => ({...h, score: judged.has(i) ? +scores[i].toFixed(3) : 0, cliches: []})).sort((x, y) => y.score - x.score);
};

const critiqueSchema = z.object({score: z.number().min(0).max(10), issues: z.array(z.string())});

// Script critic: rubric review + deterministic cliché scan; returns feedback for one rewrite round (empty = good enough).
export const critiqueScript = async (p: {idea: string; scenes: unknown[]; ledger?: Ledger; chatFn?: ChatFn}) => {
  const run = p.chatFn ?? chat;
  const flat = JSON.stringify(p.scenes);
  const cliches = findCliches(flat);
  const {text} = await run({
    role: 'critic',
    models: config.models.judge,
    ledger: p.ledger,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are a strict creative director reviewing a short promo storyboard before production.
Idea: """${p.idea}"""
Storyboard: ${flat}
Flag only real problems: generic claims with no specific noun or number, repeated benefits or words across scenes, weak or soft hook, missing proof, awkward or literal-translation phrasing, mixed language registers, invented facts not in the idea, CTA that is vague.
JSON only: {"score": 0-10, "issues": ["Scene N: problem → concrete rewrite"]}`,
      },
    ],
  });
  const c = critiqueSchema.parse(extractJson(text));
  const issues = [...c.issues, ...cliches.map((x) => `Remove the cliché "${x}" and say something specific instead.`)];
  return {score: c.score, issues, feedback: c.score >= 8 && !cliches.length ? '' : issues.join('\n')};
};
