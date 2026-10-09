import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'motion-auth-'));
process.env.MOTION_AUTH = path.join(tmp, 'auth.json');
process.env.MOTION_PROFILES = path.join(tmp, 'profiles.json');
process.env.MOTION_TEMPLATES = path.join(tmp, 'templates.json');
process.env.MOTION_PUBLIC = path.join(tmp, 'public');
copyFileSync(path.join(import.meta.dirname, '..', 'src', 'profiles.json'), process.env.MOTION_PROFILES);
mkdirSync(process.env.MOTION_PUBLIC, {recursive: true});

const {config} = await import('../pipeline/config');
config.dirs.jobs = path.join(tmp, 'jobs');
const auth = await import('../pipeline/auth');
const server = await import('../pipeline/server');

const ID = '20261009-1300-auth';
let http: Server;
let base = '';
let token = '';
before(async () => {
  const dir = path.join(config.dirs.jobs, ID);
  mkdirSync(path.join(dir, 'v1', 'stills'), {recursive: true});
  writeFileSync(path.join(dir, 'v1', 'video-9x16.mp4'), 'fake');
  writeFileSync(path.join(dir, 'v1', 'stills', 's1.jpg'), 'fake');
  writeFileSync(path.join(dir, '.review-token'), 'abc123abc123abc123abc123');
  token = 'abc123abc123abc123abc123';
  writeFileSync(path.join(dir, 'job.json'), JSON.stringify({id: ID, idea: 'x', client: 'nova', lang: 'ar', dialect: 'msa', format: '9:16', seconds: 30, createdAt: new Date().toISOString(), versions: [{v: 1, createdAt: new Date().toISOString(), models: {}, notes: [], videos: {'9:16': 'v1/video-9x16.mp4'}}]}));
  http = createServer(server.handler);
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const port = (http.address() as AddressInfo).port;
  server.allowedHosts.add(`localhost:${port}`);
  base = `http://localhost:${port}`;
});
after(() => {
  http.close();
  rmSync(tmp, {recursive: true, force: true});
});

