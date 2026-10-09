import {createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import type {IncomingMessage} from 'node:http';
import {sceneSchema, FPS} from '../src/schema';
import {ROOT} from './config';
import {loadJob, loadProps, writeAtomic} from './jobs';
import {isImageBytes} from './brand';
import {readProfiles, validClientId} from './profiles';

// Asset library (public/clients/<client>/assets/*) and scene templates (templates.json). Env overrides exist for tests.
export const PUBLIC = process.env.MOTION_PUBLIC ?? path.join(ROOT, 'public');
export const templatesFile = process.env.MOTION_TEMPLATES ?? path.join(ROOT, 'templates.json');

// ── Assets ───────────────────────────────────────────────────────────────────
export type AssetKind = 'logo' | 'screenshot' | 'image' | 'clip' | 'music';
export type Asset = {name: string; kind: AssetKind; url: string; bytes: number; addedAt: string; client: string};

const EXT: Record<string, AssetKind | 'imagefile'> = {'.mp3': 'music', '.wav': 'music', '.m4a': 'music', '.mp4': 'clip', '.mov': 'clip', '.webm': 'clip', '.svg': 'imagefile', '.png': 'imagefile', '.jpg': 'imagefile', '.jpeg': 'imagefile', '.webp': 'imagefile'};
export const MAX_ASSET = 200 * 1024 * 1024;
const MAX_IMAGE = 25 * 1024 * 1024;

export const assetsDir = (client: string) => path.join(PUBLIC, 'clients', client, 'assets');
export const assetUrl = (client: string, name: string) => `/clients/${client}/assets/${encodeURIComponent(name)}`;

export const kindOf = (name: string): AssetKind | null => {
  const k = EXT[path.extname(name).toLowerCase()];
  return !k ? null : k === 'imagefile' ? (/logo/i.test(name) ? 'logo' : 'screenshot') : k;
};

// Basename only, [\w.-] only, no leading dot, whitelisted extension; throws otherwise.
export const sanitizeName = (raw: string) => {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? '';
  const ext = path.extname(base).toLowerCase();
  const stem = path.basename(base, path.extname(base)).replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '').replace(/\.{2,}/g, '.').slice(0, 80);
  if (!stem) throw new Error('bad file name');
  if (!(ext in EXT)) throw new Error(`file type not allowed (${Object.keys(EXT).join(' ')})`);
  return `${stem}${ext}`;
};

const knownClient = (client: string) => validClientId(client) && readProfiles().some((p) => p.id === client);

const toAsset = (client: string, name: string): Asset | null => {
  const kind = kindOf(name);
  const file = path.join(assetsDir(client), name);
  if (!kind || name.startsWith('.') || !existsSync(file)) return null;
  const st = statSync(file);
  return st.isFile() ? {name, kind, url: assetUrl(client, name), bytes: st.size, addedAt: st.mtime.toISOString(), client} : null;
};

export const listAssets = (client?: string): Asset[] => {
  const ids = client ? [client] : readProfiles().map((p) => p.id);
  if (client && !validClientId(client)) throw new Error('bad client');
  return ids
    .flatMap((c) => (existsSync(assetsDir(c)) ? readdirSync(assetsDir(c)).flatMap((n) => toAsset(c, n) ?? []) : []))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
};

// Streams the request body to a temp file (never buffered whole), then renames to a free name (-2, -3…).
export const saveUpload = async (req: IncomingMessage, client: string, rawName: string): Promise<Asset> => {
  if (!knownClient(client)) throw new Error('unknown client');
  const name = sanitizeName(rawName);
  const dir = assetsDir(client);
  mkdirSync(dir, {recursive: true});
  const tmp = path.join(dir, `.upload-${randomBytes(6).toString('hex')}.tmp`);
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_ASSET) throw new Error('file too large (max 200 MB)');
  const out = createWriteStream(tmp);
  let size = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_ASSET) {
          reject(new Error('file too large (max 200 MB)'));
          req.unpipe(out);
          out.destroy();
          req.resume(); // drain the rest so the error response can be sent
        }
      });
      req.on('error', reject);
      req.on('aborted', () => reject(new Error('upload aborted')));
      out.on('error', reject);
      out.on('finish', resolve);
      req.pipe(out);
    });
    if (size === 0) throw new Error('empty file');
    if (kindOf(name) === 'logo' || kindOf(name) === 'screenshot') {
      if (size > MAX_IMAGE) throw new Error('image too large (max 25 MB)');
      if (!isImageBytes(readFileSync(tmp))) throw new Error('not a valid image (scripted SVGs are refused)');
    }
    const ext = path.extname(name);
    const stem = name.slice(0, -ext.length);
    let final = name;
    for (let n = 2; existsSync(path.join(dir, final)); n++) final = `${stem}-${n}${ext}`;
    renameSync(tmp, path.join(dir, final));
    return toAsset(client, final)!;
  } catch (e) {
    rmSync(tmp, {force: true});
    throw e;
  }
};

