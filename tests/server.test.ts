import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {createServer, request as httpRequest, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Everything the API writes goes to a temp dir: profiles, templates, public/ assets and the jobs dir.
const tmp = mkdtempSync(path.join(os.tmpdir(), 'motion-server-'));
process.env.MOTION_PROFILES = path.join(tmp, 'profiles.json');
process.env.MOTION_TEMPLATES = path.join(tmp, 'templates.json');
process.env.MOTION_PUBLIC = path.join(tmp, 'public');
process.env.MOTION_AUTH = path.join(tmp, 'auth.json');
copyFileSync(path.join(import.meta.dirname, '..', 'src', 'profiles.json'), process.env.MOTION_PROFILES);
copyFileSync(path.join(import.meta.dirname, '..', 'templates.json'), process.env.MOTION_TEMPLATES);

const {config} = await import('../pipeline/config');
config.dirs.jobs = path.join(tmp, 'jobs');
mkdirSync(config.dirs.jobs, {recursive: true});
const server = await import('../pipeline/server');
const lib = await import('../pipeline/library');
const auth = await import('../pipeline/auth');
auth.setPin('123456');
let cookie = '';

let http: Server;
let base = '';
before(async () => {
  http = createServer(server.handler);
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const port = (http.address() as AddressInfo).port;
  server.allowedHosts.add(`localhost:${port}`);
  base = `http://localhost:${port}`;
  const login = await fetch(base + '/api/auth/login', {method: 'POST', headers: {origin: base, 'content-type': 'application/json'}, body: JSON.stringify({pin: '123456'})});
  cookie = login.headers.get('set-cookie')!.split(';')[0];
});
after(() => {
  http.close();
  rmSync(tmp, {recursive: true, force: true});
});

const call = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
  const raw = body instanceof Buffer || typeof body === 'string';
  const r = await fetch(base + url, {method, headers: {origin: base, cookie, ...(body !== undefined && !raw ? {'content-type': 'application/json'} : {}), ...headers}, body: body === undefined ? undefined : typeof body === 'string' ? body : body instanceof Buffer ? new Uint8Array(body) : JSON.stringify(body)});
  const text = await r.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON
  }
  return {status: r.status, data};
};

test('rejects untrusted hosts and writes without an Origin', async () => {
  const status = (host: string) =>
    new Promise<number>((resolve) => httpRequest(base + '/api/jobs', {headers: {host, cookie}}, (r) => (r.resume(), resolve(r.statusCode!))).end());
  assert.equal(await status('evil.test'), 403);
  assert.equal(await status(base.replace('http://', '')), 200);
  assert.equal((await fetch(base + '/api/clients/zz', {method: 'PUT', body: '{}'})).status, 403);
});

test('client profiles: list, create, validate, duplicate, archive', async () => {
  const list = await call('GET', '/api/clients');
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.map((c: any) => c.id).sort(), ['nova', 'orbit', 'sahara']);
  const theme = list.data[0].theme;

  for (const bad of ['Bad', '-x', 'a_b', 'x'.repeat(33)]) assert.equal((await call('PUT', `/api/clients/${encodeURIComponent(bad)}`, {theme, defaults: {}})).status, 400, bad);
  assert.equal((await call('PUT', '/api/clients/acme', {theme: {...theme, radius: 999}, defaults: {}})).status, 400); // theme out of range
  assert.equal((await call('PUT', '/api/clients/acme', {theme, defaults: {style: 'nope'}})).status, 400);
  assert.equal((await call('PUT', '/api/clients/acme', {theme, defaults: {dialect: 'klingon'}})).status, 400);

  const made = await call('PUT', '/api/clients/acme', {theme: {...theme, client: 'Acme'}, defaults: {style: 'cyber-neon', dialect: 'gulf', format: '1:1', junk: 'dropped'}});
  assert.equal(made.status, 200);
  assert.equal(made.data.theme.client, 'Acme');
  assert.deepEqual(made.data.defaults, {style: 'cyber-neon', dialect: 'gulf', format: '1:1'});
  const stored = JSON.parse(readFileSync(process.env.MOTION_PROFILES!, 'utf8'));
  assert.equal(stored.find((p: any) => p.id === 'acme').props.scenes.length, stored[0].props.scenes.length); // props copied from the first profile

  // "New client" (create=1) must never overwrite an existing profile.
  assert.equal((await call('PUT', '/api/clients/nova?create=1', {theme: {...theme, client: 'Impostor'}, defaults: {}})).status, 400);
  assert.notEqual(JSON.parse(readFileSync(process.env.MOTION_PROFILES!, 'utf8')).find((p: any) => p.id === 'nova').props.theme.client, 'Impostor');
  assert.equal((await call('POST', '/api/clients/acme/duplicate', {id: 'acme'})).status, 400);
  assert.equal((await call('POST', '/api/clients/acme/duplicate', {id: 'acme-2'})).data.id, 'acme-2');
  assert.equal((await call('POST', '/api/clients/acme/archive', {archived: true})).data.archived, true);
  assert.equal((await call('POST', '/api/clients/acme/archive', {archived: 'yes'})).status, 400);
  assert.equal((await call('POST', '/api/clients/ghost/archive', {archived: true})).status, 400);

  // Archived clients are hidden from make but stay in the list.
  const body = {idea: 'a launch video', client: 'acme', format: '9:16', dialect: 'msa', seconds: 30, tier: 'draft', gender: 'male'};
  assert.equal((await call('POST', '/api/make', body)).status, 400);
});

