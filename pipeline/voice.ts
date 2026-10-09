import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseMedia} from '@remotion/media-parser';
import {nodeReader} from '@remotion/media-parser/node';
import type {Scene} from '../src/schema';
import {config} from './config';
import {authHeaders} from './llm';
import {cachePath, cached, hash} from './cache';
import {alignWords, sceneDuration} from './timing';
import type {Ledger} from './ledger';

type SttWord = {word: string; start: number; end: number};

export const audioSeconds = async (file: string) => {
  const {slowDurationInSeconds} = await parseMedia({src: file, reader: nodeReader, fields: {slowDurationInSeconds: true}, acknowledgeRemotionLicense: true});
  if (!slowDurationInSeconds || slowDurationInSeconds <= 0) throw new Error(`could not read audio duration of ${file}`);
  return slowDurationInSeconds;
};

// Voice names decide the provider: Edge/Azure neural names ("ar-EG-SalmaNeural") are free and return word timings;
// anything else is an ElevenLabs voice id through OmniRoute.
export const isEdgeVoice = (voice: string) => /^[a-z]{2,3}-[A-Z]{2}-\w+Neural$/.test(voice);

const EDGE_DEFAULTS: Record<string, [string, string]> = {
  // [male, female]
  en: ['en-US-AndrewMultilingualNeural', 'en-US-AvaMultilingualNeural'],
  msa: ['ar-SA-HamedNeural', 'ar-SA-ZariyahNeural'],
  egyptian: ['ar-EG-ShakirNeural', 'ar-EG-SalmaNeural'],
  gulf: ['ar-SA-HamedNeural', 'ar-SA-ZariyahNeural'],
  levantine: ['ar-LB-RamiNeural', 'ar-LB-LaylaNeural'],
};
export const defaultVoice = (lang: string, dialect: string, gender: 'male' | 'female' = 'male') =>
  (EDGE_DEFAULTS[lang === 'en' ? 'en' : dialect] ?? EDGE_DEFAULTS.msa)[gender === 'female' ? 1 : 0];

type Synth = {file: string; words: SttWord[] | null};

const edgeSynthesize = async (text: string, voice: string, ledger?: Ledger): Promise<Synth> => {
  const key = hash('edge', voice, config.tts.edgeRate, text);
  const file = cachePath('tts', key, 'mp3');
  const meta = cachePath('tts', key, 'json');
  if (cached(file) && cached(meta)) {
    ledger?.add({role: 'tts', model: `edge/${voice}`, ok: true, ms: 0, chars: text.length, cached: true});
    return {file, words: JSON.parse(readFileSync(meta, 'utf8'))};
  }
  const {MsEdgeTTS, OUTPUT_FORMAT} = await import('msedge-tts');
  const started = Date.now();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'edge-'));
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {wordBoundaryEnabled: true});
    // msedge-tts puts the text into SSML as-is: escape XML so "Q&A" or "<" can't break (or inject into) the request.
    const ssmlSafe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let timer: NodeJS.Timeout | undefined;
    const r = await Promise.race([
      tts.toFile(dir, ssmlSafe, {rate: config.tts.edgeRate}),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('Edge TTS timed out')), 60_000))),
    ]).finally(() => clearTimeout(timer));
    const bytes = readFileSync(r.audioFilePath);
    if (bytes.length < 512) throw new Error(`Edge TTS returned ${bytes.length} bytes`);
    // Offsets are in 100ns ticks.
    const words: SttWord[] = r.metadataFilePath
      ? JSON.parse(readFileSync(r.metadataFilePath, 'utf8')).Metadata.filter((m: {Type: string}) => m.Type === 'WordBoundary').map((m: {Data: {Offset: number; Duration: number; text: {Text: string}}}) => ({word: m.Data.text.Text, start: m.Data.Offset / 1e7, end: (m.Data.Offset + m.Data.Duration) / 1e7}))
      : [];
    writeFileSync(`${meta}.tmp`, JSON.stringify(words));
    renameSync(`${meta}.tmp`, meta);
    writeFileSync(`${file}.tmp`, bytes);
    renameSync(`${file}.tmp`, file);
    ledger?.add({role: 'tts', model: `edge/${voice}`, ok: true, ms: Date.now() - started, chars: text.length});
    return {file, words};
  } catch (e) {
    ledger?.add({role: 'tts', model: `edge/${voice}`, ok: false, ms: Date.now() - started, chars: text.length, error: (e as Error).message.slice(0, 200)});
    throw e;
  } finally {
    tts.close();
    rmSync(dir, {recursive: true, force: true});
  }
};

