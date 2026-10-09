import {existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, copyFileSync} from 'node:fs';
import path from 'node:path';
import type {Scene, Theme} from '../src/schema';
import {config} from './config';
import {authHeaders} from './llm';
import {cachePath, cached, hash} from './cache';
import type {Ledger} from './ledger';

const styleSuffix = (theme: Theme, portrait: boolean) =>
  `Premium cinematic motion-graphics background, dark moody lighting, subtle glow in ${theme.colors.primary} and ${theme.colors.accent}, high detail, shallow depth of field, ${portrait ? 'vertical 9:16 composition with calm empty lower half for text' : 'wide composition'}. Absolutely no text, letters, logos or watermarks.`;

export const generateImage = async (prompt: string, ledger?: Ledger): Promise<string> => {
  const key = hash(config.models.image.join(','), prompt);
  const file = cachePath('img', key, 'img');
  if (cached(file)) return file;
  const errors: string[] = [];
  for (const model of config.models.image) {
    const started = Date.now();
    try {
      const res = await fetch(`${config.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {...authHeaders(), 'content-type': 'application/json'},
        body: JSON.stringify({model, prompt, n: 1}),
        signal: AbortSignal.timeout(180_000),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
      const item = JSON.parse(body).data?.[0];
      let bytes: Buffer | null = item?.b64_json ? Buffer.from(item.b64_json, 'base64') : null;
      if (!bytes && item?.url) {
        const img = await fetch(item.url, {signal: AbortSignal.timeout(60_000)});
        if (!img.ok) throw new Error(`image download HTTP ${img.status}`);
        bytes = Buffer.from(await img.arrayBuffer());
      }
      if (!bytes?.length || !isImage(bytes)) throw new Error('response is not an image');
      writeFileSync(`${file}.tmp`, bytes);
      renameSync(`${file}.tmp`, file);
      ledger?.add({role: 'image', model, ok: true, ms: Date.now() - started, images: 1});
      return file;
    } catch (e) {
      ledger?.add({role: 'image', model, ok: false, ms: Date.now() - started, error: (e as Error).message.slice(0, 200)});
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.join('; '));
};

// JPEG / PNG / WEBP magic bytes: never cache an HTML error page as an "image".
const isImage = (b: Buffer) => (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(8, 12).toString() === 'WEBP';

const ext = (file: string) => {
  const b = readFileSync(file).subarray(0, 4);
  return b[0] === 0x89 ? 'png' : b[0] === 0x52 ? 'webp' : 'jpg';
};

const isMp4 = (b: Buffer) => b.subarray(4, 8).toString() === 'ftyp';

// Text-to-video through OmniRoute (long timeout). Returns a cached mp4 path; throws if every model fails.
export const generateVideo = async (prompt: string, portrait: boolean, ledger?: Ledger): Promise<string> => {
  const file = cachePath('vid', hash(config.models.video.join(','), prompt, String(portrait)), 'mp4');
  if (cached(file)) return file;
  // A failed prompt is not retried for 24h: each attempt can block for up to 10 minutes.
  const failed = `${file}.failed`;
  if (existsSync(failed) && Date.now() - statSync(failed).mtimeMs < 86_400_000) throw new Error('video generation failed recently for this prompt (retry after 24h)');
  const errors: string[] = [];
  for (const model of config.models.video) {
    const started = Date.now();
    try {
      const res = await fetch(`${config.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {...authHeaders(), 'content-type': 'application/json'},
        body: JSON.stringify({model, prompt, aspect_ratio: portrait ? '9:16' : '16:9', duration: 5}),
        signal: AbortSignal.timeout(600_000),
      });
      const body = Buffer.from(await res.arrayBuffer());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.toString().slice(0, 120)}`);
      let bytes: Buffer | null = isMp4(body) ? body : null;
      if (!bytes) {
        const item = JSON.parse(body.toString()).data?.[0];
        if (item?.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
        else if (item?.url) {
          const v = await fetch(item.url, {signal: AbortSignal.timeout(120_000)});
          if (!v.ok) throw new Error(`video download HTTP ${v.status}`);
          bytes = Buffer.from(await v.arrayBuffer());
        }
      }
      if (!bytes || !isMp4(bytes)) throw new Error('response is not an mp4');
      writeFileSync(`${file}.tmp`, bytes);
      renameSync(`${file}.tmp`, file);
      ledger?.add({role: 'video', model, ok: true, ms: Date.now() - started, seconds: 5});
      return file;
    } catch (e) {
      ledger?.add({role: 'video', model, ok: false, ms: Date.now() - started, error: (e as Error).message.slice(0, 200)});
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  if (errors.length) writeFileSync(failed, errors.join('\n'));
  throw new Error(errors.join('; ') || 'no video model configured (MOTION_VIDEO)');
};

// Fills empty `image` fields of image scenes with AI art. A failed image falls back to the brand gradient, never fails the video.
export const illustrateScenes = async (scenes: Scene[], jobId: string, theme: Theme, portrait: boolean, ledger?: Ledger, log = console.log): Promise<Scene[]> => {
  const dir = path.join(config.dirs.publicJobs, jobId);
  mkdirSync(dir, {recursive: true});
  const out: Scene[] = [];
  for (const scene of scenes) {
    // Video scenes: generated clip if a video model works, else an AI still shown as a "living image".
    if (scene.type === 'video' && !scene.video) {
      if (config.models.video.length) {
        try {
          const src = await generateVideo(`${scene.videoPrompt}. Cinematic, smooth camera move, no text, no logos, no faces.`, portrait, ledger);
          const name = `vid-${hash(src)}.mp4`;
          copyFileSync(src, path.join(dir, name));
          out.push({...scene, video: `jobs/${jobId}/${name}`});
          log(`  video clip: ${name}`);
          continue;
        } catch (e) {
          console.warn(`  ! video generation failed, using a living still: ${(e as Error).message.slice(0, 140)}`);
        }
      }
      if (scene.image) {
        out.push(scene);
        continue;
      }
      try {
        const src = await generateImage(`${scene.videoPrompt}. ${styleSuffix(theme, portrait)}`, ledger);
        const name = `img-${hash(src)}.${ext(src)}`;
        copyFileSync(src, path.join(dir, name));
        out.push({...scene, image: `jobs/${jobId}/${name}`});
        log(`  still for video scene: ${name}`);
      } catch (e) {
        console.warn(`  ! image generation failed, using gradient: ${(e as Error).message.slice(0, 160)}`);
        out.push(scene);
      }
      continue;
    }
    if (scene.type !== 'image' || scene.image) {
      out.push(scene);
      continue;
    }
    try {
      const src = await generateImage(`${scene.imagePrompt}. ${styleSuffix(theme, portrait)}`, ledger);
      const name = `img-${hash(src)}.${ext(src)}`;
      copyFileSync(src, path.join(dir, name));
      out.push({...scene, image: `jobs/${jobId}/${name}`});
      log(`  image: ${name}`);
    } catch (e) {
      console.warn(`  ! image generation failed, using gradient: ${(e as Error).message.slice(0, 160)}`);
      out.push(scene);
    }
  }
  return out;
};
