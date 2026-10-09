import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

// Load .env (KEY=VALUE lines) without overriding variables already set in the shell.
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Model choice per AI role. Priority: dashboard settings (settings.json) > env var > built-in default.
// Read on every access (cached by mtime), so a change in the dashboard applies to the very next call.
export const ROLE_DEFAULTS = {
  director: {env: 'MOTION_DIRECTOR', label: 'Creative director (hook, angle, style, music)', models: ['mimotp/mimo-v2.5-pro', 'antigravity/gemini-3.1-pro-high', 'ds/deepseek-flash']},
  writer: {env: 'MOTION_WRITER', label: 'Writer (storyboard, hooks, revisions, site facts)', models: ['ds/deepseek-flash', 'mimotp/mimo-v2.5-pro', 'groq/openai/gpt-oss-120b', 'cerebras/qwen-3.8-27b']},
  judge: {env: 'MOTION_JUDGE', label: 'Judge (hook tournament, script critic, bench)', models: ['mimotp/mimo-v2.5-pro', 'antigravity/gemini-3.1-pro-high']},
  vision: {env: 'MOTION_VISION', label: 'Visual QA (reviews stills)', models: ['antigravity/gemini-3.1-pro-high', 'auto/best-vision']},
  image: {env: 'MOTION_IMAGE', label: 'Image generation', models: ['antigravity/gemini-3.1-flash-image']},
  video: {env: 'MOTION_VIDEO', label: 'Video generation (b-roll; empty = living still)', models: [] as string[]},
  stt: {env: 'MOTION_STT', label: 'Speech-to-text (only for non-Edge voices)', models: ['groq/whisper-large-v3', 'groq/whisper-large-v3-turbo']},
} as const;
export type Role = keyof typeof ROLE_DEFAULTS;

export const settingsFile = path.join(ROOT, 'settings.json');
export type Settings = {models?: Partial<Record<Role, string[]>>; voice?: string; voiceRate?: string};
let cache: {mtime: number; data: Settings} | null = null;
export const readSettings = (): Settings => {
  try {
    const mtime = statSync(settingsFile).mtimeMs;
    if (!cache || cache.mtime !== mtime) cache = {mtime, data: JSON.parse(readFileSync(settingsFile, 'utf8'))};
    return cache.data;
  } catch {
    return {};
  }
};

export const modelsFor = (role: Role): string[] => {
  const fromSettings = readSettings().models?.[role];
  if (fromSettings?.length) return fromSettings;
  const env = process.env[ROLE_DEFAULTS[role].env];
  if (env !== undefined) return env.split(',').map((x) => x.trim()).filter(Boolean);
  return [...ROLE_DEFAULTS[role].models];
};

export const config = {
  baseUrl: process.env.OMNIROUTE_BASE_URL ?? 'https://api.h93lab.com/v1',
  apiKey: () => {
    const key = process.env.OMNIROUTE_API_KEY;
    if (!key) throw new Error('OMNIROUTE_API_KEY is not set (export it in your shell or put it in .env)');
    return key;
  },
  models: {
    get director() { return modelsFor('director'); },
    get writer() { return modelsFor('writer'); },
    get judge() { return modelsFor('judge'); },
    get vision() { return modelsFor('vision'); },
    get stt() { return modelsFor('stt'); },
    get image() { return modelsFor('image'); },
    get video() { return modelsFor('video'); },
  },
  tts: {
    // ElevenLabs (via OmniRoute) is used only when a non-Edge voice id is chosen, e.g. --voice pNInz6obpgDQGcFmaJgB.
    model: process.env.MOTION_TTS_MODEL ?? 'elevenlabs/eleven_multilingual_v2',
    // Default narrator; empty = Edge/Azure neural voice picked from language + dialect + gender.
    get voice() { return readSettings().voice ?? process.env.MOTION_VOICE ?? ''; },
    get edgeRate() { return readSettings().voiceRate || process.env.MOTION_VOICE_RATE || '+6%'; },
  },
  dirs: {
    jobs: path.join(ROOT, 'jobs'),
    publicJobs: path.join(ROOT, 'public', 'jobs'),
    cache: path.join(ROOT, '.cache'),
  },
};