const elevenSynthesize = async (text: string, voice: string, ledger?: Ledger): Promise<Synth> => {
  const model = config.tts.model;
  const file = cachePath('tts', hash(model, voice, text), 'mp3');
  if (cached(file)) {
    ledger?.add({role: 'tts', model, ok: true, ms: 0, chars: text.length, cached: true});
    return {file, words: null};
  }
  const started = Date.now();
  const res = await fetch(`${config.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {...authHeaders(), 'content-type': 'application/json'},
    body: JSON.stringify({model, voice, input: text, response_format: 'mp3'}),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) {
    const err = (await res.text()).slice(0, 200);
    ledger?.add({role: 'tts', model, ok: false, ms: Date.now() - started, chars: text.length, error: err});
    throw new Error(`TTS failed (${res.status}): ${err}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 512) throw new Error(`TTS returned ${bytes.length} bytes of audio`);
  writeFileSync(`${file}.tmp`, bytes);
  renameSync(`${file}.tmp`, file); // only complete audio ever lands in the cache
  ledger?.add({role: 'tts', model, ok: true, ms: Date.now() - started, chars: text.length});
  return {file, words: null};
};

export const synthesize = (text: string, voice: string, ledger?: Ledger) => (isEdgeVoice(voice) ? edgeSynthesize(text, voice, ledger) : elevenSynthesize(text, voice, ledger));

export const transcribe = async (file: string, lang: string, seconds: number, ledger?: Ledger): Promise<SttWord[]> => {
  const out = cachePath('stt', hash(file, lang), 'json');
  if (cached(out)) return JSON.parse(readFileSync(out, 'utf8'));
  const errors: string[] = [];
  for (const model of config.models.stt) {
    const started = Date.now();
    try {
      const form = new FormData();
      form.append('file', new Blob([readFileSync(file)], {type: 'audio/mpeg'}), path.basename(file));
      form.append('model', model);
      form.append('language', lang);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      const res = await fetch(`${config.baseUrl}/audio/transcriptions`, {method: 'POST', headers: authHeaders(), body: form, signal: AbortSignal.timeout(120_000)});
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
      const words: SttWord[] = (JSON.parse(body).words ?? []).map((w: SttWord) => ({word: w.word.trim(), start: w.start, end: w.end}));
      ledger?.add({role: 'stt', model, ok: true, ms: Date.now() - started, seconds});
      writeFileSync(out, JSON.stringify(words));
      return words;
    } catch (e) {
      ledger?.add({role: 'stt', model, ok: false, ms: Date.now() - started, error: (e as Error).message.slice(0, 200)});
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  // Captions are a nice-to-have: fall back to evenly spread timings instead of failing the video.
  console.warn(`  ! STT failed, using estimated caption timing (${errors.join('; ')})`);
  return [];
};

// Voices every scene that has narration, then sizes each scene to its voice. Returns new scene objects.
export const voiceScenes = async (scenes: Scene[], jobId: string, lang: string, voice: string, ledger?: Ledger, log = console.log): Promise<Scene[]> => {
  const dir = path.join(config.dirs.publicJobs, jobId);
  mkdirSync(dir, {recursive: true});
  const out: Scene[] = [];
  for (const [i, scene] of scenes.entries()) {
    const text = scene.voiceover?.trim();
    if (!text) {
      out.push({...scene, audio: undefined, captions: undefined, duration: sceneDuration(scene)});
      continue;
    }
    const {file: src, words: timed} = await synthesize(text, voice, ledger);
    const name = `vo-${hash(src)}.mp3`;
    copyFileSync(src, path.join(dir, name));
    const seconds = await audioSeconds(src);
    const words = timed?.length ? timed : await transcribe(src, lang, seconds, ledger); // Edge gives timings; others need STT
    out.push({...scene, audio: `jobs/${jobId}/${name}`, captions: alignWords(text, words, seconds), duration: sceneDuration(scene, seconds)});
    log(`  voice ${i + 1}/${scenes.length}: ${seconds.toFixed(1)}s`);
  }
  return out;
};