const call = async (method: string, url: string, body?: unknown, cookie = '') => {
  const r = await fetch(base + url, {method, headers: {origin: base, ...(cookie ? {cookie} : {}), ...(body !== undefined ? {'content-type': 'application/json'} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await r.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON
  }
  return {status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '', setCookie: r.headers.get('set-cookie') ?? ''};
};

test('pin hashing: only the right 6 digits verify, file is private', () => {
  assert.equal(auth.validPin('123456'), true);
  for (const bad of ['12345', '1234567', 'abcdef', '12345a', 123456, undefined]) assert.equal(auth.validPin(bad), false);
  assert.throws(() => auth.setPin('12'));
  auth.setPin('246810');
  assert.equal(auth.checkPin('246810'), true);
  assert.equal(auth.checkPin('246811'), false);
  assert.equal(auth.checkPin('nope'), false);
  assert.equal(statSync(process.env.MOTION_AUTH!).mode & 0o777, 0o600);
  rmSync(process.env.MOTION_AUTH!);
});

test('session cookie: sign, expiry, tamper, wrong secret', () => {
  const now = 1_000_000;
  const c = auth.makeSession('secret', now);
  assert.equal(auth.verifySession('secret', c, now + 1000), true);
  assert.equal(auth.verifySession('secret', c, now + auth.SESSION_MS + 1), false);
  assert.equal(auth.verifySession('other', c, now + 1000), false);
  const [exp, mac] = c.split('.');
  assert.equal(auth.verifySession('secret', `${Number(exp) + 99999999}.${mac}`, now + 1000), false);
  for (const bad of [undefined, '', 'x', `${exp}.zz`, `${exp}.${mac.slice(1)}`]) assert.equal(auth.verifySession('secret', bad, now), false);
});

test('lockout: 5 fails lock for 15 minutes, then free; success clears', () => {
  auth.resetFails();
  const t = 5_000_000;
  for (let i = 0; i < 4; i++) auth.recordFail('1.2.3.4', t);
  assert.equal(auth.lockedFor('1.2.3.4', t), 0);
  auth.recordFail('1.2.3.4', t);
  assert.equal(auth.lockedFor('1.2.3.4', t), 900);
  assert.equal(auth.lockedFor('5.6.7.8', t), 0);
  assert.equal(auth.lockedFor('1.2.3.4', t + auth.LOCK_MS), 0);
  auth.recordFail('9.9.9.9', t);
  auth.clearFails('9.9.9.9');
  for (let i = 0; i < 4; i++) auth.recordFail('9.9.9.9', t);
  assert.equal(auth.lockedFor('9.9.9.9', t), 0);
  auth.resetFails();
});

test('isLocal trusts the socket address only', () => {
  const req = (addr: string, headers = {}) => ({socket: {remoteAddress: addr}, headers}) as any;
  assert.equal(auth.isLocal(req('127.0.0.1')), true);
  assert.equal(auth.isLocal(req('::1')), true);
  assert.equal(auth.isLocal(req('100.64.0.2', {'x-forwarded-for': '127.0.0.1'})), false);
});

test('gate: first PIN from localhost, then everything needs the session', async () => {
  auth.resetFails();
  let s = await call('GET', '/api/auth/state');
  assert.deepEqual(s.data, {authenticated: false, pinSet: false, canSetPin: true});
  assert.equal((await call('POST', '/api/auth/pin', {pin: '12'})).status, 400);
  assert.equal((await call('POST', '/api/auth/login', {pin: '123456'})).status, 409);
  const set = await call('POST', '/api/auth/pin', {pin: '123456'});
  assert.equal(set.status, 200);
  assert.match(set.setCookie, /^ms_session=\d+\.[0-9a-f]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000$/);
  const cookie = set.cookie;

  s = await call('GET', '/api/auth/state');
  assert.deepEqual(s.data, {authenticated: false, pinSet: true, canSetPin: false});
  assert.deepEqual((await call('GET', '/api/auth/state', undefined, cookie)).data, {authenticated: true, pinSet: true, canSetPin: false});

  const noCookie = await call('GET', '/api/jobs');
  assert.equal(noCookie.status, 401);
  assert.equal(noCookie.data.error, 'login required');
  assert.equal((await call('GET', '/api/jobs', undefined, 'ms_session=1.' + 'a'.repeat(64))).status, 401);
  assert.equal((await call('GET', '/api/jobs', undefined, cookie)).status, 200);
  assert.equal((await call('GET', '/api/styles')).status, 401);
  // first PIN is now sealed; changing needs the session AND the current PIN
  assert.equal((await call('POST', '/api/auth/pin', {pin: '654321'})).status, 401);
  assert.equal((await call('POST', '/api/auth/pin', {pin: '654321', current: '000000'}, cookie)).status, 401);
  const changed = await call('POST', '/api/auth/pin', {pin: '654321', current: '123456'}, cookie);
  assert.equal(changed.status, 200);
  assert.equal((await call('GET', '/api/jobs', undefined, cookie)).status, 401); // old secret is dead everywhere
  assert.equal((await call('GET', '/api/jobs', undefined, changed.cookie)).status, 200);

  // login + logout
  assert.equal((await call('POST', '/api/auth/login', {pin: '123456'})).status, 401);
  const login = await call('POST', '/api/auth/login', {pin: '654321'});
  assert.equal(login.status, 200);
  assert.equal((await call('GET', '/api/jobs', undefined, login.cookie)).status, 200);
  assert.match((await call('POST', '/api/auth/logout')).setCookie, /Max-Age=0/);
});

test('gate: login lockout after 5 wrong PINs answers 429 with seconds', async () => {
  auth.resetFails();
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/api/auth/login', {pin: '000000'})).status, 401);
  const fifth = await call('POST', '/api/auth/login', {pin: '000000'});
  assert.equal(fifth.status, 429);
  assert.match(fifth.data.error, /\d+ seconds/);
  assert.equal((await call('POST', '/api/auth/login', {pin: '654321'})).status, 429); // even the right PIN waits
  auth.resetFails();
  assert.equal((await call('POST', '/api/auth/login', {pin: '654321'})).status, 200);
});

test('gate: review page and its media work with the review token, not without', async () => {
  const r = await call('GET', `/api/review/${ID}?t=${token}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.video, `/files/${ID}/v1/video-9x16.mp4?t=${token}`);
  assert.equal(r.data.cover, `/files/${ID}/v1/stills/s1.jpg?t=${token}`);
  assert.equal((await fetch(base + r.data.video)).status, 200);
  assert.equal((await fetch(base + r.data.cover)).status, 200);
  assert.equal((await fetch(base + `/files/${ID}/v1/video-9x16.mp4`)).status, 401);
  assert.equal((await fetch(base + `/files/${ID}/v1/video-9x16.mp4?t=wrong`)).status, 401);
  assert.equal((await fetch(base + `/files/other-job/v1/video-9x16.mp4?t=${token}`)).status, 401);
  assert.equal((await fetch(base + `/files/${ID}/.review-token?t=${token}`)).status, 404); // dotfiles stay refused
  assert.equal((await call('POST', `/api/review/${ID}/decision`, {token, status: 'approved'})).status, 200);
  assert.equal((await call('POST', `/api/jobs/${ID}/comments`, {token, text: 'hi', time: 1, v: 1, author: 'x'})).status, 200);
  assert.equal((await call('POST', `/api/jobs/${ID}/revise`, {feedback: 'x'})).status, 401);
  assert.equal((await call('GET', `/api/jobs/${ID}/comments`)).status, 401); // only the token-checked POST is public
  assert.equal((await fetch(base + `/files/${ID}/job.json?t=${token}`)).status, 401); // the token opens media only
});