test('make validation rejects bad input before anything is queued', () => {
  const ok = {idea: 'a launch video', client: 'nova', format: '9:16', dialect: 'msa', seconds: 30, tier: 'standard', gender: 'female'};
  const made = server.parseMake({...ok, style: 'editorial', music: 'none', variants: 2, draft: true});
  assert.deepEqual(made.text, ['a launch video']);
  assert.ok(made.options.includes('--draft') && made.options.includes('--variants'));
  for (const patch of [{idea: ' '}, {client: 'nope'}, {format: '2:1'}, {dialect: 'x'}, {seconds: 5}, {seconds: 91}, {seconds: 30.5}, {tier: 'gold'}, {gender: 'x'}, {style: 'x'}, {music: 'x'}, {variants: 9}, {url: 'ftp://x'}, {voice: 'a b;rm'}, {template: 'nope'}, {draft: 'yes'}, {logo: '/clients/other/assets/logo.png'}, {screens: ['/clients/nova/assets/../../../etc/passwd']}, {screens: ['/clients/nova/assets/missing.png']}]) {
    assert.throws(() => server.parseMake({...ok, ...patch}), /./, JSON.stringify(patch));
  }
});

test('asset names are sanitized and classified', () => {
  assert.equal(lib.sanitizeName('My Logo (v2).PNG'), 'My_Logo_v2_.png');
  assert.equal(lib.sanitizeName('../../etc/passwd.png'), 'passwd.png');
  assert.equal(lib.sanitizeName('..\\..\\win.jpg'), 'win.jpg');
  assert.equal(lib.sanitizeName('.hidden.png'), 'hidden.png');
  assert.throws(() => lib.sanitizeName('run.sh'));
  assert.throws(() => lib.sanitizeName('noext'));
  assert.throws(() => lib.sanitizeName('...png'));
  assert.equal(lib.kindOf('acme-logo.svg'), 'logo');
  assert.equal(lib.kindOf('home.PNG'), 'screenshot');
  assert.equal(lib.kindOf('a.m4a'), 'music');
  assert.equal(lib.kindOf('b.mov'), 'clip');
  assert.equal(lib.kindOf('c.exe'), null);
});

