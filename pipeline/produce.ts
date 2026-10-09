import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {FPS, TRANSITION, formats, totalDuration, videoSchema, type Format, type Scene, type Theme, type VideoProps} from '../src/schema';
import {ROOT, config} from './config';
import {makeBrief} from './director';
import {critiqueScript, hookTournament} from './hooks';
import {brandTheme, factsBlock, fetchBrand, findInventedNumbers} from './brand';
import {isStyleId, resolvePack} from './styles';
import {packIds} from '../src/design/packs';
import {dropInventedUrls, requestStoryboard, validateStoryboard} from './storyboard';
import {revisePrompt, writerPrompt, type Dialect, type Lang} from './prompts';
import {defaultVoice, voiceScenes} from './voice';
import {audioReport, beatsOfFile, makeTrack, musicPresets, presetBpm, type MusicPreset} from './music';
import {snapToBeats} from './timing';
import {illustrateScenes} from './images';
import {clientDefaults, renderStills, renderVideo, writeReviewPage} from './render';
import {checkProps, qaFeedback, visualQa} from './qa';
import {Ledger} from './ledger';
import {jobDir, ledgerFile, loadJob, loadProps, newJobId, saveJob, saveProps, versionDir, type Job, type Version} from './jobs';

export type BuildOptions = {voice: boolean; images: boolean; music: boolean; captions: boolean; video: boolean; qa: boolean; qaFix: boolean};
// Creative options only `make` uses (hook tournament, script critic, A/B variants).
export type CreativeOptions = {hooks: boolean; critic: boolean; variants: number; style?: string; musicChoice?: string; url?: string; brandTheme?: boolean; template?: {id: string; scenes: {type: string; seconds: number}[]}};

const log = (msg: string) => console.log(msg);

// The narrator of a job: recorded voice, else (jobs made before Edge voices) the ElevenLabs voice its ledger shows, else the dialect default.
const jobVoice = (job: Job) => {
  if (job.voice) return job.voice;
  if (config.tts.voice) return config.tts.voice;
  // Legacy jobs: reuse the most recent narrator in the ledger, then pin it so every later line matches.
  const ledger = existsSync(ledgerFile(job.id)) ? readFileSync(ledgerFile(job.id), 'utf8').trim().split('\n') : [];
  const lastTts = ledger.reverse().map((l) => JSON.parse(l) as {role: string; model: string; ok: boolean}).find((e) => e.role === 'tts' && e.ok);
  const voice = lastTts?.model.startsWith('edge/') ? lastTts.model.slice(5) : lastTts?.model.startsWith('elevenlabs/') ? 'pNInz6obpgDQGcFmaJgB' : defaultVoice(job.lang, job.dialect);
  saveJob({...loadJob(job.id), voice});
  job.voice = voice;
  return voice;
};
const progress = (label: string) => (p: number) => process.stdout.write(`\r  ${label} ${Math.round(p * 100)}%   `);

// Scenes as the writer sees them: no pipeline-owned fields.
const editable = (scenes: Scene[]) => scenes.map(({audio, captions, ...s}) => (void audio, void captions, s));

// Models may invent image paths; keep only real assets (public/ files or URLs), clear the rest.
const realImages = (scenes: Scene[]): Scene[] =>
  scenes.map((s) => {
    const real = (p: string) => !p || /^https?:\/\//.test(p) || existsSync(path.join(ROOT, 'public', p));
    if ((s.type === 'device' || s.type === 'image') && !real(s.image)) return {...s, image: ''};
    if (s.type === 'video') return {...s, image: real(s.image) ? s.image : '', video: real(s.video) ? s.video : ''};
    return s;
  });

const deepMerge = <T>(base: T, patch: unknown): T => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return (patch ?? base) as T;
  const out: Record<string, unknown> = {...(base as Record<string, unknown>)};
  for (const [k, v] of Object.entries(patch)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
};

// Assets → props → stills → QA → (optional auto-fix) → video → review page. Each call creates one new version.
const lastPack = (job: Job) => {
  const last = job.versions.at(-1);
  try {
    return last ? loadProps(job.id, last.v).pack : undefined;
  } catch {
    return undefined;
  }
};

