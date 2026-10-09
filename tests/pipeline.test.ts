import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sceneSchema, totalDuration, sceneStarts, TRANSITION, videoSchema, type Scene} from '../src/schema';
import {toPages, pageAt} from '../src/captions';
import {extractJson} from '../pipeline/llm';
import {validateStoryboard, requestStoryboard, dropInventedUrls} from '../pipeline/storyboard';
import {alignWords, sceneDuration, minFrames} from '../pipeline/timing';
import {checkProps, qaFeedback, contrast, dropDirectionClaims} from '../pipeline/qa';
import {Ledger, entryCost} from '../pipeline/ledger';
import {newJobId} from '../pipeline/jobs';
import {localizeDigits} from '../src/design/theme';
import type {ChatFn} from '../pipeline/llm';

const good = () => ({
  scenes: [
    {type: 'statement', duration: 90, text: 'السرعة هي المنتج', emphasis: 'المنتج', voiceover: 'هل فريقك بطيء؟'},
    {type: 'features', duration: 100, title: 'ليه نحن', items: ['أسرع', 'أأمن']},
    {type: 'steps', duration: 100, title: 'كيف تبدأ', steps: ['سجّل', 'ابدأ']},
    {type: 'outro', duration: 90, title: 'جاهز؟', cta: 'ابدأ الآن', url: 'x.com'},
  ],
});

test('extractJson tolerates fences, think blocks and prose', () => {
  assert.deepEqual(extractJson('<think>hmm {no}</think>Here:\n```json\n{"a":[1,2]}\n```\nbye'), {a: [1, 2]});
  assert.deepEqual(extractJson('[{"x":1}]'), [{x: 1}]);
  assert.throws(() => extractJson('no json here'));
});

test('validateStoryboard accepts a good storyboard and strips pipeline fields', () => {
  const raw = good();
  (raw.scenes[0] as Record<string, unknown>).audio = 'evil.mp3';
  const r = validateStoryboard(raw);
  assert.ok(r.ok);
  if (r.ok) assert.equal((r.scenes[0] as Record<string, unknown>).audio, undefined);
});

test('validateStoryboard reports schema and story-rule errors', () => {
  const raw = good();
  (raw.scenes[1] as {title: string}).title = 'x'.repeat(80);
  raw.scenes.pop();
  const r = validateStoryboard(raw);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => e.includes('scenes.1.title')), r.errors.join('|'));
  }
  const noOutro = good();
  noOutro.scenes[3] = {type: 'logo', duration: 70, tagline: 't'} as never;
  const r2 = validateStoryboard(noOutro);
  assert.ok(!r2.ok && r2.errors.some((e) => e.includes('outro')));
  const repeat = good();
  repeat.scenes[2] = {...repeat.scenes[1]};
  const r3 = validateStoryboard(repeat);
  assert.ok(!r3.ok && r3.errors.some((e) => e.includes('twice in a row')));
});

test('validateStoryboard auto-fixes a bad emphasis instead of failing', () => {
  const raw = good();
  (raw.scenes[0] as {emphasis: string}).emphasis = 'غير موجودة';
  const r = validateStoryboard(raw);
  assert.ok(r.ok);
  if (r.ok) assert.equal((r.scenes[0] as Extract<Scene, {type: 'statement'}>).emphasis, '');
});

test('requestStoryboard feeds validation errors back and retries', async () => {
  const replies = ['not json at all', JSON.stringify({scenes: [{type: 'outro'}]}), '```json\n' + JSON.stringify(good()) + '\n```'];
  const seen: string[] = [];
  const fake: ChatFn = async ({messages}) => {
    seen.push(JSON.stringify(messages.at(-1)?.content));
    return {text: replies.shift()!, model: 'fake'};
  };
  const r = await requestStoryboard({messages: [{role: 'user', content: 'go'}], models: ['fake'], role: 'writer', chatFn: fake});
  assert.equal(r.attempts, 3);
  assert.equal(r.scenes.length, 4);
  assert.ok(seen[1].includes('not valid JSON'));
  assert.ok(seen[2].includes('failed validation'));
});

