import {readFileSync} from 'node:fs';
import path from 'node:path';
import {themeSchema, type Theme, type VideoProps} from '../src/schema';
import {packIds} from '../src/design/packs';
import {formats} from '../src/schema';
import {ROOT} from './config';
import {writeAtomic} from './jobs';
import {musicPresets} from './music';

// Client profiles: src/profiles.json is the source of truth (Root.tsx maps them to Promo-<id> compositions).
export const profilesFile = process.env.MOTION_PROFILES ?? path.join(ROOT, 'src', 'profiles.json');
export const DIALECTS = ['msa', 'egyptian', 'gulf', 'levantine'] as const;

export type Defaults = {style?: string; music?: string; voice?: string; dialect?: (typeof DIALECTS)[number]; format?: keyof typeof formats; url?: string};
export type StoredProfile = {id: string; archived?: boolean; updatedAt?: string; defaults: Defaults; props: VideoProps};

export const validClientId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(id);

export const readProfiles = (): StoredProfile[] => JSON.parse(readFileSync(profilesFile, 'utf8'));
export const writeProfiles = (list: StoredProfile[]) => writeAtomic(profilesFile, JSON.stringify(list, null, 2) + '\n');

// Whitelist every field; anything unknown is dropped, anything invalid throws.
export const cleanDefaults = (raw: unknown): Defaults => {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Defaults = {};
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '');
  if (str('style')) {
    if (!packIds.includes(str('style') as never)) throw new Error('bad style');
    out.style = str('style');
  }
  if (str('music')) {
    if (!(musicPresets as readonly string[]).includes(str('music')) && str('music') !== 'none') throw new Error('bad music');
    out.music = str('music');
  }
  if (str('voice')) {
    if (!/^[\w.-]{1,80}$/.test(str('voice'))) throw new Error('bad voice');
    out.voice = str('voice');
  }
  if (str('dialect')) {
    if (!(DIALECTS as readonly string[]).includes(str('dialect'))) throw new Error('bad dialect');
    out.dialect = str('dialect') as Defaults['dialect'];
  }
  if (str('format')) {
    if (!(str('format') in formats)) throw new Error('bad format');
    out.format = str('format') as Defaults['format'];
  }
  if (str('url')) {
    if (!/^https?:\/\/[^\s]{1,300}$/.test(str('url'))) throw new Error('bad url');
    out.url = str('url');
  }
  return out;
};

export const parseTheme = (raw: unknown): Theme => {
  const r = themeSchema.safeParse(raw);
  if (!r.success) throw new Error(`bad theme: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data;
};

// Creates the profile when missing (props copied from the first profile, theme replaced).
export const saveProfile = (id: string, themeRaw: unknown, defaultsRaw: unknown, createOnly = false): StoredProfile => {
  if (!validClientId(id)) throw new Error('bad client id');
  if (createOnly && readProfiles().some((p) => p.id === id)) throw new Error(`a client with the id "${id}" already exists`);
  const theme = parseTheme(themeRaw);
  const defaults = cleanDefaults(defaultsRaw);
  const list = readProfiles();
  const at = new Date().toISOString();
  const i = list.findIndex((p) => p.id === id);
  const next: StoredProfile =
    i >= 0 ? {...list[i], defaults, updatedAt: at, props: {...list[i].props, theme}} : {id, defaults, updatedAt: at, props: {...structuredClone(list[0].props), theme}};
  if (i >= 0) list[i] = next;
  else list.push(next);
  writeProfiles(list);
  return next;
};

export const duplicateProfile = (id: string, newId: string): StoredProfile => {
  if (!validClientId(newId)) throw new Error('bad client id');
  const list = readProfiles();
  const src = list.find((p) => p.id === id);
  if (!src) throw new Error('unknown client');
  if (list.some((p) => p.id === newId)) throw new Error('client id already exists');
  const next: StoredProfile = {...structuredClone(src), id: newId, archived: undefined, updatedAt: new Date().toISOString()};
  delete next.archived;
  writeProfiles([...list, next]);
  return next;
};

export const archiveProfile = (id: string, archived: boolean): StoredProfile => {
  const list = readProfiles();
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error('unknown client');
  if (archived) p.archived = true;
  else delete p.archived;
  p.updatedAt = new Date().toISOString();
  writeProfiles(list);
  return p;
};
