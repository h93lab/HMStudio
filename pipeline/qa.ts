import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {totalDuration, type VideoProps} from '../src/schema';
import {chat, extractJson, type ChatFn} from './llm';
import {config} from './config';
import type {Ledger} from './ledger';

// WCAG contrast of two hex/rgb colors (null when a color can't be parsed, e.g. named colors).
const rgbOf = (c: string): [number, number, number] | null => {
  const h = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (h) {
    const x = h.length === 3 ? h.split('').map((k) => k + k).join('') : h;
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = c.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const luminance = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a: string, b: string) => {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return null;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
};

// Cheap deterministic checks that run on every version.
export const checkProps = (props: VideoProps): string[] => {
  const notes: string[] = [];
  const {colors} = props.theme;
  const textC = contrast(colors.text, colors.background);
  const mutedC = contrast(colors.muted, colors.background);
  if (textC !== null && textC < 4.5) notes.push(`low contrast: text on background is ${textC}:1 (needs 4.5:1)`);
  if (mutedC !== null && mutedC < 3) notes.push(`low contrast: secondary text on background is ${mutedC}:1 (needs 3:1)`);
  const seconds = totalDuration(props.scenes) / 30;
  if (seconds < 12) notes.push(`video is short (${seconds.toFixed(1)}s)`);
  if (seconds > 75) notes.push(`video is long (${seconds.toFixed(1)}s) for social; consider trimming`);
  if (props.scenes[props.scenes.length - 1]?.type !== 'outro') notes.push('last scene is not an outro/CTA');
  props.scenes.forEach((s, i) => {
    if (s.type === 'image' && !s.image) notes.push(`scene ${i + 1}: image missing (gradient fallback used)`);
    if (s.voiceover && !s.audio) notes.push(`scene ${i + 1}: voiceover text but no audio`);
    if (s.voiceover && s.audio) {
      const wps = s.voiceover.split(/\s+/).length / Math.max(0.1, s.duration / 30);
      if (wps > 3.4) notes.push(`scene ${i + 1}: narration is dense (${wps.toFixed(1)} words/s)`);
    }
  });
  return notes;
};

export const qaSchema = z.object({
  droppedDirectionClaims: z.number().optional(),
  score: z.number().min(0).max(10),
  issues: z.array(z.object({scene: z.number(), severity: z.enum(['high', 'medium', 'low']), problem: z.string(), fix: z.string()})),
});
export type QaReport = z.infer<typeof qaSchema>;

// A vision model reviews the stills like a senior motion designer would before client delivery.
export const visualQa = async (stills: string[], props: VideoProps, ledger?: Ledger, chatFn: ChatFn = chat, measured: string[] = []): Promise<QaReport> => {
  const content: Extract<Parameters<ChatFn>[0]['messages'][number]['content'], unknown[]> = [
    {
      type: 'text',
      text: `You are a senior motion designer doing final QA on a ${props.format} promo video for "${props.theme.client}" (${props.theme.direction === 'rtl' ? 'Arabic, right-to-left' : 'left-to-right'}). Below is one still per scene, in order, plus the storyboard.
Check each still for: text cut off or overflowing, overlapping elements, unreadable contrast, broken Arabic letters or wrong word order, awkward or unnatural copy, typos, empty or unbalanced composition, inconsistent style.
In right-to-left layouts the reading start is the RIGHT side: bullets, icons, checkmarks and step numbers placed to the right of Arabic text are correct, not a defect. A Latin word inside an Arabic phrase sits at the left end of that phrase: correct bidi, not reversed text. Captions at the bottom are burned-in subtitles shown a few words at a time: partial sentences there are expected, not a defect. A product/brand name that differs from the client name can be correct (the client is the agency profile).
${measured.length ? `Measured layout facts (from the renderer, trust these over your eyes): ${measured.join(' | ')}.` : 'The renderer measured no overflow or tiny text.'} Do not report text overflow, cut-off text or reading direction unless it is unmistakable; focus on aesthetics, hierarchy, copy quality and brand fit.
Be strict but only report real, visible problems. Score 10 = ready for a premium client.
Storyboard: ${JSON.stringify(props.scenes.map(({audio, captions, ...s}) => (void audio, void captions, s)))}
Return JSON only: {"score": 0-10, "issues": [{"scene": <1-based number>, "severity": "high"|"medium"|"low", "problem": string, "fix": string (concrete copy or layout change)}]}`,
    },
    ...stills.map((f) => ({type: 'image_url' as const, image_url: {url: `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`}})),
  ];
  const {text} = await chatFn({role: 'vision-qa', models: config.models.vision, messages: [{role: 'user', content}], ledger, temperature: 0.2, maxTokens: 3000});
  return dropDirectionClaims(qaSchema.parse(extractJson(text)), props.theme.direction === 'rtl');
};

// Vision models keep "seeing" RTL layouts as wrong (icons/bullets/alignment on the "wrong" side) even when told not to.
// The engine lays RTL out in code, so for RTL brands those claims are dropped deterministically.
// Only layout-side claims; genuine 'reversed text' or broken-joining findings are kept.
const DIRECTION_CLAIM = /(placed|positioned|located|are|is|sits?) (on|to) the (left|right)( side)?|left[- ]aligned|right[- ]aligned|aligned to the (left|right)|(left|right) side of the (text|items?|list|card|box)|text alignment|should be on the right/i;
export const dropDirectionClaims = (report: QaReport, rtl: boolean): QaReport => {
  if (!rtl) return report;
  const kept = report.issues.filter((i) => !DIRECTION_CLAIM.test(`${i.problem} ${i.fix}`));
  const dropped = report.issues.length - kept.length;
  // Dropped claims were the reason for a lower score, so give back up to one point per dropped high/medium issue.
  const restored = report.issues.filter((i) => DIRECTION_CLAIM.test(`${i.problem} ${i.fix}`) && i.severity !== 'low').length;
  return {score: Math.min(10, report.score + Math.min(restored, 2)), issues: kept, ...(dropped ? {droppedDirectionClaims: dropped} : {})};
};

// Turns QA findings into revision feedback for the writer (text-level fixes only; layout is handled by the engine).
export const qaFeedback = (report: QaReport) =>
  report.issues
    .filter((i) => i.severity !== 'low')
    .map((i) => `Scene ${i.scene}: ${i.problem} → ${i.fix}`)
    .join('\n');
