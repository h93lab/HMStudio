import {z} from 'zod';
import {iconNames, sceneSchema} from '../src/schema';
import {packIds, packs} from '../src/design/packs';
import {musicPresets} from './music';

export type Lang = 'ar' | 'en';
export type Dialect = 'msa' | 'egyptian' | 'gulf' | 'levantine';

export const languageRule = (lang: Lang, dialect: Dialect) =>
  lang === 'en'
    ? 'Write all on-screen text and voiceover in natural, confident English.'
    : {
        msa: 'Write all on-screen text and voiceover in simple, modern Arabic (فصحى مبسطة) as used by top Arab tech brands. No tashkeel. Use Western digits unless the text reads better otherwise.',
        egyptian: 'Write all on-screen text and voiceover in natural Egyptian Arabic (عامية مصرية راقية) as top Egyptian brands use on social media. No tashkeel.',
        gulf: 'Write all on-screen text and voiceover in natural Gulf/Saudi Arabic (لهجة خليجية بيضاء) as top Saudi brands use on social media. No tashkeel.',
        levantine: 'Write all on-screen text and voiceover in natural Levantine Arabic (لهجة شامية) as top brands use on social media. No tashkeel.',
      }[dialect];

export const sceneCatalog = `Scene types (pick what serves the story; vary them):
- intro: kicker pill + big title + subtitle. Strong opener.
- statement: one bold sentence filling the screen, with highlighted emphasis words. Great hook or turning point.
- features: title + 2-4 short benefit cards.
- stat: one big animated number + label. ONLY with a number given in the idea.
- quote: testimonial with author. ONLY if a real testimonial is given in the idea.
- comparison: before/after (or old way vs new way) two columns with ✕ / ✓ items.
- steps: 2-4 numbered steps on a timeline ("how it works").
- chart: 2-5 animated bars. ONLY with numbers given in the idea.
- device: phone mockup showing the app (screenshot if provided, else animated UI) + title + caption.
- image: full-bleed cinematic AI background image + title. Use for mood/vision moments.
- video: full-bleed cinematic b-roll clip (AI-generated from "videoPrompt") + title. The strongest hook or mood opener; max 1 per video.
- logo: brand logo (or product-name wordmark) reveal + tagline. Usually right before the outro.
- outro: final title + CTA button + url/handle. Always the last scene.`;

export const directorPrompt = (p: {idea: string; client: string; lang: Lang; dialect: Dialect; seconds: number}) => [
  {
    role: 'system' as const,
    content:
      'You are the creative director of a top motion-design studio that makes premium short vertical promo videos (Reels, TikTok, Shorts) for tech brands in the Arab world. You think in hooks, tension and payoff. Reply with JSON only.',
  },
  {
    role: 'user' as const,
    content: `Visual style profile: ${p.client} (only the look of the video; it is NOT the brand, never mention it unless the idea does).
Idea / product info from the client:
"""${p.idea}"""

Write the creative brief for a ~${p.seconds}s video.
${languageRule(p.lang, p.dialect)}

${sceneCatalog}

Rules:
- The first 2 seconds must stop the scroll. Write 5 candidate hooks, each with a different technique (painful question, bold contrarian claim, specific pain moment, surprising before/after contrast, curiosity gap), max 8 words each, in the video language. Pick the one a busy scroller could not ignore as "hook" and build scene 1 around it. Never open with the brand name or a greeting; avoid clichés ("tired of...?", "imagine...", "say goodbye to").
- Story arc: hook → tension/problem → solution → proof/benefits → call to action. One idea per scene.
- 6 to 9 scenes. Last scene is "outro". Do not repeat the same scene type back to back.
- Never invent facts: numbers, customer names, testimonials, awards or prices only if they appear in the idea. Otherwise keep claims qualitative and do not use stat/chart/quote.
- Speak to one specific audience and one main benefit.

Pick the music mood: ${musicPresets.join(', ')}.
Pick the visual style pack that fits the brand and audience: ${packIds.map((id) => `"${id}" (${packs[id].label})`).join(', ')}.

Return JSON:
{"audience": string, "insight": string, "angle": string, "style": one of the style packs, "music": one of the music moods, "hookOptions": [5 strings], "hook": string, "tone": string, "voiceStyle": string, "cta": string,
 "scenes": [{"type": one of the scene types, "purpose": string, "keyMessage": string}]}`,
  },
];

