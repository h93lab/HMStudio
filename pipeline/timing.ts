import {FPS, TRANSITION, sceneStarts, type CaptionWord, type Scene} from '../src/schema';

// Minimum on-screen time per scene type so animations finish and text can be read.
export const minFrames = (s: Scene): number => {
  switch (s.type) {
    case 'features': return 60 + s.items.length * 22;
    case 'steps': return 60 + s.steps.length * 22;
    case 'chart': return 70 + s.bars.length * 10;
    case 'comparison': return 110;
    case 'quote': return 90 + Math.round(s.quote.length * 0.6);
    case 'device': return 100;
    case 'logo': return 70;
    case 'outro': return 85;
    default: return 75;
  }
};

const visibleText = (s: Scene): string =>
  Object.entries(s)
    .filter(([k]) => !['type', 'voiceover', 'audio', 'captions', 'image', 'imagePrompt', 'duration'].includes(k))
    .map(([, v]) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : (x as {label?: string}).label ?? '')).join(' ') : ''))
    .join(' ');

// Without narration: enough time to read the on-screen text (~14 chars/s) plus a beat.
export const readingFrames = (s: Scene) => Math.ceil((visibleText(s).length / 14 + 1.2) * FPS);

// With narration: the voice must finish before the next transition starts eating into the scene.
export const sceneDuration = (s: Scene, voiceSeconds?: number) => {
  const base = Math.max(minFrames(s), voiceSeconds ? 0 : readingFrames(s));
  if (!voiceSeconds) return Math.min(900, base);
  return Math.min(900, Math.max(base, Math.ceil((voiceSeconds + 0.45) * FPS) + TRANSITION));
};

// Beat sync: lengthen scenes (by less than one beat) so every cut lands exactly on a music beat.
export const snapToBeats = <T extends {duration: number}>(scenes: T[], beatFrames: number[]): T[] => {
  if (beatFrames.length < 2) return scenes;
  const out = scenes.map((s) => ({...s}));
  for (let i = 0; i < out.length - 1; i++) {
    const nextStart = sceneStarts(out)[i + 1];
    const beat = beatFrames.find((b) => b >= nextStart);
    if (beat !== undefined) out[i].duration = Math.min(900, out[i].duration + (beat - nextStart));
  }
  return out;
};

// Maps STT word timings onto the script's own words (STT may normalize spelling, e.g. ة→ه).
export const alignWords = (script: string, stt: {word: string; start: number; end: number}[], durationSec: number): CaptionWord[] => {
  const words = script.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (stt.length === words.length) return words.map((w, i) => ({text: w, startMs: Math.round(stt[i].start * 1000), endMs: Math.round(stt[i].end * 1000)}));
  // Counts differ: spread the script words over the spoken span, proportional to word length.
  const from = stt.length ? stt[0].start : 0;
  const to = stt.length ? stt[stt.length - 1].end : durationSec;
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let at = from;
  return words.map((w) => {
    const len = ((w.length + 1) / total) * (to - from);
    const word = {text: w, startMs: Math.round(at * 1000), endMs: Math.round((at + len) * 1000)};
    at += len;
    return word;
  });
};