const buildVersion = async (job: Job, scenes: Scene[], theme: Theme, opts: BuildOptions, ledger: Ledger, meta: {feedback?: string; models: Record<string, string>; variant?: string; critic?: {score: number; issues: string[]}}): Promise<Version> => {
  const defaults = await clientDefaults(job.client);
  const v = (job.versions.at(-1)?.v ?? 0) + 1;
  const portrait = formats[job.format].height > formats[job.format].width;
  log(`\n▸ v${v}: assets`);
  const voice = jobVoice(job);
  let built = opts.voice ? await voiceScenes(scenes, job.id, job.lang, voice, ledger, log) : scenes.map((s) => ({...s, audio: undefined, captions: undefined}));
  if (!opts.voice) {
    const {sceneDuration} = await import('./timing');
    built = built.map((s) => ({...s, duration: sceneDuration(s)}));
  }
  if (opts.images) built = await illustrateScenes(built, job.id, theme, portrait, ledger, log);
  // Music: a generated track (exact beat grid) or the client's own file (beats detected), then cuts snap to beats.
  let music = '';
  let beats: number[] | undefined;
  if (opts.music && job.music !== 'none') {
    const choice = job.music || defaults.music;
    const own = choice && !musicPresets.includes(choice as MusicPreset) ? choice : '';
    if (own && existsSync(path.join(ROOT, 'public', own))) {
      const b = beatsOfFile(path.join(ROOT, 'public', own));
      built = snapToBeats(built, b.beats.map((t) => Math.round(t * FPS)));
      music = own;
      beats = b.beats.map((t) => Math.round(t * FPS));
      log(`  music: ${own} (${b.bpm} bpm detected)`);
    } else {
      const preset = (musicPresets.includes(choice as MusicPreset) ? choice : 'tech-pulse') as MusicPreset;
      const beatLen = 60 / presetBpm(preset);
      built = snapToBeats(built, Array.from({length: 400}, (_, k) => Math.round(k * beatLen * FPS)));
      const track = makeTrack(preset, totalDuration(built) / FPS + 1, job.id);
      music = track.file;
      beats = track.beats.map((t) => Math.round(t * FPS));
      log(`  music: ${preset} (${track.bpm} bpm, cuts on the beat)`);
    }
  }
  const styleId: string = job.style ?? defaults.style;
  const props: VideoProps = videoSchema.parse({
    ...defaults,
    theme,
    style: styleId,
    // Custom styles are embedded so renders stay self-contained; if the style was deleted since, keep the last version's pack.
    pack: (packIds as readonly string[]).includes(styleId) ? undefined : (resolvePack(styleId) ?? lastPack(job)),
    format: job.format,
    showCaptions: opts.captions,
    music,
    beats,
    sfx: opts.music,
    scenes: built,
  });
  saveProps(job.id, v, props);
  const dir = versionDir(job.id, v);
  log(`▸ v${v}: stills`);
  const stills = await renderStills(`Promo-${job.client}`, props, path.join(dir, 'stills'));
  const measured = stills.warnings.flatMap((w, i) => w.map((x) => `scene ${i + 1}: ${x}`));
  const version: Version = {v, createdAt: new Date().toISOString(), feedback: meta.feedback, variant: meta.variant, critic: meta.critic, models: meta.models, notes: [...checkProps(props), ...measured], videos: {}};
  if (opts.qa) {
    try {
      log(`▸ v${v}: visual QA`);
      version.qa = await visualQa(stills, props, ledger, undefined, measured);
      log(`  QA score ${version.qa.score}/10, ${version.qa.issues.length} issue(s)`);
    } catch (e) {
      version.notes.push(`visual QA unavailable: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  job.versions.push(version);
  saveJob(job);
  // One automatic revision round when QA finds real problems; the human still approves the result.
  const autoFix = opts.qaFix && version.qa && version.qa.score < 8 ? qaFeedback(version.qa) : '';
  if (opts.video && !autoFix) {
    log(`▸ v${v}: rendering video`);
    const out = path.join(dir, `video-${job.format.replace(':', 'x')}.mp4`);
    const r = await renderVideo(`Promo-${job.client}`, props, out, progress('render'));
    process.stdout.write('\n');
    version.videos[job.format] = path.relative(jobDir(job.id), r.outFile);
    log(`  ${r.seconds.toFixed(1)}s video → ${r.outFile}`);
    version.notes.push(...audioNotes(r.outFile));
  }
  const video = version.videos[job.format] ? path.join(jobDir(job.id), version.videos[job.format]) : undefined;
  const notes = [...version.notes, ...(version.qa ? [`QA ${version.qa.score}/10`, ...version.qa.issues.map((i) => `[${i.severity}] scene ${i.scene}: ${i.problem}`)] : [])];
  version.review = path.relative(jobDir(job.id), writeReviewPage({file: path.join(dir, 'review.html'), title: `${job.client} — v${v}`, theme, video, stills, props, notes}));
  saveJob(job);
  if (autoFix) {
    log(`▸ v${v}: auto-fixing QA findings → v${v + 1}`);
    try {
      return await revise(job.id, autoFix, {...opts, qaFix: false}, ledger);
    } catch (e) {
      // The fix is a bonus: if it fails, deliver this version as a finished video instead of failing the job.
      console.warn(`  ! auto-fix failed (${(e as Error).message.split('\n')[0]}), finishing v${v}`);
      return finishVideo(job.id, v, opts);
    }
  }
  return version;
};

// Final-mix check: loudness in a sane range for social (about -16…-10 dB RMS) and no clipping.
const audioNotes = (file: string): string[] => {
  try {
    const a = audioReport(file);
    const notes = [`audio: ${a.rmsDb} dB RMS, peak ${a.peakDb} dB`];
    if (a.clippedSamples > 50) notes.push(`audio clipping: ${a.clippedSamples} samples at full scale`);
    if (a.rmsDb < -26) notes.push('audio is quiet: raise music volume or check narration');
    return notes;
  } catch {
    return [];
  }
};

// Renders the mp4 for an existing version (used when an auto-fix round fails).
const finishVideo = async (id: string, v: number, opts: BuildOptions) => {
  const job = loadJob(id);
  const version = job.versions.find((x) => x.v === v)!;
  if (opts.video) {
    const out = path.join(versionDir(id, v), `video-${job.format.replace(':', 'x')}.mp4`);
    await renderVideo(`Promo-${job.client}`, loadProps(id, v), out, progress('render'));
    process.stdout.write('\n');
    version.videos[job.format] = path.relative(jobDir(id), out);
    saveJob(job);
  }
  return version;
};

export type MakeInput = {idea: string; client: string; lang: Lang; dialect: Dialect; format: Format; seconds: number; screens?: string[]; logo?: string; clips?: string[]; narrator?: string; gender?: 'male' | 'female'} & BuildOptions & CreativeOptions;

// Copies a client file (screenshot, logo) into public/jobs/<id>/ so the renderer can serve it.
const importAsset = (id: string, file: string, name: string) => {
  if (!existsSync(file)) throw new Error(`file not found: ${file}`);
  const dir = path.join(config.dirs.publicJobs, id);
  mkdirSync(dir, {recursive: true});
  const target = `${name}${path.extname(file).toLowerCase() || '.png'}`;
  copyFileSync(file, path.join(dir, target));
  return `jobs/${id}/${target}`;
};

export const make = async (input: MakeInput) => {
  const defaults = await clientDefaults(input.client); // fail fast on unknown client
  const job: Job = {id: newJobId(input.idea), ...(input.template ? {template: input.template.id} : {}), idea: input.idea, client: input.client, lang: input.lang, dialect: input.dialect, format: input.format, seconds: input.seconds, voice: input.narrator || config.tts.voice || defaultVoice(input.lang, input.dialect, input.gender), createdAt: new Date().toISOString(), versions: []};
  saveJob(job);
  const ledger = new Ledger(ledgerFile(job.id));
  const screens = (input.screens ?? []).map((f, i) => importAsset(job.id, f, `screen-${i + 1}`));
  const clips = (input.clips ?? []).map((f, i) => importAsset(job.id, f, `clip-${i + 1}`));
  let theme = input.logo ? {...defaults.theme, logo: importAsset(job.id, input.logo, 'logo')} : defaults.theme;
  log(`job ${job.id}`);
  // Everything downstream (director, hooks, writer, critic, number guard) grounds on idea + verified site facts.
  let idea = input.idea;
  if (input.url) {
    try {
      log(`▸ reading ${input.url}`);
      const brand = await fetchBrand(input.url, job.id, ledger);
      idea += factsBlock(brand.facts, brand.url);
      job.url = brand.url;
      job.facts = brand.facts;
      theme = input.brandTheme ? brandTheme(theme, brand.colors, brand.logo) : brand.logo && !theme.logo ? {...theme, logo: brand.logo} : theme;
      log(`  ${brand.facts.brandName}: ${brand.facts.features.length} features, ${brand.facts.numbers.length} numbers${brand.logo ? ', logo' : ''}${input.brandTheme && brand.colors.length ? `, colors ${brand.colors.slice(0, 2).join(' ')}` : ''}`);
      saveJob(job);
    } catch (e) {
      log(`  ! could not read the site (${(e as Error).message.slice(0, 120)}), continuing with the idea only`);
    }
  }
  log('▸ creative brief');
  const {brief, model: directorModel} = await makeBrief({...input, idea, client: defaults.theme.client, ledger});
  job.brief = brief;
  saveJob(job);
  job.images = input.images;
  const directorStyle = typeof brief.style === 'string' && isStyleId(brief.style) ? brief.style : undefined;
  job.style = input.style ?? directorStyle ?? defaults.style;
  job.music = input.musicChoice ?? (musicPresets.includes(brief.music as MusicPreset) ? (brief.music as string) : undefined);
  log(`  style: ${job.style} · music: ${job.music ?? 'profile default'}`);
  if (input.hooks) {
    try {
      log('▸ hook tournament');
      const ranked = await hookTournament({idea, brief, lang: input.lang, dialect: input.dialect, ledger});
      job.hooks = ranked.slice(0, 6).map(({text, technique, score}) => ({text, technique, score}));
      if (ranked[0]) brief.hook = ranked[0].text;
    } catch (e) {
      log(`  ! hook tournament failed, keeping the director's hook (${(e as Error).message.split('\n')[0].slice(0, 100)})`);
    }
  }
  saveJob(job);
  log(`  hook: ${brief.hook}\n▸ storyboard`);
  const order = input.template?.scenes.map((x) => x.type);
  const validate = (raw: unknown) => validateStoryboard(raw, order);
  let sb = await requestStoryboard({role: 'writer', models: config.models.writer, messages: writerPrompt({...input, idea, client: defaults.theme.client, brief, screens, noImages: !input.images, template: input.template}), ledger, validate});
  let critic: {score: number; issues: string[]} | undefined;
  if (input.critic) {
    try {
      log('▸ script critic');
      const c = await critiqueScript({idea, scenes: sb.scenes, ledger});
      critic = {score: c.score, issues: c.issues};
      log(`  critic ${c.score}/10${c.feedback ? `, rewriting (${c.issues.length} note${c.issues.length > 1 ? 's' : ''})` : ''}`);
      if (c.feedback) {
        sb = await requestStoryboard({role: 'writer', models: config.models.writer, messages: revisePrompt({scenes: sb.scenes, feedback: c.feedback, lang: input.lang, dialect: input.dialect}), ledger, temperature: 0.4, validate});
      }
    } catch (e) {
      log(`  ! critic skipped (${(e as Error).message.split('\n')[0].slice(0, 100)})`);
    }
  }
  // Grounding guard: numbers on screen that are not in the idea or the site facts go back to the writer once.
  const invented = findInventedNumbers(sb.scenes, idea);
  if (invented.length) {
    log(`  ! numbers not in the sources: ${invented.join(', ')} → rewriting`);
    try {
      sb = await requestStoryboard({role: 'writer', models: config.models.writer, messages: revisePrompt({scenes: sb.scenes, feedback: `Remove or replace these numbers, they are not in the client's facts: ${invented.join(', ')}. Use only numbers that appear in: ${idea}`, lang: input.lang, dialect: input.dialect}), ledger, temperature: 0.2, validate});
    } catch (e) {
      log(`  ! grounding rewrite failed (${(e as Error).message.split('\n')[0].slice(0, 80)})`);
    }
  }
  // Only real files may be used as images; anything else is cleared so the pipeline fills or falls back.
  let clipIndex = 0;
  const scenes = dropInventedUrls(sb.scenes, idea).map((s) =>
    s.type === 'video' ? {...s, image: '', video: clips[clipIndex++] ?? ''} : (s.type === 'device' || s.type === 'image') && s.image && !screens.includes(s.image) ? {...s, image: ''} : s,
  );
  log(`  ${sb.scenes.length} scenes by ${sb.model} (${sb.attempts} attempt${sb.attempts > 1 ? 's' : ''})`);
  let version = await buildVersion(job, scenes, theme, input, ledger, {models: {director: directorModel, writer: sb.model}, critic});
  // A/B pack: same body, different opening hook (unchanged lines reuse the voice cache, so each variant is cheap).
  const extra = (loadJob(job.id).hooks ?? []).slice(1, Math.max(1, input.variants));
  for (const h of extra) {
    log(`\n▸ variant: ${h.text}`);
    version = await revise(job.id, `A/B variant. Replace the opening hook of scene 1 (its main on-screen text and its voiceover) with exactly this hook: "${h.text}". Keep every other scene and field identical.`, {...input, qaFix: false}, ledger, h.text);
  }
  return {job: loadJob(job.id), version, cost: ledger.summary()};
};

export const revise = async (id: string, feedback: string, opts: BuildOptions, ledger = new Ledger(ledgerFile(id)), variant?: string) => {
  const job = loadJob(id);
  const last = job.versions.at(-1);
  if (!last) throw new Error(`job ${id} has no versions yet`);
  const current = loadProps(id, last.v);
  log(`▸ revising v${last.v}: ${feedback.split('\n')[0].slice(0, 100)}`);
  let theme = current.theme;
  const sb = await requestStoryboard({
    role: 'revise',
    models: config.models.writer,
    messages: revisePrompt({scenes: editable(current.scenes), feedback, lang: job.lang, dialect: job.dialect}),
    ledger,
    temperature: 0.3,
    validate: (raw) => {
      const patch = (raw as {theme?: unknown})?.theme;
      theme = patch ? deepMerge(current.theme, patch) : current.theme; // only the accepted attempt's patch counts
      return validateStoryboard(raw);
    },
  });
  const themeOk = videoSchema.shape.theme.safeParse(theme);
  if (!themeOk.success) theme = current.theme;
  // Hand-edited fields (locked in the editor) survive AI revisions, client-comment revisions included.
  const locked = (last.locks ?? []).reduce<Scene[]>((scenes, ptr) => {
    const m = ptr.match(/^\/scenes\/(\d+)(\/\w+)$/);
    const i = m ? Number(m[1]) : -1;
    if (!m || !scenes[i] || !current.scenes[i] || scenes[i].type !== current.scenes[i].type) return scenes;
    return scenes.map((s, k) => (k === i ? (applyLocks(current.scenes[i] as Record<string, unknown>, s as Record<string, unknown>, [m[2]]) as Scene) : s));
  }, sb.scenes);
  const version = await buildVersion(job, realImages(dropInventedUrls(locked, `${job.idea}\n${feedback}`)), theme, opts, ledger, {feedback, models: {writer: sb.model}, variant});
  if (last.locks?.length) {
    const j = loadJob(id);
    const nv = j.versions.find((x) => x.v === version.v);
    if (nv) nv.locks = last.locks;
    saveJob(j);
  }
  return version;
};

// Same approved storyboard, another aspect ratio (no new AI calls).
export const reformat = async (id: string, format: Format, v?: number) => {
  const job = loadJob(id);
  const version = v ? job.versions.find((x) => x.v === v) : job.versions.at(-1);
  if (!version) throw new Error(`job ${id} has no version ${v ?? ''}`);
  const props = {...loadProps(id, version.v), format};
  const out = path.join(versionDir(id, version.v), `video-${format.replace(':', 'x')}.mp4`);
  log(`▸ rendering v${version.v} as ${format}`);
  await renderVideo(`Promo-${job.client}`, props, out, progress('render'));
  process.stdout.write('\n');
  version.videos[format] = path.relative(jobDir(id), out);
  saveJob(job);
  return out;
};


// ── Editor support ────────────────────────────────────────────────────────────

// Field paths the owner edited by hand, e.g. "/scenes/2/title". AI edits never overwrite them.
export type Locks = string[];

const getPath = (obj: unknown, ptr: string) => ptr.split('/').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
const setPath = (obj: Record<string, unknown>, ptr: string, value: unknown) => {
  const keys = ptr.split('/').slice(1);
  if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return; // never touch prototypes
  let o: Record<string, unknown> = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
};

// Restores every locked field from `before` into `after` (used after any AI rewrite).
export const applyLocks = <T extends Record<string, unknown>>(before: T, after: T, locks: Locks): T => {
  const out = structuredClone(after);
  for (const ptr of locks) {
    const v = getPath(before, ptr);
    if (v !== undefined) setPath(out, ptr, structuredClone(v));
  }
  return out;
};

// Manual save from the editor: validates, re-voices only changed lines (cache makes the rest free),
// keeps manual durations that are locked, refreshes stills + review page. No AI writing, no mp4 (render is separate).
export const saveManual = async (id: string, edited: VideoProps, locks: Locks, note = 'manual edit') => {
  const job = loadJob(id);
  const parsed = videoSchema.safeParse(edited);
  if (!parsed.success) throw new Error(parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const before = job.versions.at(-1) ? loadProps(id, job.versions.at(-1)!.v) : undefined;
  // Built-in style: no embedded pack. Custom style: embed it (re-resolved when the editor switched style) so the version stays self-contained.
  const builtIn = (packIds as readonly string[]).includes(parsed.data.style);
  const props = {...parsed.data, pack: builtIn ? undefined : before?.style === parsed.data.style && parsed.data.pack ? parsed.data.pack : resolvePack(parsed.data.style) ?? parsed.data.pack};
  const ledger = new Ledger(ledgerFile(id));
  // Unchanged narration keeps its existing audio + captions + timing; only new or edited lines are voiced.
  const prev = before?.scenes ?? [];
  const recorded = new Map(prev.filter((s) => s.voiceover && s.audio).map((s) => [s.voiceover!.trim(), s]));
  const fresh = props.scenes.map((s) => {
    const old = s.voiceover ? recorded.get(s.voiceover.trim()) : undefined;
    return old ? {...s, audio: old.audio, captions: old.captions} : {...s, audio: undefined, captions: undefined}; // edited text: stale audio must go
  });
  const toVoice = fresh.map((s, i) => (s.voiceover && !s.audio ? i : -1)).filter((i) => i >= 0);
  const voicedPart = toVoice.length ? await voiceScenes(toVoice.map((i) => fresh[i]), id, job.lang, jobVoice(job), ledger, () => undefined) : [];
  const voiced = fresh.map((s, i) => (toVoice.includes(i) ? voicedPart[toVoice.indexOf(i)] : s));
  // Locked (hand-set) durations win, but never shorter than the narration needs; new voice lines size their scene.
  const scenes = voiced.map((s, i) => (locks.includes(`/scenes/${i}/duration`) ? {...s, duration: Math.max(props.scenes[i].duration, toVoice.includes(i) ? s.duration : 30)} : toVoice.includes(i) ? s : {...s, duration: props.scenes[i].duration}));
  // Narration must never be cut: a scene keeps at least its voice length + the outgoing transition.
  const safe = scenes.map((s) => {
    const lastMs = s.captions?.length ? s.captions[s.captions.length - 1].endMs : 0;
    return lastMs ? {...s, duration: Math.max(s.duration, Math.ceil((lastMs / 1000 + 0.3) * FPS) + TRANSITION)} : s;
  });
  const illustrated = job.images === false ? safe : await illustrateScenes(safe, id, props.theme, formats[props.format].height > formats[props.format].width, ledger, () => undefined);
  // Generated music is re-synthesized to the new length so it never loops back to its intro; beats follow.
  let music = props.music;
  let beats = props.beats;
  if (job.music && musicPresets.includes(job.music as MusicPreset) && props.music.startsWith(`jobs/${id}/music-`)) {
    const track = makeTrack(job.music as MusicPreset, totalDuration(illustrated) / FPS + 1, id);
    music = track.file;
    beats = track.beats.map((t) => Math.round(t * FPS));
  }
  const next: VideoProps = {...props, music, beats, scenes: illustrated};
  const v = (job.versions.at(-1)?.v ?? 0) + 1;
  saveProps(id, v, next);
  const stills = await renderStills(`Promo-${job.client}`, next, path.join(versionDir(id, v), 'stills'));
  const measured = stills.warnings.flatMap((w, i) => w.map((x) => `scene ${i + 1}: ${x}`));
  const version: Version = {v, createdAt: new Date().toISOString(), feedback: note, models: {}, notes: [...checkProps(next), ...measured], videos: {}, locks: locks.filter((l) => /^\/scenes\/\d+\/\w+$/.test(l))};
  version.review = path.relative(jobDir(id), writeReviewPage({file: path.join(versionDir(id, v), 'review.html'), title: `${job.client} — v${v}`, theme: next.theme, stills, props: next, notes: version.notes}));
  job.versions.push(version);
  job.format = next.format;
  saveJob(job);
  return {version, props: next};
};

// AI rewrite of ONE scene from an instruction; locked fields of that scene are restored afterwards.
export const rewriteScene = async (id: string, props: VideoProps, index: number, instruction: string, locks: Locks) => {
  const job = loadJob(id);
  const scene = props.scenes[index];
  if (!scene) throw new Error(`scene ${index + 1} does not exist`);
  const ledger = new Ledger(ledgerFile(id));
  const {scenes: rewritten} = await requestStoryboard({
    role: 'rewrite-scene',
    models: config.models.writer,
    ledger,
    temperature: 0.6,
    messages: revisePrompt({
      scenes: editable(props.scenes),
      feedback: `Rewrite ONLY scene ${index + 1} (type "${scene.type}") following this instruction: ${instruction}\nReturn all scenes; every other scene must stay byte-identical.`,
      lang: job.lang,
      dialect: job.dialect,
    }),
  });
  const candidate = rewritten[index]?.type === scene.type ? rewritten[index] : rewritten.find((s) => s.type === scene.type);
  if (!candidate) throw new Error('the model did not return a scene of the same type');
  const sceneLocks = locks.filter((l) => l.startsWith(`/scenes/${index}/`)).map((l) => l.replace(`/scenes/${index}`, ''));
  const merged = applyLocks(scene as Record<string, unknown>, {...candidate, duration: scene.duration, audio: scene.audio, captions: scene.captions} as Record<string, unknown>, sceneLocks) as Scene;
  return merged;
};

// Renders a given version (default latest) to mp4 in the job's format and refreshes its review page.
export const renderVersion = async (id: string, v?: number) => {
  const job = loadJob(id);
  const version = v ? job.versions.find((x) => x.v === v) : job.versions.at(-1);
  if (!version) throw new Error(`job ${id} has no version ${v ?? ''}`);
  const props = loadProps(id, version.v);
  const out = path.join(versionDir(id, version.v), `video-${props.format.replace(':', 'x')}.mp4`);
  log(`▸ rendering v${version.v}`);
  await renderVideo(`Promo-${job.client}`, props, out, progress('render'));
  process.stdout.write('\n');
  version.videos[props.format] = path.relative(jobDir(id), out);
  const stillsDir = path.join(versionDir(id, version.v), 'stills');
  const stills = existsSync(stillsDir) ? (await import('node:fs')).readdirSync(stillsDir).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(stillsDir, f)) : [];
  version.review = path.relative(jobDir(id), writeReviewPage({file: path.join(versionDir(id, version.v), 'review.html'), title: `${job.client} — v${version.v}`, theme: props.theme, video: out, stills, props, notes: version.notes}));
  saveJob(job);
  return out;
};
