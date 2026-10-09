import {createHash} from 'node:crypto';
import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {config} from './config';

export const hash = (...parts: string[]) => createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 16);

// Content-addressed cache: same text + model + voice never hits the API twice (revisions only pay for what changed).
export const cachePath = (kind: string, key: string, ext: string) => {
  const dir = path.join(config.dirs.cache, kind);
  mkdirSync(dir, {recursive: true});
  return path.join(dir, `${key}.${ext}`);
};
export const cached = (file: string) => existsSync(file);