test('requestStoryboard gives up after the attempt budget', async () => {
  const fake: ChatFn = async () => ({text: '{"scenes":[]}', model: 'fake'});
  await assert.rejects(requestStoryboard({messages: [], models: ['fake'], role: 'writer', chatFn: fake, attempts: 2}), /still invalid/);
});

test('timeline math: durations overlap by the transition', () => {
  const scenes = [{duration: 90}, {duration: 100}, {duration: 80}];
  assert.equal(totalDuration(scenes), 270 - 2 * TRANSITION);
  assert.deepEqual(sceneStarts(scenes), [0, 90 - TRANSITION, 190 - 2 * TRANSITION]);
});

test('sceneDuration keeps narration clear of the next transition', () => {
  const s = good().scenes[1] as Scene;
  assert.equal(sceneDuration(s), Math.max(minFrames(s), sceneDuration(s)));
  const withVoice = sceneDuration(s, 6);
  assert.ok(withVoice >= Math.ceil(6 * 30) + TRANSITION, `${withVoice}`);
  assert.ok(sceneDuration(s, 0.5) >= minFrames(s));
});

test('alignWords keeps script spelling with STT timing, or spreads proportionally', () => {
  const stt = [
    {word: 'منصه', start: 0, end: 0.5},
    {word: 'ذكيه', start: 0.5, end: 1},
  ];
  assert.deepEqual(alignWords('منصة ذكية', stt, 1), [
    {text: 'منصة', startMs: 0, endMs: 500},
    {text: 'ذكية', startMs: 500, endMs: 1000},
  ]);
  const spread = alignWords('واحد اثنان ثلاثة', stt, 1);
  assert.equal(spread.length, 3);
  assert.equal(spread[0].startMs, 0);
  assert.ok(Math.abs(spread[2].endMs - 1000) <= 1);
  assert.ok(spread.every((w, i) => i === 0 || w.startMs >= spread[i - 1].startMs));
  assert.equal(alignWords('كلمة', [], 2)[0].endMs, 2000);
});

test('caption pages: max words, pause breaks, no gaps between pages', () => {
  const w = (t: string, s: number, e: number) => ({text: t, startMs: s, endMs: e});
  const pages = toPages([w('a', 0, 100), w('b', 100, 200), w('c', 200, 300), w('d', 300, 400), w('e', 400, 500), w('f', 1500, 1600)], 4, 550);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].words.length, 4);
  assert.equal(pages[0].endMs, pages[1].startMs);
  assert.equal(pageAt(pages, 450)?.words[0].text, 'e');
  assert.equal(pageAt(pages, 5000), null);
});

test('schema rejects overlong copy and unknown scene types', () => {
  assert.equal(sceneSchema.safeParse({type: 'intro', duration: 90, kicker: 'k', title: 'x'.repeat(49), subtitle: 's'}).success, false);
  assert.equal(sceneSchema.safeParse({type: 'banana', duration: 90}).success, false);
});

test('client profiles (src/profiles.json) and the Showcase all satisfy the video schema', () => {
  const root = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  const profiles: {props: unknown}[] = JSON.parse(readFileSync(new URL('../src/profiles.json', import.meta.url), 'utf8'));
  const blocks = [...root.matchAll(/defaultProps=\{(\{[\s\S]*?\n {6}\})\}/g)].map((m) => m[1]);
  assert.ok(profiles.length >= 2 && blocks.length >= 1);
  for (const props of [...profiles.map((p) => p.props), ...blocks.map((b) => Function(`return (${b})`)())]) {
    const r = videoSchema.safeParse(props);
    assert.ok(r.success, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3)));
  }
});

