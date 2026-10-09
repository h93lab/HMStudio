import {execFileSync, spawn, type ChildProcess} from 'node:child_process';
import {appendFileSync, closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROLE_DEFAULTS, ROOT, config, modelsFor, readSettings, settingsFile, type Role, type Settings as StoredSettings} from './config';
import {authHeaders} from './llm';
import {FPS, TRANSITION, formats, totalDuration, type Theme, type VideoProps} from '../src/schema';
import {loadJob, loadProps, saveJob, writeAtomic, type Job} from './jobs';
import {rewriteScene, saveManual} from './produce';
import {musicPresets} from './music';
import {defaultVoice} from './voice';
import {DIALECTS, archiveProfile, duplicateProfile, readProfiles, saveProfile, validClientId, type StoredProfile} from './profiles';
import {PUBLIC as PUB, assetPathFromUrl, bumpTemplateUses, createTemplate, deleteAsset, deleteTemplate, getTemplate, listAssets, readTemplates, saveUpload, sceneTypes} from './library';
import {assertPublicUrl, brandTheme, fetchBrand} from './brand';
import {checkPin, clearCookie, clearFails, hasSession, isLocal, lockedFor, pinSet, recordFail, remoteIp, sessionCookie, setPin, validPin} from './auth';
import {deleteStyle, generatePack, isStyleId, listStyles, saveStyle, styleOptions} from './styles';
import {importDesignSystem} from './designSystem';

// Studio API + SPA host: JSON endpoints under /api, the built editor (editor/dist) for every other page.
// Binds to localhost and the owner's Tailscale address only.
const PORT = Number(process.env.MOTION_PORT ?? 4777);
const DIST = path.join(ROOT, 'editor', 'dist');
const runsDir = () => {
  const dir = path.join(config.dirs.jobs, '_runs');
  mkdirSync(dir, {recursive: true});
  return dir;
};

export class HttpError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}
// Validation helpers throw plain Errors with safe messages; at the route level they become 400s.
const user = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message);
  }
};

// ── Jobs ─────────────────────────────────────────────────────────────────────
const jobs = (): Job[] =>
  existsSync(config.dirs.jobs)
    ? readdirSync(config.dirs.jobs)
        .filter((d) => existsSync(path.join(config.dirs.jobs, d, 'job.json')))
        .sort()
        .reverse()
        .flatMap((d) => {
          try {
            return [JSON.parse(readFileSync(path.join(config.dirs.jobs, d, 'job.json'), 'utf8')) as Job];
          } catch {
            return []; // being written right now: skip this refresh
          }
        })
    : [];

const validJob = (id: string | null | undefined): id is string => !!id && /^[\w-]+$/.test(id) && existsSync(path.join(config.dirs.jobs, id, 'job.json'));

// ── Runs: a FIFO queue, one child process at a time (renders saturate the machine) ─────────────
export type RunStatus = 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';
export type RunMeta = {kind: 'make' | 'revise' | 'reformat' | 'render'; label: string; jobId?: string; command: string; options: string[]; text: string[]; startedAt: string; endedAt?: string; status: RunStatus; resolves?: string[]};
type Live = {id: string; meta: RunMeta; child?: ChildProcess; cancelled?: boolean};

const live = new Map<string, Live>(); // running or waiting runs of this process
const queue: string[] = [];
let running: string | null = null;
const busy = new Set<string>(); // jobs with a manual save in flight

const runPath = (id: string, ext: 'log' | 'json') => path.join(runsDir(), `${id}.${ext}`);
const saveMeta = (id: string, meta: RunMeta) => writeAtomic(runPath(id, 'json'), JSON.stringify(meta));
const readMeta = (id: string): RunMeta | null => {
  try {
    return JSON.parse(readFileSync(runPath(id, 'json'), 'utf8'));
  } catch {
    return null;
  }
};

const readHead = (file: string, bytes: number) => {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    return buf.subarray(0, readSync(fd, buf, 0, bytes, 0)).toString('utf8');
  } finally {
    closeSync(fd);
  }
};
const readTail = (file: string, bytes: number) => {
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  try {
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
};

// Pure: status / progress / step from a run's log text. `tracked` = this process still owns the child (or queue slot).
export const deriveRun = (log: string, meta: {status: RunStatus; kind: RunMeta['kind']} | null, tracked: boolean) => {
  const exit = log.match(/(?:^|\n)exit (-?\d+|null)\s*$/);
  const lines = log.split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l && !/^exit (-?\d+|null)$/.test(l));
  let status: RunStatus;
  let interrupted = false;
  if (meta?.status === 'cancelled') status = 'cancelled';
  else if (exit) status = exit[1] === '0' ? 'done' : 'failed';
  else if (tracked && meta && (meta.status === 'running' || meta.status === 'waiting')) status = meta.status;
  else {
    status = 'failed';
    interrupted = true; // no exit line and nobody is running it: the server restarted mid-run
  }
  const pcts = [...log.matchAll(/render (\d+)%/g)];
  const pct = pcts.length ? Number(pcts[pcts.length - 1][1]) / 100 : undefined;
  const markers = lines.filter((l) => l.startsWith('▸')).length;
  const kind = meta?.kind ?? 'make';
  const progress = status === 'done' ? 1 : status === 'waiting' ? 0 : pct !== undefined ? (kind === 'render' ? pct : 0.5 + pct / 2) : kind === 'render' ? 0.02 : Math.min(0.45, 0.04 + markers * 0.08);
  const failLine = lines.filter((l) => l.startsWith('✗')).at(-1)?.replace(/^✗\s*/, '');
  const step = interrupted ? 'interrupted' : status === 'waiting' ? 'waiting for a free slot' : status === 'failed' ? (failLine ?? lines.at(-1) ?? 'failed') : status === 'cancelled' ? 'cancelled' : status === 'done' ? 'finished' : (lines.at(-1) ?? 'starting');
  return {status, progress: Math.round(progress * 100) / 100, step: step.slice(0, 140)};
};

const jobIdFromLog = (id: string) => {
  try {
    return readHead(runPath(id, 'log'), 8192).match(/^job ([\w-]+)\s*$/m)?.[1];
  } catch {
    return undefined;
  }
};

