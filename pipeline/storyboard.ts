import {z} from 'zod';
import {sceneSchema, type Scene} from '../src/schema';
import {chat, extractJson, type ChatFn, type Message} from './llm';
import type {Ledger} from './ledger';

const storyboardSchema = z.object({scenes: z.array(sceneSchema).min(4).max(12)});

// Validates a model's storyboard: zod schema + story rules. Small, safe problems are auto-fixed instead of retried.
// `order`: a template's scene types; when given, the storyboard must follow it exactly (the template replaces the hook rules).
export const validateStoryboard = (raw: unknown, order?: string[]): {ok: true; scenes: Scene[]} | {ok: false; errors: string[]} => {
  // Strip pipeline-owned fields a model may echo back.
  if (raw && typeof raw === 'object' && Array.isArray((raw as {scenes?: unknown}).scenes)) {
    for (const s of (raw as {scenes: Record<string, unknown>[]}).scenes) {
      if (s && typeof s === 'object') {
        delete s.audio;
        delete s.captions;
        if ((s.type === 'image' || s.type === 'device') && typeof s.image !== 'string') s.image = '';
        if (s.type === 'logo' && typeof s.name !== 'string') s.name = '';
        if (s.type === 'image' && typeof s.imagePrompt !== 'string') s.imagePrompt = 'abstract premium dark technology background, soft light, depth';
        if (typeof s.duration !== 'number') s.duration = 90;
        s.duration = Math.min(900, Math.max(30, Math.round(s.duration as number)));
      }
    }
  }
  const parsed = storyboardSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)};
  const scenes = parsed.data.scenes;
  const errors: string[] = [];
  if (order) {
    const got = scenes.map((s) => s.type);
    if (got.join(',') !== order.join(',')) errors.push(`the template requires exactly these scene types in this order: ${order.join(', ')} (got: ${got.join(', ')})`);
  } else {
    if (scenes[scenes.length - 1].type !== 'outro') errors.push('the last scene must be type "outro"');
    if (['outro', 'logo'].includes(scenes[0].type)) errors.push('the first scene must be a hook, not logo/outro');
  }
  // A counter animates and adds thousands separators: digits in prefix/suffix mean a phone number or code, not a quantity.
  scenes.forEach((s, i) => {
    if (s.type === 'stat' && /\d/.test(`${s.prefix ?? ''}${s.suffix ?? ''}`)) errors.push(`scenes.${i}: stat is for a quantity; "${s.prefix ?? ''}${s.value}${s.suffix ?? ''}" looks like a phone number or code, put it as text in a statement or the outro`);
  });
  for (let i = 1; i < scenes.length; i++) if (scenes[i].type === scenes[i - 1].type) errors.push(`scenes.${i}: same type "${scenes[i].type}" twice in a row`);
  for (const s of scenes) {
    if (s.type === 'statement' && s.emphasis) {
      const words = new Set(s.text.split(/\s+/).map((w) => w.replace(/[.,!?؟،:]/g, '')));
      if (!s.emphasis.split(/\s+/).every((w) => words.has(w.replace(/[.,!?؟،:]/g, '')))) s.emphasis = ''; // auto-fix: drop bad emphasis
    }
  }
  return errors.length ? {ok: false, errors} : {ok: true, scenes};
};

// A URL/handle on screen must come from the client, never from the model: clear any outro url not found in the idea.
export const dropInventedUrls = (scenes: Scene[], idea: string): Scene[] => {
  const known = idea.toLowerCase();
  return scenes.map((s) => (s.type === 'outro' && s.url && !known.includes(s.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) ? {...s, url: ''} : s));
};

// Asks the model, validates, and feeds validation errors back until the storyboard is valid (or attempts run out).
export const requestStoryboard = async (p: {messages: Message[]; models: string[]; role: string; ledger?: Ledger; attempts?: number; chatFn?: ChatFn; validate?: (raw: unknown) => ReturnType<typeof validateStoryboard>; temperature?: number}) => {
  const run = p.chatFn ?? chat;
  const validate = p.validate ?? validateStoryboard;
  const messages = [...p.messages];
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= (p.attempts ?? 3); attempt++) {
    const {text, model} = await run({role: p.role, models: p.models, messages, ledger: p.ledger, temperature: p.temperature ?? 0.8});
    let raw: unknown;
    try {
      raw = extractJson(text);
    } catch (e) {
      lastErrors = [`invalid JSON: ${(e as Error).message}`];
      messages.push({role: 'assistant', content: text.slice(0, 4000)}, {role: 'user', content: `Your reply was not valid JSON (${lastErrors[0]}). Return the complete JSON only.`});
      continue;
    }
    const result = validate(raw);
    if (result.ok) return {scenes: result.scenes, model, attempts: attempt, raw};
    lastErrors = result.errors;
    messages.push(
      {role: 'assistant', content: JSON.stringify(raw)},
      {role: 'user', content: `The JSON failed validation:\n- ${result.errors.slice(0, 20).join('\n- ')}\nFix every problem (shorten texts that are too long) and return the complete corrected JSON only.`},
    );
  }
  throw new Error(`storyboard still invalid after retries:\n- ${lastErrors.join('\n- ')}`);
};