test('checkProps flags missing CTA and missing images', () => {
  const props = {theme: {colors: {text: '#ffffff', background: '#000000', muted: '#222222'}}, scenes: [{type: 'image', duration: 90, title: 't', subtitle: '', image: '', imagePrompt: 'p'}]} as never;
  const notes = checkProps(props);
  assert.ok(notes.some((n) => n.includes('outro')));
  assert.ok(notes.some((n) => n.includes('image missing')));
  assert.ok(notes.some((n) => n.includes('secondary text')), 'dark grey on black is low contrast');
  assert.equal(contrast('#ffffff', '#000000'), 21);
  assert.equal(contrast('red', '#000'), null);
});

test('qaFeedback keeps only actionable issues', () => {
  const fb = qaFeedback({score: 6, issues: [
    {scene: 1, severity: 'high', problem: 'cut text', fix: 'shorten'},
    {scene: 2, severity: 'low', problem: 'nit', fix: 'meh'},
  ]});
  assert.ok(fb.includes('Scene 1') && !fb.includes('Scene 2'));
});

test('ledger cost: known prices sum, unknown stay null, cached is free', () => {
  const prices = {m: {inputPer1M: 1, outputPer1M: 2, perChar: 0.001}};
  assert.equal(entryCost({at: '', role: 'w', model: 'm', ok: true, ms: 1, promptTokens: 1e6, completionTokens: 1e6}, prices), 3);
  assert.equal(entryCost({at: '', role: 'w', model: 'x', ok: true, ms: 1, promptTokens: 5}, prices), null);
  assert.equal(entryCost({at: '', role: 't', model: 'm', ok: true, ms: 0, chars: 100, cached: true}, prices), 0);
  const l = new Ledger();
  l.add({role: 'w', model: 'm', ok: true, ms: 1, promptTokens: 10});
  assert.equal(l.summary().byModel.m.calls, 1);
});

test('dropInventedUrls keeps client URLs and clears made-up ones', () => {
  const outro = (url: string) => ({type: 'outro', duration: 90, title: 't', cta: 'c', url}) as Scene;
  const idea = 'Free scan at https://CloudGuard.io today';
  assert.equal((dropInventedUrls([outro('cloudguard.io')], idea)[0] as {url: string}).url, 'cloudguard.io');
  assert.equal((dropInventedUrls([outro('https://www.cloudguard.io/')], idea)[0] as {url: string}).url, 'https://www.cloudguard.io/');
  assert.equal((dropInventedUrls([outro('getfit.app')], idea)[0] as {url: string}).url, '');
});

test('job ids are sortable and slugged', () => {
  const id = newJobId('Cyber Scan 5 minutes!', new Date('2026-10-09T05:07:00Z'));
  assert.match(id, /^20261009-0507-cyber-scan-5-minutes/);
  assert.match(newJobId('فكرة عربية', new Date('2026-10-09T05:07:00Z')), /-video$/);
});

test('localizeDigits: Arabic-Indic only for Arabic text in arab-numeral profiles', () => {
  assert.equal(localizeDigits('تقسيط 24 شهر و70%', 'arab'), 'تقسيط ٢٤ شهر و٧٠٪');
  assert.equal(localizeDigits('shamsna.eg 2025', 'arab'), 'shamsna.eg 2025');
  assert.equal(localizeDigits('تقسيط 24 شهر', 'latn'), 'تقسيط 24 شهر');
});

test('dropDirectionClaims removes RTL false positives only for RTL brands', () => {
  const report = {score: 6, issues: [
    {scene: 4, severity: 'high' as const, problem: 'Icons are placed on the left side of the text', fix: 'move them'},
    {scene: 2, severity: 'medium' as const, problem: 'Subtitle has low contrast', fix: 'brighten'},
  ]};
  const r = dropDirectionClaims(report, true);
  assert.equal(r.issues.length, 1);
  assert.equal(r.score, 7);
  assert.equal(r.droppedDirectionClaims, 1);
  assert.deepEqual(dropDirectionClaims(report, false), report);
});

test('validateStoryboard enforces a template scene order', () => {
  const raw = good();
  const types = raw.scenes.map((s) => s.type);
  assert.ok(validateStoryboard(good(), types).ok);
  const r = validateStoryboard(raw, [...types].reverse());
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes('template requires')), r.errors.join('|'));
});