const runView = (id: string) => {
  const meta = readMeta(id);
  const file = runPath(id, 'log');
  if (!existsSync(file)) return null;
  const entry = live.get(id);
  const tail = readTail(file, 200 * 1024);
  const d = deriveRun(tail, meta ? {status: meta.status, kind: meta.kind} : null, !!entry);
  const jobId = meta?.jobId ?? jobIdFromLog(id);
  const startedAt = meta?.startedAt ?? statSync(file).birthtime.toISOString();
  const terminal = d.status === 'done' || d.status === 'failed' || d.status === 'cancelled';
  return {
    run: {id, kind: meta?.kind ?? 'make', label: meta?.label ?? id, ...(jobId ? {jobId} : {}), status: d.status, progress: d.progress, step: d.step, startedAt, ...(terminal ? {endedAt: meta?.endedAt ?? statSync(file).mtime.toISOString()} : {})},
    tail,
  };
};

const runList = () =>
  readdirSync(runsDir())
    .filter((f) => f.endsWith('.log'))
    .map((f) => f.slice(0, -4))
    .sort()
    .reverse()
    .slice(0, 50)
    .flatMap((id) => runView(id)?.run ?? []);

// Is a job being changed right now (manual save, or a queued/running run for it)?
const isBusy = (id: string) => {
  if (busy.has(id)) return true;
  for (const e of live.values()) {
    if (!e.meta.jobId && e.child) {
      e.meta.jobId = jobIdFromLog(e.id); // a make run learns its job id from its log
      if (e.meta.jobId) saveMeta(e.id, e.meta);
    }
    if (e.meta.jobId === id) return true;
  }
  return false;
};

const resolveComments = (jobId: string, ids: string[]) => {
  const set = new Set(ids);
  saveComments(jobId, commentsOf(jobId).map((c) => (set.has(c.id) ? {...c, resolved: true} : c)));
};

const killGroup = (child: ChildProcess, signal: NodeJS.Signals) => {
  try {
    process.kill(-child.pid!, signal); // the whole group: tsx → node → chromium
  } catch {
    child.kill(signal);
  }
};

const finish = (e: Live, code: number | null, note?: string) => {
  const log = runPath(e.id, 'log');
  appendFileSync(log, `${note ? `\n${note}` : ''}\nexit ${code}\n`);
  live.delete(e.id);
  if (running === e.id) running = null;
  e.meta.endedAt = new Date().toISOString();
  e.meta.status = e.cancelled ? 'cancelled' : code === 0 ? 'done' : 'failed';
  e.meta.jobId ??= jobIdFromLog(e.id);
  try {
    if (e.meta.status === 'done' && e.meta.resolves && e.meta.jobId) resolveComments(e.meta.jobId, e.meta.resolves);
  } catch (err) {
    console.error('could not resolve comments', err);
  }
  saveMeta(e.id, e.meta);
  pump();
};

const pump = (): void => {
  if (running) return;
  const id = queue.shift();
  const e = id ? live.get(id) : undefined;
  if (!e) return id ? pump() : undefined;
  running = e.id;
  e.meta.status = 'running';
  saveMeta(e.id, e.meta);
  const out = openSync(runPath(e.id, 'log'), 'a');
  // Arguments as an array (no shell); free text goes after `--` so an idea starting with "-" is never read as an option.
  const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'pipeline', 'cli.ts'), e.meta.command, ...e.meta.options, '--', ...e.meta.text], {cwd: ROOT, stdio: ['ignore', out, out], env: {...process.env, NODE_NO_WARNINGS: '1'}, detached: true});
  closeSync(out);
  e.child = child;
  let ended = false;
  child.on('error', (err) => {
    if (!ended) {
      ended = true;
      finish(e, 1, `✗ could not start: ${err.message}`);
    }
  });
  child.on('exit', (code) => {
    if (!ended) {
      ended = true;
      finish(e, code);
    }
  });
};

