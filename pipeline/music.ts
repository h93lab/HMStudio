import {mkdirSync, writeFileSync, readFileSync, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {cachePath, cached, hash} from './cache';
import {ROOT, config} from './config';

// Royalty-free generative music: synthesized in code, so every track is original, sized to the exact
// video length, and its beat grid is known exactly (beat sync needs no detection).

export const musicPresets = ['tech-pulse', 'cinematic', 'upbeat-pop', 'minimal', 'lofi'] as const;
export type MusicPreset = (typeof musicPresets)[number];

const SR = 44100;
type Chord = number[]; // MIDI notes
const m = (n: number) => 440 * 2 ** ((n - 69) / 12);

type Preset = {bpm: number; chords: Chord[]; swing: number; kick: 'four' | 'half' | 'boom' | 'none'; clap: boolean; hats: 'eighth' | 'sixteenth' | 'offbeat' | 'none'; bass: 'pulse' | 'root' | 'none'; pad: number; arp: number; piano: number; pump: number; vinyl: number; brightness: number};

// Chords: Am F C G (i–VI–III–VII) for tech/cinematic; C G Am F for pop; Fmaj7 Em7 Dm7 Cmaj7 for lofi/minimal.
const minorProg: Chord[] = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const popProg: Chord[] = [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
const jazzProg: Chord[] = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];

const PRESETS: Record<MusicPreset, Preset> = {
  'tech-pulse': {bpm: 112, chords: minorProg, swing: 0, kick: 'four', clap: true, hats: 'offbeat', bass: 'pulse', pad: 0.5, arp: 0.35, piano: 0, pump: 0.6, vinyl: 0, brightness: 0.55},
  cinematic: {bpm: 84, chords: minorProg, swing: 0, kick: 'boom', clap: false, hats: 'none', bass: 'root', pad: 0.8, arp: 0.18, piano: 0.25, pump: 0, vinyl: 0, brightness: 0.35},
  'upbeat-pop': {bpm: 122, chords: popProg, swing: 0, kick: 'four', clap: true, hats: 'eighth', bass: 'pulse', pad: 0.3, arp: 0.45, piano: 0.2, pump: 0.45, vinyl: 0, brightness: 0.7},
  minimal: {bpm: 96, chords: jazzProg, swing: 0, kick: 'half', clap: false, hats: 'eighth', bass: 'root', pad: 0.35, arp: 0, piano: 0.55, pump: 0.2, vinyl: 0, brightness: 0.45},
  lofi: {bpm: 82, chords: jazzProg, swing: 0.16, kick: 'half', clap: true, hats: 'eighth', bass: 'root', pad: 0.4, arp: 0, piano: 0.5, pump: 0.25, vinyl: 0.5, brightness: 0.3},
};

export const presetBpm = (p: MusicPreset) => PRESETS[p].bpm;

// Small deterministic PRNG so the same preset + seed + length always renders the same audio (cacheable).
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

export const synthesize = (preset: MusicPreset, seconds: number, seed = 1) => {
  const P = PRESETS[preset];
  const n = Math.ceil(seconds * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const rand = rng(seed);
  const beat = 60 / P.bpm;
  const bar = beat * 4;
  const beats: number[] = [];
  for (let k = 0; k * beat < seconds; k++) beats.push(+(k * beat).toFixed(4));
  const add = (buf: Float32Array, at: number, len: number, fn: (t: number) => number, gain = 1) => {
    const s0 = Math.floor(at * SR);
    const s1 = Math.min(n, s0 + Math.floor(len * SR));
    for (let i = Math.max(0, s0); i < s1; i++) buf[i] += fn((i - s0) / SR) * gain;
  };
  // Stereo voice: the same generator rendered twice would double-advance stateful filters, so render once and pan.
  const both = (at: number, len: number, fn: (t: number) => number, gain = 1, pan = 0) => {
    const s0 = Math.floor(at * SR);
    const s1 = Math.min(n, s0 + Math.floor(len * SR));
    const gl = gain * (1 - Math.max(0, pan));
    const gr = gain * (1 + Math.min(0, pan));
    for (let i = Math.max(0, s0); i < s1; i++) {
      const v = fn((i - s0) / SR);
      L[i] += v * gl;
      R[i] += v * gr;
    }
  };
  const swingAt = (k: number) => (k % 2 === 1 ? P.swing * (beat / 2) : 0);
  // Sidechain envelope from the kick: pads/bass duck on every beat for the modern "pumping" feel.
  const duck = (time: number) => (P.pump ? 1 - P.pump * Math.exp(-((time % beat) / beat) * 9) : 1);
  const intro = bar; // first bar: pads + light elements only
  // Drums
  for (let k = 0; k * beat < seconds; k++) {
    const t = k * beat;
    const inBar = k % 4;
    const full = t >= intro;
    const kickOn = P.kick === 'four' || (P.kick === 'half' && (inBar === 0 || inBar === 2)) || (P.kick === 'boom' && k % 8 === 0);
    if (kickOn && (full || P.kick === 'boom')) {
      const big = P.kick === 'boom';
      both(t, big ? 1.4 : 0.45, (x) => Math.sin(2 * Math.PI * (big ? 38 : 48) * x + (big ? 14 : 10) * (1 - Math.exp(-x * 30))) * Math.exp(-x * (big ? 3 : 9)), big ? 0.9 : 0.8);
    }
    if (P.clap && full && (inBar === 1 || inBar === 3)) {
      both(t, 0.25, (x) => (rand() * 2 - 1) * Math.exp(-x * 22) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 190 * x)), 0.32);
    }
    if (full && P.hats !== 'none') {
      const subdiv = P.hats === 'sixteenth' ? 4 : 2;
      for (let s = 0; s < subdiv; s++) {
        if (P.hats === 'offbeat' && s !== 1) continue;
        const at = t + (s * beat) / subdiv + swingAt(s);
        let hp = 0;
        let prev = 0;
        both(
          at,
          0.06,
          (x) => {
            const v = rand() * 2 - 1;
            hp = 0.85 * (hp + v - prev);
            prev = v;
            return hp * Math.exp(-x * 70);
          },
          s % 2 ? 0.12 : 0.08,
          s % 2 ? 0.3 : -0.3,
        );
      }
    }
  }
  // Harmony: one chord per bar.
  for (let b = 0; b * bar < seconds; b++) {
    const t = b * bar;
    const chord = P.chords[b % P.chords.length];
    const len = Math.min(bar, seconds - t);
    if (P.pad > 0) {
      const cut = 0.02 + P.brightness * 0.06;
      for (const note of chord) {
        const f = m(note);
        for (const [buf, detune] of [[L, 1], [R, 0.996]] as const) {
          let lp = 0;
          add(buf, t, len + 0.3, (x) => {
            const saw = ((x * f * detune) % 1) * 2 - 1 + (((x * f * detune * 1.006) % 1) * 2 - 1);
            lp += cut * (saw - lp);
            return lp * Math.min(1, x / 0.35) * Math.min(1, (len + 0.3 - x) / 0.3) * duck(t + x);
          }, P.pad * 0.07);
        }
      }
    }
    if (P.bass !== 'none' && t >= (P.kick === 'boom' ? 0 : intro)) {
      const f = m(chord[0] - 12);
      const hits = P.bass === 'pulse' ? 8 : 2;
      for (let h = 0; h < hits; h++) {
        const at = t + (h * bar) / hits + swingAt(h);
        const dur = (bar / hits) * (P.bass === 'pulse' ? 0.8 : 0.95);
        both(at, dur, (x) => (Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(4 * Math.PI * f * x)) * Math.min(1, x / 0.01) * Math.exp(-x * (P.bass === 'pulse' ? 6 : 1.2)) * duck(at + x), 0.32);
      }
    }
    if (P.arp > 0 && t >= intro) {
      for (let s = 0; s < 16; s++) {
        const f = m(chord[s % chord.length] + 12 + (s % 8 >= 4 ? 12 : 0));
        const at = t + (s * bar) / 16 + swingAt(s);
        let lp = 0;
        both(at, 0.3, (x) => {
          const saw = ((x * f) % 1) * 2 - 1;
          lp += (0.08 + P.brightness * 0.2) * (saw - lp);
          return lp * Math.exp(-x * 14);
        }, P.arp * 0.09, s % 2 ? 0.45 : -0.45);
      }
    }
    if (P.piano > 0) {
      for (const [pi, off] of [0, 1.5, 2.5].entries()) {
        const at = t + off * beat + swingAt(pi);
        for (const note of chord) {
          const f = m(note + 12);
          both(at, 1.6, (x) => (Math.sin(2 * Math.PI * f * x) + 0.35 * Math.sin(4 * Math.PI * f * x) * Math.exp(-x * 6)) * Math.exp(-x * 2.6) * Math.min(1, x / 0.004), P.piano * 0.05, (note % 3) * 0.2 - 0.2);
        }
      }
    }
    // Riser into every 4th bar: lifts energy before a section change.
    if (b % 4 === 3 && P.kick !== 'none') {
      let lp = 0;
      both(t + bar * 0.5, bar * 0.5, (x) => {
        const v = rand() * 2 - 1;
        lp += (0.02 + (x / (bar * 0.5)) * 0.3) * (v - lp);
        return lp * (x / (bar * 0.5)) ** 2;
      }, 0.18);
    }
  }
  if (P.vinyl > 0) {
    for (let i = 0; i < n; i++) {
      const v = ((rand() < 0.0006 ? (rand() * 2 - 1) * 0.5 : 0) + (rand() * 2 - 1) * 0.004) * P.vinyl;
      L[i] += v;
      R[i] += v;
    }
  }
  // Small stereo room (cross-fed delays) for space, then soft-clip and normalize to about -1 dBFS.
  for (const [ti, d] of [0.031, 0.047, 0.067, 0.089].map((x) => Math.floor(x * SR)).entries()) {
    const fb = (0.32 - ti * 0.05) * 0.35;
    for (let i = n - 1; i >= d; i--) {
      L[i] += (ti % 2 ? R : L)[i - d] * fb;
      R[i] += (ti % 2 ? L : R)[i - d] * fb;
    }
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    L[i] = Math.tanh(L[i] * 1.2);
    R[i] = Math.tanh(R[i] * 1.2);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / peak;
  for (let i = 0; i < n; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  return {L, R, beats, bpm: P.bpm};
};

export const toWav = (L: Float32Array, R: Float32Array) => {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  return buf;
};

// Generates (or reuses) a track for a job and returns its public path + beat times in seconds.
export const makeTrack = (preset: MusicPreset, seconds: number, jobId: string, seed = 1) => {
  const key = hash('music-v1', preset, String(Math.ceil(seconds)), String(seed));
  const wav = cachePath('music', key, 'wav');
  const meta = cachePath('music', key, 'json');
  if (!(cached(wav) && cached(meta))) {
    const {L, R, beats, bpm} = synthesize(preset, Math.ceil(seconds) + 1, seed);
    writeFileSync(wav, toWav(L, R));
    writeFileSync(meta, JSON.stringify({beats, bpm}));
  }
  const dir = path.join(config.dirs.publicJobs, jobId);
  mkdirSync(dir, {recursive: true});
  writeFileSync(path.join(dir, `music-${key}.wav`), readFileSync(wav));
  const {beats, bpm} = JSON.parse(readFileSync(meta, 'utf8')) as {beats: number[]; bpm: number};
  return {file: `jobs/${jobId}/music-${key}.wav`, beats, bpm};
};

// Decodes any audio to mono PCM with the ffmpeg bundled in Remotion.
export const decodeMono = (file: string, rate = 11025) => {
  const remotion = path.join(ROOT, 'node_modules', '.bin', 'remotion');
  // The bundled ffmpeg has no raw PCM muxer, so ask for WAV and skip to its "data" chunk.
  const wav = execFileSync(remotion, ['ffmpeg', '-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-c:a', 'pcm_s16le', '-f', 'wav', '-'], {maxBuffer: 1 << 30, cwd: ROOT});
  const at = wav.indexOf('data', 12);
  if (at < 0) throw new Error(`could not decode ${file}`);
  const raw = wav.subarray(at + 8);
  const out = new Float32Array(Math.floor(raw.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = raw.readInt16LE(i * 2) / 32768;
  return {pcm: out, rate};
};

// Beat tracking for user-supplied tracks: energy-flux onsets + autocorrelation tempo + phase alignment.
export const detectBeats = (pcm: Float32Array, rate: number) => {
  const hop = 256;
  const frames = Math.floor(pcm.length / hop);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += pcm[i] * pcm[i];
    e = Math.log1p(e * 100);
    env[f] = Math.max(0, e - prev);
    prev = e;
  }
  const fps = rate / hop;
  // Silence / no onsets: no beat grid rather than an invented one.
  if (env.reduce((m, x) => Math.max(m, x), 0) < 1e-4) return {bpm: 0, beats: []};
  let best = {lag: 0, score: -1};
  for (let bpm = 70; bpm <= 160; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let score = 0;
    for (let f = 0; f + lag * 2 < frames; f++) score += env[f] * ((env[Math.round(f + lag)] ?? 0) + 0.5 * (env[Math.round(f + lag * 2)] ?? 0));
    if (score > best.score) best = {lag, score};
  }
  let bestPhase = {p: 0, s: -1};
  for (let p = 0; p < best.lag; p++) {
    let s = 0;
    for (let f = p; f < frames; f += best.lag) s += env[Math.round(f)] ?? 0;
    if (s > bestPhase.s) bestPhase = {p, s};
  }
  const beats: number[] = [];
  for (let f = bestPhase.p; f < frames; f += best.lag) beats.push(+(f / fps).toFixed(4));
  return {bpm: +((60 * fps) / best.lag).toFixed(1), beats};
};

export const beatsOfFile = (file: string) => {
  const key = hash('beats', file, existsSync(file) ? `${statSync(file).size}-${statSync(file).mtimeMs}` : '0');
  const out = cachePath('beats', key, 'json');
  if (cached(out)) return JSON.parse(readFileSync(out, 'utf8')) as {bpm: number; beats: number[]};
  const {pcm, rate} = decodeMono(file);
  const r = detectBeats(pcm, rate);
  writeFileSync(out, JSON.stringify(r));
  return r;
};

// Loudness report for the final mix: approximate integrated loudness (RMS dBFS), peak and clipping.
export const audioReport = (file: string) => {
  const {pcm} = decodeMono(file, 22050);
  let sum = 0;
  let peak = 0;
  let clipped = 0;
  for (const v of pcm) {
    sum += v * v;
    const a = Math.abs(v);
    peak = Math.max(peak, a);
    if (a > 0.995) clipped++;
  }
  const rms = Math.sqrt(sum / Math.max(1, pcm.length));
  return {rmsDb: +(20 * Math.log10(Math.max(rms, 1e-9))).toFixed(1), peakDb: +(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1), clippedSamples: clipped};
};
