import type {VideoProps} from '../../../src/schema';

// The one contract between the studio UI and pipeline/server.ts. Every endpoint is JSON; errors are {error: string}.
// Paths in responses (cover, video, url) are URLs the browser can load directly.

export type Format = '9:16' | '1:1' | '4:5' | '16:9';
export type Dialect = 'msa' | 'egyptian' | 'gulf' | 'levantine';
export type Tier = 'draft' | 'standard' | 'premium';

export type VersionSummary = {
  v: number;
  createdAt: string;
  variant?: string; // A/B hook label
  feedback?: string;
  qaScore?: number; // 0–10
  criticScore?: number; // 0–10
  notes: string[];
  videos: Record<string, string>; // format -> URL (/files/<job>/v2/video-9x16.mp4)
  cover?: string; // URL of the first scene still
  stills: string[]; // URLs, one per scene
  seconds: number;
  scenes: number;
};

export type JobSummary = {
  id: string;
  client: string; // profile id
  clientName: string;
  idea: string;
  format: Format;
  style?: string;
  music?: string;
  createdAt: string;
  busy: boolean;
  winner?: number; // chosen A/B version
  approval?: {status: 'approved' | 'changes'; at: string};
  openComments: number;
  reviewUrl: string; // /review/<id>?t=<token>
  versions: VersionSummary[];
};

export type MakeRequest = {
  idea: string;
  client: string;
  format: Format;
  dialect: Dialect;
  seconds: number; // 10–90
  tier: Tier;
  style?: string; // pack id; empty = director picks
  music?: string; // preset or 'none'; empty = director picks
  gender: 'male' | 'female';
  voice?: string; // overrides gender
  url?: string;
  brandTheme?: boolean;
  draft?: boolean;
  qaFix?: boolean;
  variants?: number; // 1–5
  template?: string; // template id: fixes the scene structure
  screens?: string[]; // asset URLs from the library
  clips?: string[];
  logo?: string;
};

export type RunStatus = 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';
export type Run = {
  id: string; // log file name without .log
  kind: 'make' | 'revise' | 'reformat' | 'render';
  label: string; // human title, e.g. "Linear launch · render"
  jobId?: string; // known once the job exists
  status: RunStatus;
  progress: number; // 0–1, best effort
  step: string; // last meaningful log line
  startedAt: string;
  endedAt?: string;
};
export type RunDetail = Run & {log: string};

export type Settings = {
  roles: {role: string; label: string; models: string[]; defaults: string[]; custom: boolean}[];
  voice: string; // '' = auto by dialect
  voiceRate: string; // e.g. +6%
  voices: string[]; // Edge voice ids
};
export type SettingsUpdate = {models: Record<string, string[]>; voice: string; voiceRate: string} | {reset: true};
export type ModelTest = {ok: true; model: string; ms: number; reply: string} | {ok: false; error: string};
export type Usage = {model: string; calls: number; failures: number; chars?: number}[];

export type Theme = VideoProps['theme'];
export type ClientProfile = {
  id: string; // [a-z0-9-]
  archived?: boolean;
  theme: Theme;
  defaults: {style?: string; music?: string; voice?: string; dialect?: Dialect; format?: Format; url?: string};
  videos: number; // jobs using this client
  updatedAt?: string;
};
export type ClientInput = {theme: Theme; defaults: ClientProfile['defaults']};

export type AssetKind = 'logo' | 'screenshot' | 'image' | 'clip' | 'music';
export type Asset = {name: string; kind: AssetKind; url: string; bytes: number; addedAt: string; client: string};

export type Template = {
  id: string;
  name: string;
  category: 'launch' | 'explainer' | 'offer' | 'event' | 'other';
  description: string;
  scenes: {type: string; seconds: number}[];
  style?: string;
  music?: string;
  uses: number;
  createdAt: string;
};
export type TemplateInput = {name: string; category: Template['category']; description: string; fromJob?: string; v?: number; scenes?: Template['scenes']};

export type ExportRequest = {v: number; formats: Format[]};

export type Options = {
  formats: Format[];
  styles: {id: string; label: string; custom?: boolean}[]; // built-in packs first, then saved custom styles
  music: string[];
  voices: string[];
  sceneTypes: string[];
};

export type Review = {
  id: string;
  client: string;
  title: string;
  v: number;
  video?: string; // URL; missing while rendering
  cover?: string;
  seconds: number;
  approval?: JobSummary['approval'];
  comments: {id: string; time: number; text: string; author: string; at: string; scene: number}[];
};

// A style pack = the motion personality of a video (src/design/packs.ts `Pack`).
export type Pack = import('../../../src/design/packs').Pack;
export type CustomStyle = {id: string; name: string; prompt: string; pack: Pack; createdAt: string; updatedAt?: string};
export type StyleInput = {name: string; prompt: string; pack: Pack};

// Design system import: the AI maps an uploaded design system onto a client theme. Nothing is saved until the client is saved.
export type DesignImport = {theme: Theme; notes: string[]; source: string[]}; // notes: mapping decisions (e.g. font substitutions); source: files read

export type AuthState = {authenticated: boolean; pinSet: boolean; canSetPin: boolean}; // canSetPin: only from the Mac itself (localhost)

// Thrown for 401 so pages can send the user to /login.
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