export type RunSpec = {kind: RunMeta['kind']; label: string; jobId?: string; command: string; options: string[]; text: string[]; resolves?: string[]};
export const enqueueRun = (spec: RunSpec) => {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(2).toString('hex')}`;
  const meta: RunMeta = {...spec, startedAt: new Date().toISOString(), status: 'waiting'};
  writeFileSync(runPath(id, 'log'), '');
  saveMeta(id, meta);
  live.set(id, {id, meta});
  queue.push(id);
  pump();
  return id;
};

const cancelRun = (id: string) => {
  const e = live.get(id);
  if (!e) throw new HttpError(409, 'this run is not active');
  e.cancelled = true;
  if (e.child) {
    killGroup(e.child, 'SIGTERM');
    const hard = setTimeout(() => e.child && live.has(id) && killGroup(e.child, 'SIGKILL'), 10_000);
    hard.unref();
    return;
  }
  queue.splice(queue.indexOf(id), 1);
  finish(e, null, 'cancelled before it started');
};

const stopAll = () => {
  for (const e of live.values()) if (e.child) killGroup(e.child, 'SIGTERM');
};

// ── Projections ──────────────────────────────────────────────────────────────
const profileOf = (id: string) => readProfiles().find((p) => p.id === id);
const clientName = (id: string) => profileOf(id)?.props.theme.client ?? id;

const fileUrl = (...parts: string[]) => '/files/' + parts.map((p) => p.split('/').map(encodeURIComponent).join('/')).join('/');

const versionStills = (id: string, v: number) => {
  const dir = path.join(config.dirs.jobs, id, `v${v}`, 'stills');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().map((f) => fileUrl(id, `v${v}`, 'stills', f)) : [];
};

const versionSeconds = (id: string, v: number) => {
  try {
    const props = loadProps(id, v);
    return {seconds: Math.round((totalDuration(props.scenes) / FPS) * 10) / 10, scenes: props.scenes.length};
  } catch {
    return {seconds: 0, scenes: 0};
  }
};

export const summarize = (job: Job) => ({
  id: job.id,
  client: job.client,
  clientName: clientName(job.client),
  idea: job.idea,
  format: job.format,
  ...(job.style ? {style: job.style} : {}),
  ...(job.music ? {music: job.music} : {}),
  createdAt: job.createdAt,
  busy: isBusy(job.id),
  ...(job.winner ? {winner: job.winner} : {}),
  ...(job.approval ? {approval: job.approval} : {}),
  openComments: commentsOf(job.id).filter((c) => !c.resolved).length,
  reviewUrl: `/review/${job.id}?t=${reviewToken(job.id)}`,
  versions: job.versions.map((v) => {
    const stills = versionStills(job.id, v.v);
    return {
      v: v.v,
      createdAt: v.createdAt,
      ...(v.variant ? {variant: v.variant} : {}),
      ...(v.feedback ? {feedback: v.feedback} : {}),
      ...(v.qa ? {qaScore: v.qa.score} : {}),
      ...(v.critic ? {criticScore: v.critic.score} : {}),
      notes: v.notes ?? [],
      videos: Object.fromEntries(Object.entries(v.videos).filter(([, f]) => existsSync(path.join(config.dirs.jobs, job.id, f))).map(([k, f]) => [k, fileUrl(job.id, f)])),
      ...(stills[0] ? {cover: stills[0]} : {}),
      stills,
      ...versionSeconds(job.id, v.v),
    };
  }),
});

const profileView = (p: StoredProfile, counts: Map<string, number>) => ({id: p.id, ...(p.archived ? {archived: true} : {}), theme: p.props.theme, defaults: p.defaults ?? {}, videos: counts.get(p.id) ?? 0, ...(p.updatedAt ? {updatedAt: p.updatedAt} : {})});
const clientCounts = () => {
  const counts = new Map<string, number>();
  for (const j of jobs()) counts.set(j.client, (counts.get(j.client) ?? 0) + 1);
  return counts;
};

const voiceList = () => [...new Set([...(['en', 'msa', 'egyptian', 'gulf', 'levantine'] as const).flatMap((d) => (['male', 'female'] as const).map((g) => defaultVoice(d === 'en' ? 'en' : 'ar', d, g))), 'ar-AE-HamdanNeural'])];

// ── Files ────────────────────────────────────────────────────────────────────
const send = (res: ServerResponse, code: number, body: string, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, {'content-type': type, 'x-content-type-options': 'nosniff'});
  res.end(body);
};

const types: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.log': 'text/plain; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.woff2': 'font/woff2', '.ico': 'image/x-icon'};

// The file at base/rel, only when it is a regular file inside base.
export const fileUnder = (base: string, rel: string) => {
  const file = path.resolve(base, rel);
  return file.startsWith(base + path.sep) && existsSync(file) && statSync(file).isFile() ? file : null;
};

// Static files with HTTP Range support so mp4s can be seeked in every browser.
const serveFile = (res: ServerResponse, base: string, rel: string, range?: string, sandbox = true, cache?: string) => {
  const file = fileUnder(base, rel);
  if (!file) return send(res, 404, 'not found');
  const size = statSync(file).size;
  const type = types[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  // Served user/job files never run code on the dashboard origin (a scraped SVG logo could carry <script>).
  if (sandbox) res.setHeader('content-security-policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'");
  res.setHeader('x-content-type-options', 'nosniff');
  if (cache) res.setHeader('cache-control', cache);
  if (size === 0) {
    res.writeHead(200, {'content-type': type, 'content-length': 0});
    return res.end();
  }
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, {'content-range': `bytes */${size}`});
      return res.end();
    }
    res.writeHead(206, {'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes'});
  } else {
    res.writeHead(200, {'content-type': type, 'content-length': size, 'accept-ranges': 'bytes'});
  }
  createReadStream(file, {start, end})
    .on('error', () => res.destroy())
    .pipe(res);
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 5_000_000) {
        reject(new HttpError(413, 'request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); // decode once: multi-byte Arabic never splits
    req.on('error', reject);
  });
const readJson = async (req: IncomingMessage): Promise<Record<string, any>> => {
  const body = JSON.parse((await readBody(req)) || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'expected a JSON object');
  return body;
};

// ── Trust: only this machine's own pages (and the owner's Tailscale devices) may use the API ────────
const tailscale = (() => {
  const bin = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'].find((b) => existsSync(b));
  return (args: string[]) => (bin ? execFileSync(bin, args, {encoding: 'utf8', timeout: 5000}).trim() : '');
})();
const tailnet = () => {
  try {
    const ip = tailscale(['ip', '-4']).split('\n')[0];
    const name = String(JSON.parse(tailscale(['status', '--json'])).Self?.DNSName ?? '').replace(/\.$/, '');
    return /^100\.\d+\.\d+\.\d+$/.test(ip) ? {ip, name} : null;
  } catch {
    return null;
  }
};
export const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const allowTailnet = (t: {ip: string; name: string}) => {
  allowedHosts.add(`${t.ip}:${PORT}`);
  if (t.name) {
    allowedHosts.add(`${t.name}:${PORT}`);
    allowedHosts.add(`${t.name.split('.')[0]}:${PORT}`); // short MagicDNS name
  }
};
// Blocks DNS rebinding (Host) and cross-site writes (Origin required on every non-GET).
export const trusted = (req: IncomingMessage) => {
  if (!allowedHosts.has(req.headers.host ?? '')) return false;
  const origin = req.headers.origin;
  if (req.method !== 'GET' && req.method !== 'HEAD' && (!origin || !allowedHosts.has(origin.replace(/^https?:\/\//, '')))) return false;
  return true;
};

// ── AI model settings ────────────────────────────────────────────────────────
let modelCache: {at: number; ids: string[]} | null = null;
const availableModels = async () => {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.ids;
  const r = await fetch(`${config.baseUrl}/models`, {headers: authHeaders(), signal: AbortSignal.timeout(20_000)});
  const ids: string[] = r.ok ? ((await r.json()).data ?? []).map((m: {id: string}) => m.id) : [];
  modelCache = {at: Date.now(), ids};
  return ids;
};

const settingsView = () => {
  const s = readSettings();
  return {
    roles: (Object.keys(ROLE_DEFAULTS) as Role[]).map((role) => ({role, label: ROLE_DEFAULTS[role].label, models: modelsFor(role), defaults: [...ROLE_DEFAULTS[role].models], custom: !!s.models?.[role]})),
    voice: s.voice ?? '',
    voiceRate: s.voiceRate ?? '+6%',
    voices: voiceList(),
  };
};

export const saveSettings = (b: Record<string, any>) => {
  if (b.reset === true) return writeAtomic(settingsFile, JSON.stringify({}, null, 2));
  const valid = /^[\w./:@+-]+$/;
  const models: StoredSettings['models'] = {};
  for (const r of Object.keys(ROLE_DEFAULTS) as Role[]) {
    const raw = b.models?.[r];
    const list = (Array.isArray(raw) ? raw : []).map((x: unknown) => String(x).trim()).filter((x: string) => valid.test(x)).slice(0, 8);
    // Only store what differs from the default, so future default improvements still reach untouched roles.
    if (Array.isArray(raw) && list.join(',') !== ROLE_DEFAULTS[r].models.join(',')) models[r] = list;
  }
  const voice = String(b.voice ?? '').trim();
  const voiceRate = String(b.voiceRate ?? '').trim();
  const next: StoredSettings = {models, ...(valid.test(voice) ? {voice} : {}), ...(/^[+-]\d{1,2}%$/.test(voiceRate) ? {voiceRate} : {})};
  writeAtomic(settingsFile, JSON.stringify(next, null, 2));
};

// Calls / failures / TTS characters per model over the last 7 days, from every job's ledger.
export const usage = (now = Date.now()) => {
  const since = now - 7 * 86_400_000;
  const by = new Map<string, {model: string; calls: number; failures: number; chars: number}>();
  for (const d of existsSync(config.dirs.jobs) ? readdirSync(config.dirs.jobs) : []) {
    const file = path.join(config.dirs.jobs, d, 'ledger.jsonl');
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      try {
        const e = JSON.parse(line) as {at: string; model: string; ok: boolean; chars?: number};
        if (!e.model || !(Date.parse(e.at) >= since)) continue;
        const row = by.get(e.model) ?? {model: e.model, calls: 0, failures: 0, chars: 0};
        row.calls++;
        if (!e.ok) row.failures++;
        row.chars += e.chars ?? 0;
        by.set(e.model, row);
      } catch {
        // blank or half-written line
      }
    }
  }
  return [...by.values()].sort((a, b) => b.calls - a.calls).map((r) => ({model: r.model, calls: r.calls, failures: r.failures, ...(r.chars ? {chars: r.chars} : {})}));
};

// ── Review links + comments ──────────────────────────────────────────────────
type Comment = {id: string; v: number; time: number; text: string; author: string; at: string; resolved?: boolean};
const commentsFile = (id: string) => path.join(config.dirs.jobs, id, 'comments.json');
const commentsOf = (id: string): Comment[] => {
  try {
    return existsSync(commentsFile(id)) ? JSON.parse(readFileSync(commentsFile(id), 'utf8')) : [];
  } catch {
    return [];
  }
};
const saveComments = (id: string, list: Comment[]) => writeAtomic(commentsFile(id), JSON.stringify(list, null, 2));

// Per-job secret for the client review link, in its own file so concurrent job.json writes can never drop it.
const reviewToken = (id: string) => {
  const file = path.join(config.dirs.jobs, id, '.review-token');
  if (!existsSync(file)) writeFileSync(file, randomBytes(12).toString('hex'));
  return readFileSync(file, 'utf8').trim();
};
export const tokenOk = (id: string, token: unknown) => {
  if (typeof token !== 'string' || !validJob(id)) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(reviewToken(id));
  return a.length === b.length && timingSafeEqual(a, b);
};

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// 1-based scene on screen at time t (seconds).
export const sceneAt = (scenes: Pick<VideoProps['scenes'][number], 'duration'>[], t: number) => {
  let at = 0;
  for (const [i, s] of scenes.entries()) {
    if (t * FPS < at + s.duration - TRANSITION) return i + 1;
    at += s.duration - TRANSITION;
  }
  return scenes.length;
};

// Unresolved comments → one revision brief with timestamps mapped to scenes.
const commentsToFeedback = (id: string, list: Comment[]) => {
  const last = loadJob(id).versions.at(-1);
  const scenes = last ? loadProps(id, last.v).scenes : [];
  return list.map((c) => `At ${mmss(c.time)} (scene ${sceneAt(scenes, c.time)}): ${c.text}`).join('\n');
};

const reviewView = (id: string) => {
  const job = loadJob(id);
  const v = job.versions.filter((x) => Object.keys(x.videos).length).at(-1) ?? job.versions.at(-1);
  if (!v) throw new HttpError(404, 'no version yet');
  const file = v.videos[job.format] ?? Object.values(v.videos)[0];
  const stills = versionStills(id, v.v);
  let scenes: VideoProps['scenes'] = [];
  try {
    scenes = loadProps(id, v.v).scenes;
  } catch {
    // props missing: scene numbers fall back to 0
  }
  return {
    id,
    client: job.client,
    title: clientName(job.client),
    v: v.v,
    ...(file && existsSync(path.join(config.dirs.jobs, id, file)) ? {video: `${fileUrl(id, file)}?t=${reviewToken(id)}`} : {}),
    ...(stills[0] ? {cover: `${stills[0]}?t=${reviewToken(id)}`} : {}),
    seconds: versionSeconds(id, v.v).seconds,
    ...(job.approval ? {approval: job.approval} : {}),
    comments: commentsOf(id).filter((c) => !c.resolved).map((c) => ({id: c.id, time: c.time, text: c.text, author: c.author, at: c.at, scene: scenes.length ? sceneAt(scenes, c.time) : 0})),
  };
};

// ── Make / job actions ───────────────────────────────────────────────────────
const MAX_ASSETS = 10;
const intIn = (v: unknown, lo: number, hi: number, what: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${what} must be a whole number from ${lo} to ${hi}`);
  return n;
};
const flag = (v: unknown, what: string) => {
  if (v !== undefined && typeof v !== 'boolean') throw new HttpError(400, `${what} must be true or false`);
  return v === true;
};
const assetList = (client: string, v: unknown, what: string) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_ASSETS) throw new HttpError(400, `${what}: at most ${MAX_ASSETS} library files`);
  return v.map((u) => {
    const file = user(() => assetPathFromUrl(client, u));
    if (file.includes(',')) throw new HttpError(400, `${what}: file path contains a comma`);
    return file;
  });
};

