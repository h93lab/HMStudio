import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'styles-'));
process.env.MOTION_STYLES = path.join(tmp, 'styles.json');

const {packs, packIds, packSchema, usableTransitions} = await import('../src/design/packs');
const {saveStyle, listStyles, deleteStyle, generatePack, styleOptions, isStyleId, resolvePack} = await import('../pipeline/styles');
const {importDesignSystem} = await import('../pipeline/designSystem');
const {videoSchema} = await import('../src/schema');
import type {ChatFn} from '../pipeline/llm';
import type {Theme} from '../src/schema';

const fake = (replies: string[]): ChatFn => {
  let i = 0;
  return (async () => ({text: replies[Math.min(i++, replies.length - 1)], model: 'fake'})) as ChatFn;
};

test('packSchema accepts built-ins and rejects out-of-range values', () => {
  for (const id of packIds) assert.ok(packSchema.safeParse(packs[id]).success, id);
  const bad = (patch: object) => assert.ok(!packSchema.safeParse({...packs['premium-tech'], ...patch}).success, JSON.stringify(patch));
  bad({overshoot: 0.9});
  bad({enterFrames: 3});
  bad({ease: [2, 0, 0, 1]});
  bad({transitions: []});
  bad({backgrounds: ['nope']});
  bad({finish: {grain: 2, vignette: 0, leaks: 0, chroma: 0}});
  bad({label: ''});
});

test('saveStyle: create, slug collisions, update, delete', () => {
  const a = saveStyle({name: 'Premium Tech', prompt: 'x', pack: packs['bold-pop']});
  assert.equal(a.id, 'premium-tech-2'); // built-in id is taken
  assert.equal(a.pack.label, 'Premium Tech');
  const b = saveStyle({name: 'Premium Tech', prompt: 'y', pack: packs.editorial});
  assert.equal(b.id, 'premium-tech-3');
  const u = saveStyle({name: 'Renamed', prompt: 'z', pack: packs.editorial}, a.id);
  assert.equal(u.id, a.id);
  assert.equal(u.name, 'Renamed');
  assert.ok(u.updatedAt);
  assert.throws(() => saveStyle({name: 'n', prompt: '', pack: packs.editorial}, 'ghost'), /unknown style/);
  assert.throws(() => saveStyle({name: '', prompt: '', pack: packs.editorial}), /invalid style/);
  assert.throws(() => saveStyle({name: 'n', prompt: '', pack: {...packs.editorial, overshoot: 5}}), /invalid style/);
  assert.deepEqual(styleOptions().filter((o) => o.custom).map((o) => o.id), [a.id, b.id]);
  assert.ok(isStyleId('cyber-neon') && isStyleId(a.id) && !isStyleId('ghost'));
  assert.equal(resolvePack(a.id)?.label, 'Renamed');
  assert.equal(resolvePack('cyber-neon'), packs['cyber-neon']);
  deleteStyle(a.id);
  deleteStyle(b.id);
  assert.throws(() => deleteStyle(a.id), /unknown style/);
  assert.equal(listStyles().length, 0);
});

test('custom style id + embedded pack validate in video props', () => {
  const s = saveStyle({name: 'Mine', prompt: '', pack: packs['cyber-neon']});
  const pack = resolvePack(s.id);
  assert.ok(pack);
  assert.ok(videoSchema.shape.pack.safeParse(pack).success);
  assert.ok(videoSchema.shape.style.safeParse(s.id).success);
  deleteStyle(s.id);
});

test('generatePack retries with validation errors and accepts a valid pack', async () => {
  const good = JSON.stringify({pack: packs.editorial, notes: ['calm wipe']});
  const out = await generatePack('calm editorial', undefined, {chatFn: fake([JSON.stringify({pack: {...packs.editorial, overshoot: 9}, notes: []}), 'not json', good])});
  assert.equal(out.pack.reveal, 'wipe');
  assert.deepEqual(out.notes, ['calm wipe']);
  await assert.rejects(generatePack('x', undefined, {chatFn: fake(['nope'])}), /could not generate/);
});

