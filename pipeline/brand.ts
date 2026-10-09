import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {Scene, Theme} from '../src/schema';
import {chat, extractJson, type ChatFn} from './llm';
import {config} from './config';
import type {Ledger} from './ledger';
import {contrast} from './qa';

// URL → brand: facts (for grounded copy), logo and colors, from the client's own website.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const meta = (html: string, key: string) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) if ((attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase() === key) return attr(tag, 'content');
  return undefined;
};

export const visibleText = (html: string) =>
  html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Saturated colors used on the page (inline CSS + <style>), most frequent first; greys/near-black/near-white skipped.
export const brandColors = (html: string): string[] => {
  const counts = new Map<string, number>();
  const css = [...(html.match(/<style\b[\s\S]*?<\/style>/gi) ?? []), ...(html.match(/style="[^"]*"/gi) ?? [])].join(' ');
  // Brand-usable colors only: saturated, not near-black, not near-white.
  const usable = (raw: string) => {
    let hex = raw.toLowerCase();
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    return sat < 0.35 || max < 0.25 || min > 0.92 ? null : `#${hex}`;
  };
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const c = usable(m[1]);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const theme = meta(html, 'theme-color')?.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
  const tc = theme ? usable(theme) : null;
  if (tc) counts.set(tc, (counts.get(tc) ?? 0) + 100); // the site's declared brand color wins when it is a real color
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
};

// Logo candidates in priority order: <img> with "logo" in it, apple-touch-icon, svg icon, og:image.
export const logoCandidates = (html: string, base: string): string[] => {
  const abs = (u?: string) => {
    try {
      return u ? new URL(u, base).href : undefined;
    } catch {
      return undefined;
    }
  };
  const imgs = (html.match(/<img\b[^>]*>/gi) ?? []).filter((t) => /logo/i.test(t)).map((t) => abs(attr(t, 'src')));
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const touch = links.filter((t) => /apple-touch-icon/i.test(attr(t, 'rel') ?? '')).map((t) => abs(attr(t, 'href')));
  const svgIcon = links.filter((t) => /icon/i.test(attr(t, 'rel') ?? '') && /\.svg/i.test(attr(t, 'href') ?? '')).map((t) => abs(attr(t, 'href')));
  return [...new Set([...imgs, ...touch, ...svgIcon, abs(meta(html, 'og:image'))].filter((u): u is string => !!u && !u.startsWith('data:')))];
};

export const isImageBytes = (b: Buffer) => {
  if ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(8, 12).toString() === 'WEBP') return true;
  const text = b.toString('utf8');
  // SVG logos are text: refuse any that could run script.
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?<svg/i.test(text.slice(0, 600)) && !/<script|\son\w+\s*=|<foreignObject|javascript:/i.test(text);
};

// Only public internet hosts: the scraper must not be pointed at this machine or the LAN (SSRF).
const isPrivateIp = (ip: string) =>
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:127.');
export const assertPublicUrl = async (raw: string) => {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error(`only http(s) URLs are allowed: ${raw}`);
  const {lookup} = await import('node:dns/promises');
  const addrs = await lookup(url.hostname, {all: true});
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`refusing to fetch a private/local address: ${url.hostname}`);
  return url;
};

export const factsSchema = z.object({
  brandName: z.string(),
  oneLiner: z.string(),
  audience: z.string(),
  // Long lists are trimmed, never rejected: losing all facts over a 9th feature would be worse.
  features: z.array(z.string()).transform((a) => a.slice(0, 8)),
  numbers: z.array(z.object({value: z.coerce.string(), meaning: z.string()})).transform((a) => a.slice(0, 10)),
  prices: z.array(z.coerce.string()).transform((a) => a.slice(0, 6)),
  tone: z.string(),
  cta: z.string(),
});
export type Facts = z.infer<typeof factsSchema>;