export const parseMake = (b: Record<string, any>) => {
  const idea = typeof b.idea === 'string' ? b.idea.trim() : '';
  if (idea.length < 3 || idea.length > 8000) throw new HttpError(400, 'idea must be 3 to 8000 characters');
  const profile = validClientId(b.client) ? profileOf(b.client) : undefined;
  if (!profile || profile.archived) throw new HttpError(400, 'unknown or archived client');
  const client = profile.id;
  if (typeof b.format !== 'string' || !(b.format in formats)) throw new HttpError(400, 'bad format');
  if (!(DIALECTS as readonly string[]).includes(b.dialect)) throw new HttpError(400, 'bad dialect');
  if (!['draft', 'standard', 'premium'].includes(b.tier)) throw new HttpError(400, 'bad tier');
  if (b.gender !== 'male' && b.gender !== 'female') throw new HttpError(400, 'bad gender');
  const seconds = intIn(b.seconds, 10, 90, 'seconds');
  const opts = ['--client', client, '--format', b.format, '--dialect', b.dialect, '--seconds', String(seconds), '--tier', b.tier, '--gender', b.gender];
  if (b.style) {
    if (typeof b.style !== 'string' || !isStyleId(b.style)) throw new HttpError(400, 'bad style');
    opts.push('--style', b.style);
  }
  if (b.music) {
    if (![...musicPresets, 'none'].includes(b.music)) throw new HttpError(400, 'bad music');
    opts.push('--music', b.music);
  }
  if (b.voice) {
    if (typeof b.voice !== 'string' || !/^[\w.-]{1,80}$/.test(b.voice)) throw new HttpError(400, 'bad voice');
    opts.push('--voice', b.voice);
  }
  if (b.url) {
    if (typeof b.url !== 'string' || !/^https?:\/\/[^\s]{1,300}$/.test(b.url)) throw new HttpError(400, 'bad url');
    opts.push('--url', b.url);
    if (flag(b.brandTheme, 'brandTheme')) opts.push('--brand-theme');
  }
  if (flag(b.draft, 'draft')) opts.push('--draft');
  if (flag(b.qaFix, 'qaFix')) opts.push('--qa-fix');
  if (b.variants !== undefined) opts.push('--variants', String(intIn(b.variants, 1, 5, 'variants')));
  let template: string | undefined;
  if (b.template) {
    if (typeof b.template !== 'string' || !getTemplate(b.template)) throw new HttpError(400, 'unknown template');
    template = b.template;
    opts.push('--template', template);
  }
  const screens = assetList(client, b.screens, 'screens');
  const clips = assetList(client, b.clips, 'clips');
  if (screens.length) opts.push('--screens', screens.join(','));
  if (clips.length) opts.push('--clips', clips.join(','));
  if (b.logo) opts.push('--logo', user(() => assetPathFromUrl(client, b.logo)));
  return {options: opts, text: [idea], template, label: idea.replace(/\s+/g, ' ').slice(0, 48)}; // the kind shows as its own badge
};