test('asset upload: streamed, deduped, validated; traversal impossible', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 1)]);
  const up = (name: string, body: Buffer | string, client = 'nova') => call('POST', `/api/assets?client=${client}`, body, {'x-filename': encodeURIComponent(name), 'content-type': 'application/octet-stream'});
  const a = await up('Nova Logo.png', png);
  assert.equal(a.status, 200);
  assert.equal(a.data.kind, 'logo');
  assert.equal(a.data.url, '/clients/nova/assets/Nova_Logo.png');
  assert.equal((await up('Nova Logo.png', png)).data.name, 'Nova_Logo-2.png');
  assert.equal((await up('Nova Logo.png', png)).data.name, 'Nova_Logo-3.png');

  const evil = await up('../../../../evil.png', png);
  assert.equal(evil.data.name, 'evil.png'); // directory parts are dropped, never followed
  assert.ok(existsSync(path.join(process.env.MOTION_PUBLIC!, 'clients', 'nova', 'assets', 'evil.png')));
  assert.ok(!existsSync(path.join(tmp, 'evil.png')));

  assert.equal((await up('x.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).status, 400);
  assert.equal((await up('fake.png', 'not an image at all, just text')).status, 400);
  assert.equal((await up('run.sh', 'echo hi')).status, 400);
  assert.equal((await up('x.png', png, 'ghost')).status, 400);
  assert.equal((await up('x.png', png, '../nova')).status, 400);
  const dir = path.join(process.env.MOTION_PUBLIC!, 'clients', 'nova', 'assets');
  assert.ok(readdirSync(dir).every((f) => !f.endsWith('.tmp')), 'no temp files left behind');

  const listed = await call('GET', '/api/assets?client=nova');
  assert.equal(listed.data.length, 4);
  assert.equal((await call('GET', '/api/assets')).data.length, 4);
  assert.equal((await call('GET', '/api/assets?client=..%2F')).status, 400);

  assert.equal((await call('DELETE', '/api/assets?client=nova&name=..%2F..%2Fprofiles.json')).status, 400);
  assert.equal((await call('DELETE', '/api/assets?client=nova&name=Nova_Logo.png')).status, 200);
  assert.equal((await call('DELETE', '/api/assets?client=nova&name=Nova_Logo.png')).status, 400);

  const got = await fetch(base + '/clients/nova/assets/evil.png', {headers: {cookie}});
  assert.equal(got.status, 200);
  assert.match(got.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal((await fetch(base + '/files/..%2F..%2Fetc%2Fpasswd', {headers: {cookie}})).status, 404);
});

test('run status is derived from the log', () => {
  const meta = (status: any, kind: any = 'make') => ({status, kind});
  const log = 'job 20261009-1200-demo\n▸ creative brief\n▸ v1: assets\n▸ v1: rendering video\n\r  render 40%   \r  render 60%   ';
  let d = server.deriveRun(log, meta('running'), true);
  assert.equal(d.status, 'running');
  assert.equal(d.progress, 0.8); // 0.5 + 0.6/2
  assert.equal(d.step, 'render 60%');
  assert.equal(server.deriveRun('', meta('waiting'), true).status, 'waiting');
  assert.equal(server.deriveRun('', meta('waiting'), true).progress, 0);
  d = server.deriveRun(log + '\n  8.0s video → x.mp4\n✓ job v1\n\nexit 0\n', meta('running'), true);
  assert.deepEqual([d.status, d.progress], ['done', 1]);
  d = server.deriveRun('▸ x\n✗ model timed out\n\nexit 1\n', meta('running'), true);
  assert.deepEqual([d.status, d.step], ['failed', 'model timed out']);
  d = server.deriveRun(log, meta('running'), false); // server restarted: nobody owns it
  assert.deepEqual([d.status, d.step], ['failed', 'interrupted']);
  assert.equal(server.deriveRun(log + '\nexit null\n', meta('cancelled'), false).status, 'cancelled');
  assert.equal(server.deriveRun('render 50%', meta('running', 'render'), true).progress, 0.5);
  assert.equal(server.deriveRun('old log\nexit 0\n', null, false).status, 'done'); // legacy log without meta
});

const writeJob = (id: string) => {
  const profiles = JSON.parse(readFileSync(process.env.MOTION_PROFILES!, 'utf8'));
  const props = profiles[0].props;
  const dir = path.join(config.dirs.jobs, id);
  mkdirSync(path.join(dir, 'v1'), {recursive: true});
  writeFileSync(path.join(dir, 'job.json'), JSON.stringify({id, idea: 'demo idea', client: 'nova', lang: 'ar', dialect: 'msa', format: '9:16', seconds: 30, createdAt: new Date().toISOString(), versions: [{v: 1, createdAt: new Date().toISOString(), models: {}, notes: [], videos: {}}]}));
  writeFileSync(path.join(dir, 'v1', 'props.json'), JSON.stringify(props));
  return props;
};

test('templates: built-ins, create from a job version, validation, delete', async () => {
  const props = writeJob('20261009-1200-demo');
  const list = await call('GET', '/api/templates');
  assert.equal(list.data.length, 5);
  assert.deepEqual(list.data[0].scenes.map((s: any) => s.type), ['intro', 'stat', 'features', 'device', 'outro']);

  const t = await call('POST', '/api/templates', {name: 'From demo', category: 'launch', description: 'x', fromJob: '20261009-1200-demo', v: 1});
  assert.equal(t.status, 200);
  assert.deepEqual(t.data.scenes.map((s: any) => s.type), props.scenes.map((s: any) => s.type));
  assert.equal(t.data.scenes[0].seconds, props.scenes[0].duration / 30);
  assert.equal(t.data.uses, 0);
  assert.equal((await call('POST', '/api/templates', {name: 'x', fromJob: '20261009-1200-demo', v: 7})).status, 400);
  assert.equal((await call('POST', '/api/templates', {name: 'x', fromJob: '../x', v: 1})).status, 400);
  assert.equal((await call('POST', '/api/templates', {name: 'x', scenes: [{type: 'bogus', seconds: 3}]})).status, 400);
  assert.equal((await call('POST', '/api/templates', {name: 'x', scenes: [{type: 'intro', seconds: 99}]})).status, 400);
  assert.equal((await call('POST', '/api/templates', {name: 'Short', scenes: [{type: 'intro', seconds: 3}, {type: 'outro', seconds: 3}]})).status, 400); // a storyboard needs 4+
  assert.equal((await call('POST', '/api/templates', {name: 'Mine', scenes: [{type: 'intro', seconds: 3}, {type: 'stat', seconds: 3}, {type: 'statement', seconds: 3}, {type: 'outro', seconds: 3}]})).status, 200);
  assert.equal((await call('DELETE', `/api/templates/${t.data.id}`)).status, 200);
  assert.equal((await call('DELETE', `/api/templates/${t.data.id}`)).status, 400);
});

test('job summary exposes versions, urls and review link', async () => {
  const s = await call('GET', '/api/jobs/20261009-1200-demo/summary');
  assert.equal(s.status, 200);
  assert.equal(s.data.clientName, 'Nova Tech');
  assert.equal(s.data.versions[0].scenes, 5);
  assert.ok(s.data.versions[0].seconds > 5);
  assert.match(s.data.reviewUrl, /^\/review\/20261009-1200-demo\?t=[0-9a-f]{24}$/);
  assert.equal((await call('GET', '/api/jobs/nope/summary')).status, 404);
  assert.equal((await call('GET', '/api/jobs')).data.length, 1);
});

test('review: bad tokens are refused, good token returns comments with scene numbers, decisions persist', async () => {
  const id = '20261009-1200-demo';
  const token = readFileSync(path.join(config.dirs.jobs, id, '.review-token'), 'utf8').trim();
  assert.equal((await call('GET', `/api/review/${id}?t=wrong`)).status, 403);
  assert.equal((await call('GET', `/api/review/${id}`)).status, 403);
  assert.equal((await call('GET', `/api/review/nojob?t=${token}`)).status, 403);
  assert.equal((await call('POST', `/api/review/${id}/decision`, {token: 'wrong', status: 'approved'})).status, 403);
  assert.equal((await call('POST', `/api/jobs/${id}/comments`, {token: 'wrong', text: 'hi', time: 1, v: 1, author: 'x'})).status, 400);

  assert.equal((await call('POST', `/api/jobs/${id}/comments`, {token, text: 'later scene', time: 6, v: 1, author: 'Sam'})).status, 200);
  const r = await call('GET', `/api/review/${id}?t=${token}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.comments.length, 1);
  assert.equal(r.data.comments[0].scene, 3); // 0-3s intro (90f), then features until 6.0s…
  assert.equal(r.data.video, undefined); // no rendered video yet
  assert.equal((await call('POST', `/api/review/${id}/decision`, {token, status: 'maybe'})).status, 400);
  assert.equal((await call('POST', `/api/review/${id}/decision`, {token, status: 'approved'})).status, 200);
  assert.equal(JSON.parse(readFileSync(path.join(config.dirs.jobs, id, 'job.json'), 'utf8')).approval.status, 'approved');
  assert.equal((await call('POST', `/api/jobs/${id}/winner`, {v: 1})).status, 200);
  assert.equal((await call('POST', `/api/jobs/${id}/winner`, {v: 9})).status, 400);
  assert.equal((await call('GET', '/api/jobs')).data[0].winner, 1);
});

test('sceneAt maps seconds to the scene on screen', () => {
  const scenes = [{duration: 90}, {duration: 120}, {duration: 90}];
  assert.equal(server.sceneAt(scenes, 0), 1);
  assert.equal(server.sceneAt(scenes, 2.3), 1); // transition starts at frame 72
  assert.equal(server.sceneAt(scenes, 2.5), 2);
  assert.equal(server.sceneAt(scenes, 99), 3);
});

test('settings, options and SPA fallbacks', async () => {
  const o = await call('GET', '/api/options');
  assert.deepEqual(o.data.formats, ['9:16', '1:1', '4:5', '16:9']);
  assert.ok(o.data.sceneTypes.includes('device') && o.data.styles[0].id && o.data.voices.length > 3);
  const s = await call('GET', '/api/settings');
  assert.equal(s.data.roles.length, 7);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/api/usage')).status, 200);
  const spa = await fetch(base + '/clients/nova');
  assert.ok(spa.status === 200 || spa.status === 503); // 503 when editor/dist is not built
  if (spa.status === 503) assert.match(await spa.text(), /npm run editor/);
});
