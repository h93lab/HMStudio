import {chmodSync, readFileSync} from 'node:fs';
import {createHmac, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import type {IncomingMessage} from 'node:http';
import {ROOT} from './config';
import {writeAtomic} from './jobs';

// PIN login: one 6-digit PIN, scrypt-hashed in auth.json; sessions are signed cookies (no server-side session store).
export const authFile = () => process.env.MOTION_AUTH ?? path.join(ROOT, 'auth.json');
export const COOKIE = 'ms_session';
export const SESSION_MS = 30 * 86_400_000;
export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60_000;

type AuthData = {salt: string; hash: string; secret: string};

const scrypt = (pin: string, salt: string) => scryptSync(pin, Buffer.from(salt, 'hex'), 32, {N: 16384, r: 8, p: 1}).toString('hex');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{6}$/.test(pin);

export const readAuth = (): AuthData | null => {
  try {
    const d = JSON.parse(readFileSync(authFile(), 'utf8'));
    return d && typeof d.salt === 'string' && typeof d.hash === 'string' && typeof d.secret === 'string' ? d : null;
  } catch {
    return null;
  }
};
export const pinSet = () => !!readAuth();

// Sets (or changes) the PIN. A fresh secret each time, so every existing session stops working.
export const setPin = (pin: string) => {
  if (!validPin(pin)) throw new Error('the PIN must be exactly 6 digits');
  const salt = randomBytes(16).toString('hex');
  const data: AuthData = {salt, hash: scrypt(pin, salt), secret: randomBytes(32).toString('hex')};
  writeAtomic(authFile(), JSON.stringify(data), 0o600);
  chmodSync(authFile(), 0o600); // also fixes a file left from older versions
};

export const checkPin = (pin: unknown): boolean => {
  const a = readAuth();
  return !!a && validPin(pin) && same(scrypt(pin, a.salt), a.hash);
};

// ── Session cookie: <expiryMs>.<hmac> ──
const sign = (secret: string, exp: string) => createHmac('sha256', secret).update(exp).digest('hex');
export const makeSession = (secret: string, now = Date.now()) => {
  const exp = String(now + SESSION_MS);
  return `${exp}.${sign(secret, exp)}`;
};
export const verifySession = (secret: string, value: string | undefined, now = Date.now()) => {
  const m = value?.match(/^(\d{1,15})\.([0-9a-f]{64})$/);
  return !!m && same(m[2], sign(secret, m[1])) && Number(m[1]) > now;
};

export const cookieFrom = (req: IncomingMessage, name = COOKIE) => {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
};
export const hasSession = (req: IncomingMessage) => {
  const a = readAuth();
  return !!a && verifySession(a.secret, cookieFrom(req));
};
export const sessionCookie = () => {
  const a = readAuth();
  if (!a) throw new Error('no PIN set');
  return `${COOKIE}=${makeSession(a.secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`;
};
export const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

// ── Brute-force lockout, per remote IP, in memory ──
const fails = new Map<string, {n: number; until: number}>();
export const resetFails = () => fails.clear();
// Seconds left on the lock, or 0.
export const lockedFor = (ip: string, now = Date.now()) => {
  const f = fails.get(ip);
  if (!f) return 0;
  if (f.until && f.until <= now) return fails.delete(ip), 0;
  return f.until ? Math.ceil((f.until - now) / 1000) : 0;
};
export const recordFail = (ip: string, now = Date.now()) => {
  const f = fails.get(ip) ?? {n: 0, until: 0};
  f.n++;
  if (f.n >= MAX_FAILS) f.until = now + LOCK_MS;
  fails.set(ip, f);
};
export const clearFails = (ip: string) => void fails.delete(ip);

export const isLocal = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
export const remoteIp = (req: IncomingMessage) => req.socket.remoteAddress ?? 'unknown';