const jobLabel = (job: Job, what: string) => `${job.idea.replace(/\s+/g, ' ').slice(0, 32)} · ${what}`;
const jobRun = (job: Job, kind: 'revise' | 'reformat' | 'render', what: string, options: string[], text: string[], resolves?: string[]) =>
  enqueueRun({kind, label: jobLabel(job, what), jobId: job.id, command: kind, options, text, resolves});

const exportRuns = (job: Job, b: Record<string, any>) => {
  const v = job.versions.find((x) => x.v === b.v);
  if (!v) throw new HttpError(400, 'unknown version');
  const wanted = Array.isArray(b.formats) ? [...new Set(b.formats)] : [];
  if (!wanted.length || wanted.some((f) => typeof f !== 'string' || !(f in formats))) throw new HttpError(400, 'bad formats');
  const native = loadProps(job.id, v.v).format; // the format the version's props were built for
  const runs: string[] = [];
  for (const f of wanted as string[]) {
    const have = v.videos[f] && existsSync(path.join(config.dirs.jobs, job.id, v.videos[f]));
    if (have) continue;
    runs.push(f === native ? jobRun(job, 'render', `render v${v.v}`, ['--version', String(v.v)], [job.id]) : jobRun(job, 'reformat', `reformat ${f}`, ['--format', f, '--version', String(v.v)], [job.id]));
  }
  return runs;
};

// ── Login gate ───────────────────────────────────────────────────────────────
// What a visitor without a session may still call: the login endpoints and the token-protected review page.
const PUBLIC_API = [/^\/api\/auth\/(state|login|pin|logout)$/, /^\/api\/review\/[\w-]+(\/decision)?$/, /^\/api\/jobs\/[\w-]+\/comments$/];
const sessionHeaders = (res: ServerResponse, cookie: string) => res.setHeader('set-cookie', cookie);

const DS_EXT = ['.zip', '.md', '.markdown', '.css', '.json', '.html', '.htm', '.txt'];
const MAX_DS = 20 * 1024 * 1024;
// Streams the request body to a temp file (never buffered whole); the caller deletes it.
const uploadToTemp = async (req: IncomingMessage, ext: string, max: number) => {
  const tmp = path.join(os.tmpdir(), `motion-ds-${randomBytes(6).toString('hex')}${ext}`);
  if (Number(req.headers['content-length']) > max) throw new HttpError(413, `file too large (max ${max / 1024 / 1024} MB)`);
  const out = createWriteStream(tmp);
  let size = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > max) {
          reject(new HttpError(413, `file too large (max ${max / 1024 / 1024} MB)`));
          req.unpipe(out);
          out.destroy();
          req.resume();
        }
      });
      req.on('error', reject);
      req.on('aborted', () => reject(new Error('upload aborted')));
      out.on('error', reject);
      out.on('finish', resolve);
      req.pipe(out);
    });
    if (!size) throw new HttpError(400, 'empty file');
    return tmp;
  } catch (e) {
    rmSync(tmp, {force: true});
    throw e;
  }
};

const styleId = (id: string) => {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new HttpError(400, 'bad style id');
  return id;
};
// Style module errors are safe messages: unknown id → 404, anything else → 400.
const styleCall = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(/unknown|not found/i.test((e as Error).message) ? 404 : 400, (e as Error).message);
  }
};

// ── Router ───────────────────────────────────────────────────────────────────
const jsonOut = (res: ServerResponse, code: number, data: unknown) => send(res, code, JSON.stringify(data), 'application/json; charset=utf-8');
const clientId = (id: string) => {
  if (!validClientId(id)) throw new HttpError(400, 'bad client id');
  return id;
};