const scenesJsonSchema = () => JSON.stringify(z.toJSONSchema(z.array(sceneSchema), {unrepresentable: 'any'}));

export const writerPrompt = (p: {idea: string; client: string; lang: Lang; dialect: Dialect; brief: unknown; screens?: string[]; noImages?: boolean}) => [
  {
    role: 'system' as const,
    content:
      'You are a senior copywriter and motion designer. You turn a creative brief into a storyboard JSON for a motion-graphics template. Every word is short, sharp and premium. Reply with JSON only.',
  },
  {
    role: 'user' as const,
    content: `Visual style profile: ${p.client} (only the look of the video; it is NOT the brand, never mention it unless the idea does).
Client idea:
"""${p.idea}"""

Creative brief:
${JSON.stringify(p.brief, null, 1)}

${languageRule(p.lang, p.dialect)}

Write the storyboard following the brief's scene plan.
Copy rules:
- Scene 1 shows the brief's "hook" as its main on-screen text, kept short (max 8 words) — do not soften or lengthen it.
- On-screen text is short and punchy (keywords, not sentences). Respect every maxLength in the schema: count characters.
- "voiceover" is what the narrator says during the scene: one natural spoken sentence of 5-14 words that complements (does not just repeat) the on-screen text. Every scene gets a voiceover except "logo" (optional).
- "emphasis" must be exact word(s) copied from "text".
- logo "name" = the product/brand name from the idea (as the brand writes it).
- features: add "icons" (one per item, same order) from: ${iconNames.join(', ')}.
- Leave "camera" and "background" out unless a scene clearly needs a different feel.
- For "video" scenes write "videoPrompt" in English (camera move + subject + light, no text, no faces) and leave "video" and "image" as "".
- "image" fields are "" (the pipeline fills them) unless screenshots are listed below. For "image" scenes write "imagePrompt" in English: a cinematic, abstract or atmospheric visual that matches the scene, no text, no logos, no faces.
${p.screens?.length ? `- Real app screenshots are available: ${JSON.stringify(p.screens)}. Use at least one "device" scene and set its "image" to one of these exact paths (a different one per device scene).\n` : ''}${p.noImages ? '- AI images are disabled for this video: do not use "image" scenes (replace them with another type).\n' : ''}- "duration" = estimated frames at 30fps (about 75-150).
- Never invent numbers, names, testimonials, prices or product features that are not in the client idea.
- Keep one consistent language register across all scenes (never mix formal and colloquial). Write natively: never translate English phrases word for word (e.g. comparison labels like "قبل / بعد" or "الطريقة القديمة / مع <product>", not "القديم مقابل طريقتنا").
- Every scene says something new: no repeated words or ideas across scenes.
- Do not include "audio" or "captions".

JSON Schema of the scenes array:
${scenesJsonSchema()}

Return JSON: {"scenes": [...]}`,
  },
];

export const revisePrompt = (p: {scenes: unknown; feedback: string; lang: Lang; dialect: Dialect}) => [
  {
    role: 'system' as const,
    content: 'You are a senior copywriter editing an existing motion-graphics storyboard. You apply client feedback precisely and change nothing else. Reply with JSON only.',
  },
  {
    role: 'user' as const,
    content: `Current storyboard scenes:
${JSON.stringify(p.scenes)}

Client feedback:
"""${p.feedback}"""

${languageRule(p.lang, p.dialect)}
Apply the feedback. Keep every scene, field and word that the feedback does not touch exactly identical.
You may add, remove or reorder scenes only if the feedback asks for it.
If the feedback is about colors or visual style, put the change in "theme" (only the changed keys, e.g. {"colors":{"primary":"#123456"}}, "glow", "radius", "motion":{"speed":1.2}), otherwise omit "theme".
Respect the same JSON schema and character limits as the current scenes. Do not include "audio" or "captions".

JSON Schema of the scenes array:
${scenesJsonSchema()}

Return JSON: {"scenes": [...], "theme"?: {...}}`,
  },
];