export const deleteAsset = (client: string, rawName: string) => {
  if (!knownClient(client)) throw new Error('unknown client');
  const name = sanitizeName(rawName);
  if (name !== rawName) throw new Error('bad file name');
  const file = path.join(assetsDir(client), name);
  if (!existsSync(file)) throw new Error('asset not found');
  rmSync(file);
};

// "/clients/<client>/assets/<name>" (as the UI sends it) → absolute file path, for the CLI's --screens/--clips/--logo.
export const assetPathFromUrl = (client: string, url: unknown): string => {
  const m = typeof url === 'string' ? url.match(/^\/clients\/([a-z0-9][a-z0-9-]{0,31})\/assets\/([^/?#]+)$/) : null;
  let name: string;
  try {
    name = m ? decodeURIComponent(m[2]) : '';
  } catch {
    name = '';
  }
  if (!m || m[1] !== client || !name || name !== sanitizeName(name)) throw new Error('asset must be a file from this client\'s library');
  const file = path.join(assetsDir(client), name);
  if (!existsSync(file)) throw new Error(`asset not found: ${name}`);
  return file;
};

// ── Templates ────────────────────────────────────────────────────────────────
export type Template = {id: string; name: string; category: 'launch' | 'explainer' | 'offer' | 'event' | 'other'; description: string; scenes: {type: string; seconds: number}[]; style?: string; music?: string; uses: number; createdAt: string};
export const CATEGORIES = ['launch', 'explainer', 'offer', 'event', 'other'] as const;
export const sceneTypes: string[] = sceneSchema.options.map((o) => o.shape.type.value);

export const readTemplates = (): Template[] => (existsSync(templatesFile) ? JSON.parse(readFileSync(templatesFile, 'utf8')) : []);
export const getTemplate = (id: string) => readTemplates().find((t) => t.id === id);
const writeTemplates = (list: Template[]) => writeAtomic(templatesFile, JSON.stringify(list, null, 2) + '\n');

const cleanScenes = (raw: unknown): Template['scenes'] => {
  // Same bounds as a storyboard (pipeline/storyboard.ts), or the writer could never satisfy the template.
  if (!Array.isArray(raw) || raw.length < 4 || raw.length > 12) throw new Error('scenes: 4 to 12 items');
  return raw.map((s) => {
    const seconds = Math.round(Number(s?.seconds) * 10) / 10;
    if (!sceneTypes.includes(s?.type) || !(seconds >= 1 && seconds <= 30)) throw new Error('bad scene (type or seconds 1-30)');
    return {type: s.type as string, seconds};
  });
};

export const createTemplate = (body: Record<string, unknown>): Template => {
  const name = String(body.name ?? '').trim().slice(0, 60);
  if (!name) throw new Error('name is required');
  const category = (CATEGORIES as readonly string[]).includes(body.category as string) ? (body.category as Template['category']) : 'other';
  let scenes: Template['scenes'];
  if (body.fromJob !== undefined) {
    const id = String(body.fromJob);
    if (!/^[\w-]+$/.test(id)) throw new Error('bad job');
    const job = loadJob(id);
    const v = body.v === undefined ? job.versions.at(-1)?.v : Number(body.v);
    if (!v || !job.versions.some((x) => x.v === v)) throw new Error('unknown version');
    scenes = loadProps(id, v).scenes.map((s) => ({type: s.type, seconds: Math.round((s.duration / FPS) * 10) / 10}));
  } else scenes = cleanScenes(body.scenes);
  const list = readTemplates();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'template';
  let id = slug;
  for (let n = 2; list.some((t) => t.id === id); n++) id = `${slug}-${n}`;
  const t: Template = {id, name, category, description: String(body.description ?? '').trim().slice(0, 200), scenes, uses: 0, createdAt: new Date().toISOString()};
  writeTemplates([...list, t]);
  return t;
};

export const deleteTemplate = (id: string) => {
  const list = readTemplates();
  if (!list.some((t) => t.id === id)) throw new Error('unknown template');
  writeTemplates(list.filter((t) => t.id !== id));
};

export const bumpTemplateUses = (id: string) => {
  const list = readTemplates();
  const t = list.find((x) => x.id === id);
  if (t) {
    t.uses++;
    writeTemplates(list);
  }
};