export const fetchBrand = async (url: string, jobId: string, ledger?: Ledger, chatFn: ChatFn = chat) => {
  await assertPublicUrl(url);
  const res = await fetch(url, {headers: {'user-agent': UA, accept: 'text/html'}, signal: AbortSignal.timeout(20_000), redirect: 'follow'});
  await assertPublicUrl(res.url); // a redirect must not land on a private address either
  if (!res.ok) throw new Error(`could not read ${url} (HTTP ${res.status})`);
  const html = (await res.text()).slice(0, 2_000_000);
  const text = visibleText(html).slice(0, 7000);
  const site = {title: html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim(), description: meta(html, 'description') ?? meta(html, 'og:description'), name: meta(html, 'og:site_name')};
  const {text: reply} = await chatFn({
    role: 'brand',
    models: config.models.writer,
    ledger,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Extract verified brand facts from this website. Use ONLY what the page states; never guess numbers or prices.
URL: ${url}
Title: ${site.title ?? ''} | Name: ${site.name ?? ''} | Description: ${site.description ?? ''}
Page text:
"""${text}"""
JSON only: {"brandName": string, "oneLiner": string, "audience": string, "features": [string], "numbers": [{"value": string exactly as written, "meaning": string}], "prices": [string], "tone": string, "cta": string}`,
      },
    ],
  });
  const facts = factsSchema.parse(extractJson(reply));
  // Logo: first candidate that downloads as a real image.
  let logo: string | undefined;
  for (const candidate of logoCandidates(html, res.url).slice(0, 5)) {
    try {
      await assertPublicUrl(candidate);
      const r = await fetch(candidate, {headers: {'user-agent': UA}, signal: AbortSignal.timeout(15_000)});
      const bytes = Buffer.from(await r.arrayBuffer());
      if (!r.ok || bytes.length < 200 || !isImageBytes(bytes)) continue;
      const ext = bytes[0] === 0x89 ? 'png' : bytes[0] === 0xff ? 'jpg' : bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : 'svg';
      const dir = path.join(config.dirs.publicJobs, jobId);
      mkdirSync(dir, {recursive: true});
      writeFileSync(path.join(dir, `brand-logo.${ext}`), bytes);
      logo = `jobs/${jobId}/brand-logo.${ext}`;
      break;
    } catch {
      // try the next candidate
    }
  }
  return {facts, colors: brandColors(html), logo, url: res.url};
};

// Verified facts appended to the idea, so director/writer/guards all ground on them.
export const factsBlock = (facts: Facts, url: string) =>
  `\n\nVerified facts from ${url} (use only these numbers and prices):\n- ${facts.brandName}: ${facts.oneLiner}\n- Audience: ${facts.audience}\n- Features: ${facts.features.join('; ')}\n${facts.numbers.length ? `- Numbers: ${facts.numbers.map((n) => `${n.value} (${n.meaning})`).join('; ')}\n` : ''}${facts.prices.length ? `- Prices: ${facts.prices.join('; ')}\n` : ''}- Tone: ${facts.tone}\n- CTA: ${facts.cta}\n- Website: ${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

// Applies site colors only when they stay visible on the theme background (contrast ≥ 3:1); otherwise keeps the profile's.
export const brandTheme = (theme: Theme, colors: string[], logo?: string): Theme => {
  const visible = colors.filter((c) => (contrast(c, theme.colors.background) ?? 0) >= 3);
  return {
    ...theme,
    ...(logo && !theme.logo ? {logo} : {}),
    colors: {...theme.colors, ...(visible[0] ? {primary: visible[0]} : {}), ...(visible[1] ? {accent: visible[1]} : {})},
  };
};

// Normalizes Arabic-Indic digits so "٧٠" and "70" compare equal.
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

// Any number shown on screen (2+ digits, or stat/chart values) must appear in the sources (idea + site facts).
export const findInventedNumbers = (scenes: Scene[], sources: string): string[] => {
  const known = new Set((latinDigits(sources).replace(/[,٬]/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  const found = new Set<string>();
  const check = (n: number | string) => {
    const v = String(Number(latinDigits(String(n)).replace(/[,٬]/g, '')));
    if (v !== 'NaN' && !known.has(v)) found.add(v);
  };
  for (const s of scenes) {
    if (s.type === 'stat') check(s.value);
    if (s.type === 'chart') s.bars.forEach((b) => check(b.value));
    const {type, duration, audio, captions, voiceover, image, video, imagePrompt, videoPrompt, url, ...rest} = s as Record<string, unknown>;
    void type, void duration, void audio, void captions, void voiceover, void image, void video, void imagePrompt, void videoPrompt, void url; // prompts/paths are not on-screen claims
    for (const m of latinDigits(JSON.stringify(rest)).replace(/[,٬]/g, '').matchAll(/(?<![\w.])\d{2,}(?:\.\d+)?/g)) check(m[0]);
  }
  return [...found];
};
