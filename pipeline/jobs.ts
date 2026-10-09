import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import type {Format, VideoProps} from '../src/schema';
import {config} from './config';
import type {Dialect, Lang} from './prompts';
import type {QaReport} from './qa';

export type Version = {
  v: number;
  createdAt: string;
  feedback?: string;
  variant?: string; // A/B variant label (the hook it tests)
  critic?: {score: number; issues: string[]};
  locks?: string[]; // field paths edited by hand in this version (AI revisions keep them)
  models: Record<string, string>;
  qa?: QaReport;
  notes: string[];
  videos: Record<string, string>; // format -> mp4 path (relative to job dir)
  review?: string;
};

export type Job = {
  id: string;
  idea: string;
  client: string;
  lang: Lang;
  dialect: Dialect;
  format: Format;
  seconds: number;
  voice?: string; // TTS voice used for every version of this job
  style?: string; // style pack id
  images?: boolean; // whether AI images/video were enabled (manual saves respect it)
  music?: string; // music preset name, public/ path, or 'none'
  hooks?: {text: string; technique: string; score: number}[]; // ranked hook tournament results
  createdAt: string;
  brief?: unknown;
  url?: string;
  facts?: unknown; // verified facts scraped from the client's website
  winner?: number; // A/B version picked in the UI
  approval?: {status: 'approved' | 'changes'; at: string}; // client decision on the review page
  template?: string; // template id the video was made from
  versions: Version[];
};

export const jobDir = (id: string) => path.join(config.dirs.jobs, id);
export const versionDir = (id: string, v: number) => path.join(jobDir(id), `v${v}`);
export const propsFile = (id: string, v: number) => path.join(versionDir(id, v), 'props.json');
export const ledgerFile = (id: string) => path.join(jobDir(id), 'ledger.jsonl');

const slug = (idea: string) =>
  idea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'video';

export const newJobId = (idea: string, now = new Date()) => {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  let id = `${stamp}-${slug(idea)}`;
  for (let n = 2; existsSync(jobDir(id)); n++) id = `${stamp}-${slug(idea)}-${n}`;
  return id;
};

// Write-then-rename so readers (the dashboard) never see a half-written file.
export const writeAtomic = (file: string, data: string, mode?: number) => {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data, mode === undefined ? undefined : {mode}); // mode at creation: secrets are never briefly world-readable
  renameSync(tmp, file);
};

export const saveJob = (job: Job) => {
  mkdirSync(jobDir(job.id), {recursive: true});
  writeAtomic(path.join(jobDir(job.id), 'job.json'), JSON.stringify(job, null, 2));
};

export const loadJob = (id: string): Job => {
  const file = path.join(jobDir(id), 'job.json');
  if (!existsSync(file)) {
    const known = existsSync(config.dirs.jobs) ? readdirSync(config.dirs.jobs).slice(-10).join(', ') : 'none';
    throw new Error(`job "${id}" not found. Recent jobs: ${known}`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
};

export const latestJobId = () => {
  if (!existsSync(config.dirs.jobs)) return null;
  const ids = readdirSync(config.dirs.jobs).filter((d) => existsSync(path.join(config.dirs.jobs, d, 'job.json'))).sort();
  return ids[ids.length - 1] ?? null;
};

export const saveProps = (id: string, v: number, props: VideoProps) => {
  mkdirSync(versionDir(id, v), {recursive: true});
  writeAtomic(propsFile(id, v), JSON.stringify(props, null, 2));
};
// Older versions predate style packs / display fonts / logo names: fill the defaults so they still load, edit and render.
export const migrateProps = (raw: Record<string, unknown>): VideoProps => {
  const p = raw as VideoProps & Record<string, unknown>;
  return {
    ...p,
    style: p.style ?? 'premium-tech',
    theme: {...p.theme, displayFont: p.theme.displayFont ?? 'none'},
    scenes: p.scenes.map((s) => (s.type === 'logo' && typeof (s as {name?: unknown}).name !== 'string' ? {...s, name: ''} : s)),
  };
};

export const loadProps = (id: string, v: number): VideoProps => migrateProps(JSON.parse(readFileSync(propsFile(id, v), 'utf8')));