export const handler = async (req: IncomingMessage, res: ServerResponse) => {
  const method = req.method ?? 'GET';
  try {
    if (!trusted(req)) return send(res, 403, 'forbidden');
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    const json = (data: unknown, code = 200) => jsonOut(res, code, data);
    const m = (re: RegExp) => p.match(re);

    const authed = hasSession(req);

    if (p.startsWith('/api/') || p === '/api') {
      let r: RegExpMatchArray | null;
      const commentsRead = method === 'GET' && /\/comments$/.test(p); // reading comments needs a session; only the token-checked POST is public
      if (!authed && (commentsRead || !PUBLIC_API.some((re) => re.test(p)))) return json({error: 'login required'}, 401);
      // ── auth
      if (method === 'GET' && p === '/api/auth/state') return json({authenticated: authed, pinSet: pinSet(), canSetPin: !pinSet() && isLocal(req)});
      if (method === 'POST' && p === '/api/auth/logout') {
        sessionHeaders(res, clearCookie());
        return json({ok: true});
      }
      if (method === 'POST' && (p === '/api/auth/login' || p === '/api/auth/pin')) {
        const body = await readJson(req);
        const ip = remoteIp(req);
        // Wrong guesses (login, or the `current` PIN of a change) share one per-IP counter.
        const guess = (pin: unknown) => {
          const wait = lockedFor(ip);
          if (wait) throw new HttpError(429, `too many attempts, try again in ${wait} seconds`);
          if (checkPin(pin)) return clearFails(ip);
          recordFail(ip);
          throw new HttpError(lockedFor(ip) ? 429 : 401, lockedFor(ip) ? `too many attempts, try again in ${lockedFor(ip)} seconds` : 'wrong PIN');
        };
        if (p === '/api/auth/login') {
          if (!pinSet()) throw new HttpError(409, 'no PIN set yet');
          guess(body.pin);
        } else {
          if (!validPin(body.pin)) throw new HttpError(400, 'the PIN must be exactly 6 digits');
          if (!pinSet()) {
            if (!isLocal(req)) throw new HttpError(403, 'the first PIN can only be set from the Mac itself');
          } else {
            if (!authed) return json({error: 'login required'}, 401);
            guess(body.current);
          }
          setPin(body.pin);
        }
        sessionHeaders(res, sessionCookie());
        return json({ok: true});
      }
      // ── jobs
      if (method === 'GET' && p === '/api/jobs') return json(jobs().map(summarize));
      if ((r = m(/^\/api\/jobs\/([\w-]+)(?:\/([\w-]+))?$/))) {
        const [, id, action] = r;
        if (!validJob(id)) return json({error: 'unknown job'}, 404);
        if (method === 'GET' && !action) {
          const job = loadJob(id);
          const v = Number(url.searchParams.get('v')) || job.versions.at(-1)?.v;
          if (!v || !job.versions.some((x) => x.v === v)) return json({error: 'unknown version'}, 404);
          return json({job, v, props: loadProps(id, v), locks: job.versions.find((x) => x.v === v)?.locks ?? [], busy: isBusy(id)});
        }
        if (method === 'GET' && action === 'summary') return json(summarize(loadJob(id)));
        if (method === 'GET' && action === 'comments') return json(commentsOf(id));
        if (method === 'POST' && action === 'comments') {
          const body = await readJson(req);
          if (!tokenOk(id, body.token) || typeof body.text !== 'string' || !body.text.trim()) return json({error: 'bad comment'}, 400);
          const list = commentsOf(id);
          list.push({id: randomBytes(6).toString('hex'), v: Number(body.v) || 0, time: Math.max(0, Number(body.time) || 0), text: body.text.trim().slice(0, 1000), author: String(body.author ?? '').slice(0, 60), at: new Date().toISOString()});
          saveComments(id, list);
          return json({ok: true});
        }
        if (method !== 'POST' || !action || !['save', 'rewrite', 'render', 'revise', 'reformat', 'apply-comments', 'export', 'winner'].includes(action)) return json({error: 'method not allowed'}, 405);
        if (isBusy(id)) return json({error: 'this job is busy, wait for the current task to finish'}, 409);
        const body = await readJson(req);
        if (isBusy(id)) return json({error: 'this job is busy, wait for the current task to finish'}, 409); // re-check: another request may have started while the body streamed
        const job = loadJob(id);
        if (action === 'save') {
          busy.add(id);
          try {
            const out = await saveManual(id, body.props as VideoProps, Array.isArray(body.locks) ? body.locks.filter((l: unknown) => typeof l === 'string') : [], typeof body.note === 'string' ? body.note.slice(0, 200) : 'manual edit');
            return json({v: out.version.v, props: out.props, notes: out.version.notes, review: out.version.review});
          } catch (e) {
            return json({error: (e as Error).message}, 400);
          } finally {
            busy.delete(id);
          }
        }
        if (action === 'rewrite') {
          try {
            return json({scene: await rewriteScene(id, body.props as VideoProps, Number(body.index), String(body.instruction ?? '').slice(0, 500), Array.isArray(body.locks) ? body.locks : [])});
          } catch (e) {
            return json({error: (e as Error).message}, 400);
          }
        }
        if (action === 'render') {
          if (body.v !== undefined && !job.versions.some((x) => x.v === Number(body.v))) return json({error: 'unknown version'}, 400);
          jobRun(job, 'render', 'render', body.v ? ['--version', String(Number(body.v))] : [], [id]);
          return json({ok: true});
        }
        if (action === 'revise') {
          const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 4000) : '';
          if (!feedback) return json({error: 'feedback is required'}, 400);
          return json({run: jobRun(job, 'revise', 'revise', [], [id, feedback])});
        }
        if (action === 'reformat') {
          if (typeof body.format !== 'string' || !(body.format in formats)) return json({error: 'bad format'}, 400);
          return json({run: jobRun(job, 'reformat', `reformat ${body.format}`, ['--format', body.format], [id])});
        }
        if (action === 'apply-comments') {
          const open = commentsOf(id).filter((c) => !c.resolved);
          if (!open.length) return json({error: 'no open comments'}, 400);
          // Comments are resolved only when the revision really succeeded (see finish()), so a failed run never loses client feedback.
          return json({run: jobRun(job, 'revise', 'apply comments', [], [id, `Client review comments:\n${commentsToFeedback(id, open)}`], open.map((c) => c.id))});
        }
        if (action === 'export') {
          const runs = user(() => exportRuns(job, body));
          return json({runs});
        }
        // winner
        if (!job.versions.some((x) => x.v === body.v)) return json({error: 'unknown version'}, 400);
        saveJob({...loadJob(id), winner: body.v});
        return json({ok: true});
      }

      // ── runs
      if (method === 'GET' && p === '/api/runs') return json(runList());
      if ((r = m(/^\/api\/runs\/([\w-]+)(?:\/(cancel|retry))?$/))) {
        const [, id, action] = r;
        const view = runView(id);
        if (!view) return json({error: 'unknown run'}, 404);
        if (method === 'GET' && !action) return json({...view.run, log: view.tail});
        if (method !== 'POST' || !action) return json({error: 'method not allowed'}, 405);
        if (action === 'cancel') {
          cancelRun(id);
          return json({ok: true});
        }
        const meta = readMeta(id);
        if (!meta) return json({error: 'this run cannot be retried'}, 409);
        if (view.run.status === 'running' || view.run.status === 'waiting') return json({error: 'this run is still active'}, 409);
        if (meta.jobId && isBusy(meta.jobId)) return json({error: 'this job is busy, wait for the current task to finish'}, 409);
        const {kind, label, command, options, text, resolves} = meta;
        return json({run: enqueueRun({kind, label, jobId: meta.kind === 'make' ? undefined : meta.jobId, command, options, text, resolves})});
      }

      // ── make
      if (method === 'POST' && p === '/api/make') {
        const made = parseMake(await readJson(req));
        if (made.template) bumpTemplateUses(made.template);
        return json({run: enqueueRun({kind: 'make', label: made.label, command: 'make', options: made.options, text: made.text})});
      }

      // ── options / settings / usage
      if (method === 'GET' && p === '/api/options') return json({formats: Object.keys(formats), styles: styleOptions(), music: [...musicPresets], voices: voiceList(), sceneTypes});
      if (method === 'GET' && p === '/api/settings') return json(settingsView());
      if (method === 'PUT' && p === '/api/settings') {
        saveSettings(await readJson(req));
        return json(settingsView());
      }
      if (method === 'GET' && p === '/api/models') return json(await availableModels().catch(() => [] as string[]));
      if (method === 'GET' && p === '/api/usage') return json(usage());
      if (method === 'POST' && p === '/api/settings/test') {
        const body = await readJson(req);
        const models = String(body.models ?? '').split(',').map((x: string) => x.trim()).filter(Boolean).slice(0, 8);
        if (!models.length) return json({error: 'no model'}, 400);
        const started = Date.now();
        try {
          const {chat} = await import('./llm');
          const out = await chat({role: 'settings-test', models, messages: [{role: 'user', content: 'Reply with one short Arabic word meaning "ready".'}], maxTokens: 800, timeoutMs: 90_000});
          return json({ok: true, model: out.model, ms: Date.now() - started, reply: out.text.trim().slice(0, 40)});
        } catch (e) {
          return json({ok: false, error: (e as Error).message.split('\n').slice(0, 2).join(' ').slice(0, 300)});
        }
      }

      // ── styles
      if (method === 'GET' && p === '/api/styles') return json(listStyles());
      if (method === 'POST' && p === '/api/styles/generate') {
        const body = await readJson(req);
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        if (prompt.length < 3 || prompt.length > 2000) throw new HttpError(400, 'prompt must be 3 to 2000 characters');
        try {
          return json(await generatePack(prompt, body.base));
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
      }
      if (method === 'POST' && p === '/api/styles') {
        const body = await readJson(req);
        return json(styleCall(() => saveStyle(body)));
      }
      if ((r = m(/^\/api\/styles\/([^/]+)$/))) {
        const id = styleId(r[1]);
        if (method === 'PUT') {
          const body = await readJson(req);
          return json(styleCall(() => saveStyle(body, id)));
        }
        if (method === 'DELETE') {
          const users = readProfiles().filter((c) => c.defaults?.style === id).map((c) => c.props.theme.client);
          if (users.length) return json({error: `this style is the default for ${users.join(', ')}; change that first`}, 409);
          styleCall(() => deleteStyle(id));
          return json({ok: true});
        }
        return json({error: 'method not allowed'}, 405);
      }

      // ── clients
      if (method === 'GET' && p === '/api/clients') {
        const counts = clientCounts();
        return json(readProfiles().map((c) => profileView(c, counts)));
      }
      if (method === 'POST' && (r = m(/^\/api\/clients\/([^/]+)\/design-system$/))) {
        const id = clientId(r[1]);
        const profile = profileOf(id);
        if (!profile) throw new HttpError(404, 'unknown client');
        let name: string;
        try {
          name = decodeURIComponent(String(req.headers['x-filename'] ?? ''));
        } catch {
          throw new HttpError(400, 'bad file name');
        }
        const filename = name.replace(/\\/g, '/').split('/').pop() ?? '';
        const ext = path.extname(filename).toLowerCase();
        if (!DS_EXT.includes(ext)) throw new HttpError(400, `file type not allowed (${DS_EXT.join(' ')})`);
        const tmp = await uploadToTemp(req, ext, MAX_DS);
        try {
          return json(await importDesignSystem(tmp, filename, profile.props.theme));
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        } finally {
          rmSync(tmp, {force: true});
        }
      }
      if ((r = m(/^\/api\/clients\/([^/]+)(?:\/(duplicate|archive))?$/))) {
        const [, rawId, action] = r;
        const id = clientId(rawId);
        const counts = () => clientCounts();
        if (method === 'PUT' && !action) {
          const body = await readJson(req);
          return json(profileView(user(() => saveProfile(id, body.theme, body.defaults, url.searchParams.get('create') === '1')), counts()));
        }
        if (method === 'POST' && action === 'duplicate') {
          const body = await readJson(req);
          return json(profileView(user(() => duplicateProfile(id, body.id)), counts()));
        }
        if (method === 'POST' && action === 'archive') {
          const body = await readJson(req);
          if (typeof body.archived !== 'boolean') return json({error: 'archived must be true or false'}, 400);
          return json(profileView(user(() => archiveProfile(id, body.archived)), counts()));
        }
        return json({error: 'method not allowed'}, 405);
      }
      if (method === 'POST' && p === '/api/brand') {
        const body = await readJson(req);
        if (typeof body.url !== 'string' || !/^https?:\/\/[^\s]{1,300}$/.test(body.url)) return json({error: 'enter a full http(s) address'}, 400);
        try {
          await assertPublicUrl(body.url);
          const hostSlug = new URL(body.url).hostname.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
          const brand = await fetchBrand(body.url, `_brand-${hostSlug}`);
          const base = readProfiles().find((x) => !x.archived)?.props.theme ?? readProfiles()[0].props.theme;
          const themed = brandTheme(base, brand.colors);
          const colors: Partial<Theme['colors']> = {};
          for (const k of ['primary', 'accent'] as const) if (themed.colors[k] !== base.colors[k]) colors[k] = themed.colors[k];
          const f = brand.facts;
          const facts = [f.oneLiner, f.audience, ...f.features, ...f.numbers.map((n) => `${n.value} ${n.meaning}`), ...f.prices, f.cta].map((x) => String(x).trim()).filter(Boolean);
          return json({theme: {client: f.brandName, ...(Object.keys(colors).length ? {colors} : {})}, ...(brand.logo ? {logo: `/${brand.logo}`} : {}), facts});
        } catch (e) {
          return json({error: `could not read that site: ${(e as Error).message.split('\n')[0].slice(0, 160)}`}, 502);
        }
      }

      // ── assets
      if (p === '/api/assets') {
        const client = url.searchParams.get('client') ?? '';
        if (method === 'GET') return json(user(() => listAssets(client || undefined)));
        if (method === 'POST') {
          let name: string;
          try {
            name = decodeURIComponent(String(req.headers['x-filename'] ?? ''));
          } catch {
            throw new HttpError(400, 'bad file name');
          }
          const asset = await saveUpload(req, client, name).catch((e: Error) => {
            throw new HttpError(/too large/.test(e.message) ? 413 : 400, e.message);
          });
          return json(asset);
        }
        if (method === 'DELETE') {
          user(() => deleteAsset(client, url.searchParams.get('name') ?? ''));
          return json({ok: true});
        }
        return json({error: 'method not allowed'}, 405);
      }

      // ── templates
      if (p === '/api/templates' && method === 'GET') return json(readTemplates());
      if (p === '/api/templates' && method === 'POST') {
        const body = await readJson(req);
        return json(user(() => createTemplate(body)));
      }
      if ((r = m(/^\/api\/templates\/([\w-]+)$/)) && method === 'DELETE') {
        user(() => deleteTemplate(r![1]));
        return json({ok: true});
      }

      // ── review
      if ((r = m(/^\/api\/review\/([\w-]+)$/)) && method === 'GET') {
        if (!tokenOk(r[1], url.searchParams.get('t'))) return json({error: 'invalid review link'}, 403);
        return json(reviewView(r[1]));
      }
      if ((r = m(/^\/api\/review\/([\w-]+)\/decision$/)) && method === 'POST') {
        const body = await readJson(req);
        if (!tokenOk(r[1], body.token)) return json({error: 'invalid review link'}, 403);
        if (body.status !== 'approved' && body.status !== 'changes') return json({error: 'bad status'}, 400);
        if (isBusy(r[1])) return json({error: 'the video is being updated, try again in a minute'}, 409);
        saveJob({...loadJob(r[1]), approval: {status: body.status, at: new Date().toISOString()}});
        return json({ok: true});
      }
      return json({error: 'not found'}, 404);
    }

    // ── files and the SPA (GET/HEAD only)
    if (method !== 'GET' && method !== 'HEAD') return send(res, 404, 'not found');
    const rel = decodeURIComponent(p);
    if (rel.startsWith('/files/') && rel.split('/').some((s) => s.startsWith('.'))) return send(res, 404, 'not found');
    if (rel.startsWith('/files/')) {
      // The public review page loads its video/cover with the review token instead of a session.
      if (!authed && !(tokenOk(rel.split('/')[2], url.searchParams.get('t')) && /\.(mp4|jpe?g|png|webp)$/i.test(rel))) return send(res, 401, 'login required'); // a review link opens videos and stills only, never job.json/ledgers
      return serveFile(res, config.dirs.jobs, rel.slice(7), req.headers.range);
    }
    if (rel.startsWith('/assets/') && fileUnder(path.join(DIST, 'assets'), rel.slice(8))) return serveFile(res, path.join(DIST, 'assets'), rel.slice(8), undefined, false, 'public, max-age=31536000, immutable');
    // Brand/job assets for the live Player (staticFile paths resolve to /jobs/…, /music/…) and the asset library.
    if (/^\/(jobs|music|sfx|clients)\//.test(rel) && fileUnder(PUB, rel.slice(1))) {
      if (!authed) return send(res, 401, 'login required');
      return serveFile(res, PUB, rel.slice(1), req.headers.range);
    }
    if (!existsSync(path.join(DIST, 'index.html'))) return send(res, 503, 'UI not built: run `npm run editor`');
    if (rel !== '/' && !rel.endsWith('/index.html') && fileUnder(DIST, rel.slice(1))) return serveFile(res, DIST, rel.slice(1), undefined, false);
    res.setHeader('cache-control', 'no-cache');
    return serveFile(res, DIST, 'index.html', undefined, false);
  } catch (e) {
    const code = e instanceof HttpError ? e.code : e instanceof SyntaxError || e instanceof URIError ? 400 : 500;
    if (code === 500) console.error(e);
    const message = code === 500 ? 'internal error' : e instanceof HttpError ? e.message : 'bad request';
    if (!res.headersSent) jsonOut(res, code, {error: message});
    else res.destroy();
  }
};

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runsDir();
  createServer(handler).listen(PORT, '127.0.0.1', () => console.log(`Motion Studio dashboard → http://localhost:${PORT}`));
  // Second listener on the Tailscale address only. Tailscale may come up after login, so keep trying until it does.
  const bindTailnet = () => {
    const t = tailnet();
    if (!t) return setTimeout(bindTailnet, 30_000);
    allowTailnet(t);
    createServer(handler)
      .on('error', () => setTimeout(bindTailnet, 30_000))
      .listen(PORT, t.ip, () => console.log(`Tailscale → http://${t.name || t.ip}:${PORT}`));
  };
  bindTailnet();
  for (const sig of ['SIGINT', 'SIGTERM'] as const)
    process.on(sig, () => {
      stopAll();
      process.exit(0);
    });
}
