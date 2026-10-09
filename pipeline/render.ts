import {mkdirSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {sceneStarts, TRANSITION, type Theme, type VideoProps} from '../src/schema';
import {ROOT} from './config';

let serveUrl: Promise<string> | null = null;

// One bundle per process. public/ is symlinked, so voice/images written after bundling are still served.
export const getBundle = () =>
  (serveUrl ??= bundle({entryPoint: path.join(ROOT, 'src', 'index.ts'), symlinkPublicDir: true, enableCaching: true, onProgress: () => undefined}));

export const listClients = async () => {
  const {getCompositions} = await import('@remotion/renderer');
  const comps = await getCompositions(await getBundle());
  return comps.filter((c) => c.id.startsWith('Promo-')).map((c) => ({id: c.id.slice('Promo-'.length), theme: (c.props as VideoProps).theme}));
};

// The client's profile (saved from the Studio into Root.tsx) is the source of truth for theme + defaults.
export const clientDefaults = async (client: string): Promise<VideoProps> => {
  const comp = await selectComposition({serveUrl: await getBundle(), id: `Promo-${client}`, inputProps: {}}).catch(() => null);
  if (!comp) {
    const ids = (await listClients()).map((c) => c.id).join(', ');
    throw new Error(`unknown client "${client}". Available: ${ids}. Add one in the Studio (right-click a Promo composition → Duplicate).`);
  }
  return comp.props as VideoProps;
};

export const renderVideo = async (compositionId: string, props: VideoProps, outFile: string, onProgress?: (p: number) => void) => {
  const serve = await getBundle();
  const composition = await selectComposition({serveUrl: serve, id: compositionId, inputProps: props});
  mkdirSync(path.dirname(outFile), {recursive: true});
  let last = -1;
  await renderMedia({
    serveUrl: serve,
    composition,
    inputProps: props,
    codec: 'h264',
    crf: 18,
    audioBitrate: '192k',
    outputLocation: outFile,
    onProgress: ({progress}) => {
      const pct = Math.floor(progress * 20);
      if (pct !== last) {
        last = pct;
        onProgress?.(progress);
      }
    },
  });
  masterAudio(outFile);
  return {outFile, frames: composition.durationInFrames, seconds: composition.durationInFrames / composition.fps};
};

// Social-ready loudness: EBU R128 loudnorm to -14 LUFS / -1.5 dBTP; the video stream is copied untouched.
export const masterAudio = (file: string) => {
  const tmp = file.replace(/\.mp4$/, '.master.mp4');
  try {
    execFileSync(path.join(ROOT, 'node_modules', '.bin', 'remotion'), ['ffmpeg', '-v', 'error', '-y', '-i', file, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp], {cwd: ROOT, stdio: 'pipe'});
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, {force: true});
    console.warn(`  ! audio mastering skipped: ${(e as Error).message.split('\n')[0].slice(0, 120)}`);
  }
};

// One still per scene, taken after every entrance has settled and before the exit zoom/transition (what QA should judge).
export const stillFrame = (start: number, duration: number) => start + Math.max(Math.min(duration - 1, TRANSITION + 12), duration - TRANSITION - 4);

export const renderStills = async (compositionId: string, props: VideoProps, dir: string, scale = 0.5) => {
  const serve = await getBundle();
  const composition = await selectComposition({serveUrl: serve, id: compositionId, inputProps: props});
  mkdirSync(dir, {recursive: true});
  const starts = sceneStarts(props.scenes);
  const files: string[] = [];
  const warnings: string[][] = [];
  for (const [i, scene] of props.scenes.entries()) {
    const found = new Set<string>();
    const frame = Math.min(composition.durationInFrames - 1, stillFrame(starts[i], scene.duration));
    const output = path.join(dir, `scene-${String(i + 1).padStart(2, '0')}-${scene.type}.jpg`);
    await renderStill({serveUrl: serve, composition, inputProps: props, frame, output, imageFormat: 'jpeg', jpegQuality: 85, scale, logLevel: 'error', onBrowserLog: ({text}) => text.startsWith('[QA]') && found.add(text.slice(5))});
    files.push(output);
    warnings.push([...found]);
  }
  return Object.assign(files, {warnings});
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]!);

// Self-contained review page per version: video + a card per scene (still, on-screen text, voiceover).
export const writeReviewPage = (p: {file: string; title: string; theme: Theme; video?: string; stills: string[]; props: VideoProps; notes?: string[]}) => {
  const rel = (f: string) => path.relative(path.dirname(p.file), f);
  const cards = p.props.scenes
    .map((s, i) => {
      const {type, voiceover, audio, captions, duration, ...rest} = s;
      void audio;
      void captions;
      const texts = Object.entries(rest)
        .filter(([k, v]) => !['image', 'imagePrompt'].includes(k) && v !== '')
        .map(([k, v]) => `<div><b>${esc(k)}</b> ${esc(typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v))}</div>`)
        .join('');
      return `<article><img src="${esc(rel(p.stills[i] ?? ''))}" loading="lazy"><div class="meta"><span class="tag">${i + 1} · ${esc(type)} · ${(duration / 30).toFixed(1)}s</span>${texts}${voiceover ? `<p class="vo" dir="auto">🎙 ${esc(voiceover)}</p>` : ''}</div></article>`;
    })
    .join('\n');
  const html = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title>
<style>
:root{--bg:${p.theme.colors.background};--fg:#eef0f8;--muted:#9aa0b8;--accent:${p.theme.colors.accent}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;padding:24px 16px}
main{max-width:1100px;margin:auto}h1{margin:0 0 4px;font-size:22px}.sub{color:var(--muted);margin:0 0 20px}
video{width:100%;max-width:420px;border-radius:14px;display:block;margin:0 auto 24px;background:#000}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
article{background:#ffffff0d;border:1px solid #ffffff1a;border-radius:14px;overflow:hidden}
article img{width:100%;display:block}.meta{padding:12px;display:grid;gap:4px}.meta b{color:var(--muted);font-weight:500;margin-inline-end:6px}
.tag{color:var(--accent);font-weight:700}.vo{margin:6px 0 0;color:var(--fg);opacity:.85}
ul{color:var(--muted)}
</style></head><body><main><h1>${esc(p.title)}</h1><p class="sub">${esc(p.theme.client)} · ${p.props.scenes.length} scenes · ${p.props.format}</p>
${p.video ? `<video src="${esc(rel(p.video))}" poster="${esc(rel(p.stills[0] ?? ''))}" controls playsinline></video>` : ''}
${p.notes?.length ? `<ul>${p.notes.map((n) => `<li dir="auto">${esc(n)}</li>`).join('')}</ul>` : ''}
<section class="grid">${cards}</section></main></body></html>`;
  writeFileSync(p.file, html);
  return p.file;
};
