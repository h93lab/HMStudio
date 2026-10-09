import {z} from 'zod';
import {zColor} from '@remotion/zod-types';
import {backgroundNames, cameraModes, displayFonts, packSchema} from './design/packs';
export {displayFonts};
export type {DisplayFont} from './design/packs';

// Pure data contract shared by the Remotion code and the AI pipeline. No React imports here:
// the pipeline (Node) imports this file to validate what the models write.

export const FPS = 30;
export const TRANSITION = 18;

export const fontNames = ['IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Readex Pro', 'Almarai'] as const;

// Line icons the writer can attach to feature items (drawn on with a stroke animation).
export const iconNames = ['bolt', 'shield', 'chart', 'clock', 'globe', 'lock', 'star', 'heart', 'rocket', 'check', 'users', 'phone', 'camera', 'card', 'cloud', 'spark'] as const;

export const formats = {
  '9:16': {width: 1080, height: 1920},
  '1:1': {width: 1080, height: 1080},
  '4:5': {width: 1080, height: 1350},
  '16:9': {width: 1920, height: 1080},
} as const;
export type Format = keyof typeof formats;

export const themeSchema = z.object({
  client: z.string(),
  direction: z.enum(['rtl', 'ltr']),
  numerals: z.enum(['latn', 'arab']),
  font: z.enum(fontNames),
  displayFont: z.enum(displayFonts).describe("Title font; 'none' uses the style pack's choice."),
  logo: z.string().describe('Logo path inside public/ (e.g. clients/nova/logo.png) or https URL. Empty = text logo.'),
  colors: z.object({
    background: zColor(),
    surface: zColor(),
    primary: zColor(),
    accent: zColor(),
    text: zColor(),
    muted: zColor(),
  }),
  radius: z.number().min(0).max(80),
  glow: z.number().min(0).max(1),
  motion: z.object({
    speed: z.number().min(0.5).max(2),
    damping: z.number().min(8).max(200),
  }),
});
export type Theme = z.infer<typeof themeSchema>;

const t = (max: number) => z.string().min(1).max(max);
const captionWord = z.object({text: z.string(), startMs: z.number(), endMs: z.number()});

// Fields every scene can carry. The writer model fills `voiceover`; the pipeline fills audio/captions/duration.
const base = {
  camera: z.enum(cameraModes).optional().describe('Override the style pack camera for this scene.'),
  background: z.enum(backgroundNames).optional().describe('Override the style pack background for this scene.'),
  duration: z.number().int().min(30).max(900).describe('Frames at 30fps. The pipeline recomputes it from the voiceover length.'),
  voiceover: z.string().max(220).optional().describe('Narration spoken during this scene, in the video language. Short, punchy.'),
  audio: z.string().optional().describe('Filled by the pipeline.'),
  captions: z.array(captionWord).optional().describe('Filled by the pipeline.'),
};

// Text limits keep layouts safe: the writer gets a zod error (and retries) instead of overflowing the frame.
export const sceneSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('intro'), ...base, kicker: t(24), title: t(48), subtitle: t(90)}),
  z.object({type: z.literal('statement'), ...base, text: t(70), emphasis: z.string().max(30).describe('Exact word(s) copied from `text` to highlight; may be empty.')}),
  z.object({type: z.literal('features'), ...base, title: t(40), items: z.array(t(42)).min(2).max(4), icons: z.array(z.enum(iconNames)).max(4).optional().describe('One icon per item, same order.')}),
  z.object({type: z.literal('stat'), ...base, prefix: z.string().max(4), value: z.number().min(0).max(1e12), suffix: z.string().max(6), label: t(60)}),
  z.object({type: z.literal('quote'), ...base, quote: t(130), author: t(30), role: z.string().max(40)}),
  z.object({type: z.literal('comparison'), ...base, title: t(40), beforeLabel: t(16), before: z.array(t(34)).min(1).max(3), afterLabel: t(16), after: z.array(t(34)).min(1).max(3)}),
  z.object({type: z.literal('steps'), ...base, title: t(40), steps: z.array(t(40)).min(2).max(4)}),
  z.object({type: z.literal('chart'), ...base, title: t(44), suffix: z.string().max(6), bars: z.array(z.object({label: t(18), value: z.number().min(0)})).min(2).max(5)}),
  z.object({type: z.literal('device'), ...base, title: t(44), caption: z.string().max(70), image: z.string().describe('App screenshot path in public/ or URL; empty = animated placeholder UI.')}),
  z.object({type: z.literal('image'), ...base, title: t(48), subtitle: z.string().max(80), image: z.string().describe('Path in public/ or URL; empty = pipeline generates it from imagePrompt.'), imagePrompt: z.string().max(400).describe('English prompt for an AI background image, no text in image.')}),
  z.object({type: z.literal('video'), ...base, title: t(48), subtitle: z.string().max(80), video: z.string().describe('Clip path in public/ or URL; empty = the pipeline generates it from videoPrompt.'), image: z.string().describe('Fallback still (filled by the pipeline).'), videoPrompt: z.string().max(400).describe('English prompt for a cinematic b-roll shot, no text, no faces.')}),
  z.object({type: z.literal('logo'), ...base, name: z.string().max(30).describe('Product/brand name shown as wordmark when the theme has no logo image; empty = client name.'), tagline: z.string().max(50)}),
  z.object({type: z.literal('outro'), ...base, title: t(40), cta: t(26), url: z.string().max(40)}),
]);
export type Scene = z.infer<typeof sceneSchema>;
export type SceneType = Scene['type'];
export type CaptionWord = z.infer<typeof captionWord>;

export const videoSchema = z.object({
  theme: themeSchema,
  format: z.enum(Object.keys(formats) as [Format, ...Format[]]),
  style: z.string().min(1).max(40).describe('Style pack id: a built-in pack or a custom style id.'),
  pack: packSchema.optional().describe('Full pack embedded for custom styles so renders stay self-contained.'),
  beats: z.array(z.number()).optional().describe('Music beat frames (filled by the pipeline) for beat-synced accents.'),
  showCaptions: z.boolean(),
  music: z.string().describe('Music path inside public/, empty = none.'),
  musicVolume: z.number().min(0).max(1),
  sfx: z.boolean(),
  scenes: z.array(sceneSchema).min(1).max(14),
});
export type VideoProps = z.infer<typeof videoSchema>;

// Scenes overlap during transitions, so total = sum(durations) - overlaps.
export const totalDuration = (scenes: Pick<Scene, 'duration'>[]) =>
  scenes.reduce((sum, s) => sum + s.duration, 0) - TRANSITION * (scenes.length - 1);

// Start frame of each scene on the final timeline.
export const sceneStarts = (scenes: Pick<Scene, 'duration'>[]) => {
  const starts: number[] = [];
  let at = 0;
  for (const s of scenes) {
    starts.push(at);
    at += s.duration - TRANSITION;
  }
  return starts;
};