const req = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  const r = await fetch(url, {method, headers: body === undefined ? {} : {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await r.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(text.slice(0, 200) || r.statusText, r.status);
  }
  if (r.status === 401 && !url.startsWith('/api/auth/') && !location.pathname.startsWith('/review/') && !location.pathname.startsWith('/login')) {
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  if (!r.ok) throw new ApiError((data as {error?: string}).error ?? r.statusText, r.status);
  return data as T;
};

export const api = {
  options: () => req<Options>('GET', '/api/options'),

  jobs: () => req<JobSummary[]>('GET', '/api/jobs'),
  job: (id: string) => req<JobSummary>('GET', `/api/jobs/${id}/summary`),
  make: (body: MakeRequest) => req<{run: string}>('POST', '/api/make', body),
  revise: (id: string, feedback: string) => req<{run: string}>('POST', `/api/jobs/${id}/revise`, {feedback}),
  reformat: (id: string, format: Format) => req<{run: string}>('POST', `/api/jobs/${id}/reformat`, {format}),
  applyComments: (id: string) => req<{run: string}>('POST', `/api/jobs/${id}/apply-comments`, {}),
  exportVideo: (id: string, body: ExportRequest) => req<{runs: string[]}>('POST', `/api/jobs/${id}/export`, body),
  pickWinner: (id: string, v: number) => req<{ok: true}>('POST', `/api/jobs/${id}/winner`, {v}),

  runs: () => req<Run[]>('GET', '/api/runs'),
  run: (id: string) => req<RunDetail>('GET', `/api/runs/${id}`),
  cancelRun: (id: string) => req<{ok: true}>('POST', `/api/runs/${id}/cancel`, {}),
  retryRun: (id: string) => req<{run: string}>('POST', `/api/runs/${id}/retry`, {}),

  settings: () => req<Settings>('GET', '/api/settings'),
  saveSettings: (body: SettingsUpdate) => req<Settings>('PUT', '/api/settings', body),
  models: () => req<string[]>('GET', '/api/models'),
  testModels: (models: string[]) => req<ModelTest>('POST', '/api/settings/test', {models: models.join(',')}),
  usage: () => req<Usage>('GET', '/api/usage'),

  clients: () => req<ClientProfile[]>('GET', '/api/clients'),
  // create=true refuses an id that already exists, so a new client can never overwrite one.
  saveClient: (id: string, body: ClientInput, create = false) => req<ClientProfile>('PUT', `/api/clients/${id}${create ? '?create=1' : ''}`, body),
  duplicateClient: (id: string, newId: string) => req<ClientProfile>('POST', `/api/clients/${id}/duplicate`, {id: newId}),
  archiveClient: (id: string, archived: boolean) => req<ClientProfile>('POST', `/api/clients/${id}/archive`, {archived}),
  brandFromUrl: (url: string) => req<{theme: Partial<Theme>; logo?: string; facts: string[]}>('POST', '/api/brand', {url}),

  assets: (client?: string) => req<Asset[]>('GET', `/api/assets${client ? `?client=${encodeURIComponent(client)}` : ''}`),
  // Raw upload (no multipart): the file body with its name in a header.
  uploadAsset: async (client: string, file: File) => {
    const r = await fetch(`/api/assets?client=${encodeURIComponent(client)}`, {method: 'POST', headers: {'x-filename': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream'}, body: file});
    const data = await r.json().catch(() => ({error: r.statusText}));
    if (!r.ok) throw new ApiError(data.error ?? r.statusText, r.status);
    return data as Asset;
  },
  // Raw upload of a design system export (zip, md, css, json, html, txt); returns a proposed theme, not saved.
  importDesignSystem: async (client: string, file: File) => {
    const r = await fetch(`/api/clients/${encodeURIComponent(client)}/design-system`, {method: 'POST', headers: {'x-filename': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream'}, body: file});
    const data = await r.json().catch(() => ({error: r.statusText}));
    if (!r.ok) throw new ApiError(data.error ?? r.statusText, r.status);
    return data as DesignImport;
  },
  deleteAsset: (client: string, name: string) => req<{ok: true}>('DELETE', `/api/assets?client=${encodeURIComponent(client)}&name=${encodeURIComponent(name)}`),

  templates: () => req<Template[]>('GET', '/api/templates'),
  saveTemplate: (body: TemplateInput) => req<Template>('POST', '/api/templates', body),
  deleteTemplate: (id: string) => req<{ok: true}>('DELETE', `/api/templates/${id}`),

  styles: () => req<CustomStyle[]>('GET', '/api/styles'),
  generateStyle: (prompt: string, base?: Pack) => req<{pack: Pack; notes: string[]}>('POST', '/api/styles/generate', {prompt, base}), // AI draft, not saved
  saveStyle: (body: StyleInput, id?: string) => req<CustomStyle>(id ? 'PUT' : 'POST', id ? `/api/styles/${id}` : '/api/styles', body),
  deleteStyle: (id: string) => req<{ok: true}>('DELETE', `/api/styles/${id}`),

  auth: () => req<AuthState>('GET', '/api/auth/state'),
  login: (pin: string) => req<{ok: true}>('POST', '/api/auth/login', {pin}),
  logout: () => req<{ok: true}>('POST', '/api/auth/logout', {}),
  setPin: (pin: string, current?: string) => req<{ok: true}>('POST', '/api/auth/pin', {pin, current}), // first set (localhost only) or change (needs current)

  review: (id: string, token: string) => req<Review>('GET', `/api/review/${id}?t=${encodeURIComponent(token)}`),
  comment: (id: string, body: {token: string; time: number; v: number; author: string; text: string}) => req<{ok: true}>('POST', `/api/jobs/${id}/comments`, body),
  decide: (id: string, body: {token: string; status: 'approved' | 'changes'}) => req<{ok: true}>('POST', `/api/review/${id}/decision`, body),
};

export const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