const theme: Theme = {
  client: 'Acme', direction: 'rtl', numerals: 'arab', font: 'Cairo', displayFont: 'none', logo: '',
  colors: {background: '#000000', surface: '#111111', primary: '#2255ff', accent: '#ffaa00', text: '#ffffff', muted: '#999999'},
  radius: 16, glow: 0.4, motion: {speed: 1, damping: 20},
};

test('importDesignSystem: zip with tokens, merge, contrast note, errors', async () => {
  const dir = path.join(tmp, 'ds');
  mkdirSync(path.join(dir, 'pkg', '__MACOSX'), {recursive: true});
  writeFileSync(path.join(dir, 'pkg', 'tokens.css'), ':root{--bg:#fafafa;--fg:#f0f0f0;--brand:#ff0066;font-family:Inter}');
  writeFileSync(path.join(dir, 'pkg', 'logo.png'), 'x');
  writeFileSync(path.join(dir, 'pkg', '__MACOSX', 'junk.css'), 'a{color:red}');
  const zip = path.join(tmp, 'ds.zip');
  await promisify(execFile)('zip', ['-qr', zip, 'pkg'], {cwd: dir});
  const reply = JSON.stringify({theme: {colors: {background: '#fafafa', text: '#f0f0f0', primary: '#ff0066'}, radius: 8, font: 'Tajawal'}, notes: ['Inter -> Tajawal']});
  const r = await importDesignSystem(zip, 'ds.zip', theme, fake([reply]));
  assert.deepEqual(r.source, ['pkg/tokens.css']);
  assert.equal(r.theme.colors.primary, '#ff0066');
  assert.equal(r.theme.colors.accent, '#ffaa00'); // untouched keys survive the merge
  assert.equal(r.theme.client, 'Acme');
  const sneaky = JSON.stringify({theme: {logo: 'https://evil.example/x.png'}, notes: []});
  assert.equal((await importDesignSystem(zip, 'ds.zip', theme, fake([sneaky]))).theme.logo, ''); // the logo never comes from the file
  assert.ok(r.notes.some((n) => n.startsWith('low contrast')));
  // invalid font -> retried with errors
  const bad = JSON.stringify({theme: {font: 'Comic Sans'}, notes: []});
  assert.equal((await importDesignSystem(zip, 'ds.zip', theme, fake([bad, reply]))).theme.font, 'Tajawal');
  // single file without tokens
  const md = path.join(tmp, 'x.md');
  writeFileSync(md, 'hello world');
  await assert.rejects(importDesignSystem(md, 'x.md', theme, fake([reply])), /no design tokens/);
  // zip without readable files
  const empty = path.join(tmp, 'e.zip');
  await promisify(execFile)('zip', ['-qr', empty, 'pkg/logo.png'], {cwd: dir});
  await assert.rejects(importDesignSystem(empty, 'e.zip', theme, fake([reply])), /zip has no readable files/);
});

test('a corrupt styles.json never breaks the studio', () => {
  writeFileSync(process.env.MOTION_STYLES!, '{not json');
  assert.deepEqual(listStyles(), []);
  writeFileSync(process.env.MOTION_STYLES!, JSON.stringify([{id: 'ok-style', name: 'Ok', prompt: '', pack: packs.editorial, createdAt: ''}, {id: 'Bad Id', name: 'x', pack: packs.editorial}, {id: 'no-pack', name: 'x'}]));
  assert.deepEqual(listStyles().map((s) => s.id), ['ok-style']);
  writeFileSync(process.env.MOTION_STYLES!, '[]');
});

test('no built-in pack or style form offers linearBlur (it hangs parallel renders)', () => {
  for (const [id, p] of Object.entries(packs)) assert.ok(!p.transitions.includes('linearBlur'), id);
  assert.ok(!usableTransitions.includes('linearBlur' as never));
});
