import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bradleyTerry, buildPairs, findCliches, hookTournament, critiqueScript} from '../pipeline/hooks';
import {isEdgeVoice, defaultVoice} from '../pipeline/voice';
import {staggerDelay, packs, packIds} from '../src/design/packs';
import {beatPulse} from '../src/components/Beat';
import type {ChatFn} from '../pipeline/llm';
import {snapToBeats} from '../pipeline/timing';
import {sceneStarts} from '../src/schema';
import {detectBeats, synthesize} from '../pipeline/music';
import {assertPublicUrl, isImageBytes, brandColors, brandTheme, factsSchema, findInventedNumbers, logoCandidates, visibleText} from '../pipeline/brand';
import type {Scene} from '../src/schema';
import {applyLocks} from '../pipeline/produce';
import {migrateProps} from '../pipeline/jobs';

test('buildPairs: every pair appears in both orders, no self-pairs, no duplicates', () => {
  const pairs = buildPairs(10, 4);
  const keys = new Set(pairs.map(([a, b]) => `${a}-${b}`));
  assert.equal(keys.size, pairs.length);
  for (const [a, b] of pairs) {
    assert.notEqual(a, b);
    assert.ok(keys.has(`${b}-${a}`), `missing reverse of ${a}-${b}`);
  }
  assert.deepEqual(buildPairs(2, 4), [[0, 1], [1, 0]]);
});

test('bradleyTerry ranks a consistent winner first', () => {
  const wins: [number, number][] = [[0, 1], [0, 2], [1, 2], [0, 1]];
  const s = bradleyTerry(3, wins);
  assert.ok(s[0] > s[1] && s[1] > s[2], s.join(','));
});

test('findCliches catches Arabic and English clichés', () => {
  assert.deepEqual(findCliches('هل تعبت من الفواتير؟'), ['هل تعبت', 'تعبت من']);
  assert.ok(findCliches('Say goodbye to manual work').includes('say goodbye'));
  assert.deepEqual(findCliches('فاتورتك نزلت 70%'), []);
});

test('hookTournament drops clichés and ranks by agreeing pairwise verdicts', async () => {
  const calls: string[] = [];
  const fake: ChatFn = async ({role, messages}) => {
    calls.push(role);
    if (role === 'hooks') return {model: 'f', text: JSON.stringify({hooks: [{text: 'هل تعبت من الفواتير؟', technique: 'q'}, {text: 'فاتورتك أكبر من إيجارك', technique: 'c'}, {text: 'ساعتين كل ليلة على الإكسل', technique: 'p'}]})};
    // Judge: always prefer the hook with the lower index, whatever the order (consistent verdicts).
    const body = String(messages[0].content);
    const pairs = [...body.matchAll(/A=(\d+) B=(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    return {model: 'f', text: JSON.stringify({winners: pairs.map(([a, b]) => (a < b ? 'A' : 'B'))})};
  };
  const ranked = await hookTournament({idea: 'x', brief: {hookOptions: ['خصم 40% على الكهربا']}, lang: 'ar', dialect: 'msa', chatFn: fake});
  assert.deepEqual(calls, ['hooks', 'hook-judge']);
  assert.ok(!ranked.some((h) => h.text.includes('تعبت')), 'cliché hook must be filtered');
  assert.equal(ranked[0].text, 'خصم 40% على الكهربا'); // index 0 wins every pair
});

test('critiqueScript returns no feedback for a strong clean script, feedback for clichés', async () => {
  const fake: ChatFn = async () => ({model: 'f', text: '{"score": 9, "issues": []}'});
  assert.equal((await critiqueScript({idea: 'x', scenes: [{text: 'فاتورتك نزلت'}], chatFn: fake})).feedback, '');
  const bad = await critiqueScript({idea: 'x', scenes: [{text: 'قل وداعاً للأوراق'}], chatFn: fake});
  assert.match(bad.feedback, /وداعاً/);
});

test('voices: Edge names are detected and defaults follow dialect + gender', () => {
  assert.ok(isEdgeVoice('ar-EG-SalmaNeural'));
  assert.ok(!isEdgeVoice('pNInz6obpgDQGcFmaJgB'));
  assert.equal(defaultVoice('ar', 'egyptian', 'female'), 'ar-EG-SalmaNeural');
  assert.equal(defaultVoice('ar', 'gulf'), 'ar-SA-HamedNeural');
  assert.equal(defaultVoice('en', 'msa', 'female'), 'en-US-AvaMultilingualNeural');
});

test('style packs are complete and stagger orders behave', () => {
  for (const id of packIds) {
    const p = packs[id];
    assert.ok(p.transitions.length && p.backgrounds.length && p.enterFrames > 0, id);
  }
  const s = {each: 3, from: 'center' as const};
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => staggerDelay(i, 5, s)), [6, 3, 0, 3, 6]);
  assert.equal(staggerDelay(0, 4, {each: 2, from: 'end'}), 6);
});

test('beatPulse peaks on the beat and decays', () => {
  assert.equal(beatPulse([30, 60], 30), 1);
  assert.equal(beatPulse([30, 60], 34, 8), 0.5);
  assert.equal(beatPulse([30, 60], 45), 0);
  assert.equal(beatPulse([], 10), 0);
});

test('snapToBeats: every cut lands on a beat, scenes only grow by less than a beat', () => {
  const beats = Array.from({length: 100}, (_, k) => k * 16);
  const scenes = [{duration: 90}, {duration: 101}, {duration: 77}, {duration: 60}];
  const snapped = snapToBeats(scenes, beats);
  const starts = sceneStarts(snapped);
  for (const s of starts.slice(1)) assert.equal(s % 16, 0, `cut at ${s}`);
  snapped.forEach((s, i) => assert.ok(s.duration >= scenes[i].duration && s.duration - scenes[i].duration < 16));
  assert.deepEqual(snapToBeats(scenes, []), scenes);
});

test('generated music: beat detector recovers the synthesized tempo', () => {
  const {L, bpm} = synthesize('upbeat-pop', 12, 2);
  const rate = 11025;
  const step = 44100 / rate;
  const mono = new Float32Array(Math.floor(L.length / step));
  for (let i = 0; i < mono.length; i++) mono[i] = L[Math.floor(i * step)];
  const d = detectBeats(mono, rate);
  assert.ok(Math.abs(d.bpm - bpm) <= 2, `detected ${d.bpm} vs ${bpm}`);
});

test('findInventedNumbers: flags numbers not in the sources, accepts Arabic-Indic and separators', () => {
  const scenes = [
    {type: 'stat', duration: 90, prefix: '', value: 3000, suffix: '+', label: 'بيت ركبوا معانا'},
    {type: 'features', duration: 90, title: 'تقسيط ٢٤ شهر', items: ['ضمان 25 سنة', 'خصم 40%']},
  ] as Scene[];
  assert.deepEqual(findInventedNumbers(scenes, 'أكثر من 3,000 بيت، تقسيط 24 شهر، ضمان 25 سنة').sort(), ['40']);
  assert.deepEqual(findInventedNumbers(scenes, '3000 24 25 40'), []);
});

test('brand page parsing: text, saturated colors, logo candidates', () => {
  const html = `<html><head><meta name="theme-color" content="#0a7cff"><link rel="apple-touch-icon" href="/icon.png"><style>.a{color:#ff3366}.b{color:#ffffff}.c{color:#333}</style></head>
  <body><script>var x=1</script><img class="site-logo" src="/img/logo.svg"><h1>Fast &amp; simple</h1></body></html>`;
  assert.equal(visibleText(html), 'Fast & simple');
  assert.deepEqual(brandColors(html), ['#0a7cff', '#ff3366']);
  assert.deepEqual(brandColors('<meta name="theme-color" content="#08090a"><style>.a{color:#5e6ad2}</style>'), ['#5e6ad2']);
  assert.deepEqual(logoCandidates(html, 'https://x.com/a/'), ['https://x.com/img/logo.svg', 'https://x.com/icon.png']);
});

test('applyLocks restores locked fields after an AI rewrite and leaves the rest', () => {
  const before = {title: 'A', subtitle: 'B', items: ['x', 'y']};
  const after = {title: 'A2', subtitle: 'B2', items: ['x2', 'y2']};
  assert.deepEqual(applyLocks(before, after, ['/title', '/items/1']), {title: 'A', subtitle: 'B2', items: ['x2', 'y']});
  assert.deepEqual(applyLocks(before, after, []), after);
});

test('migrateProps fills fields added after older versions were saved', () => {
  const old = {theme: {colors: {}}, format: '9:16', scenes: [{type: 'logo', duration: 70, tagline: 't'}]} as never;
  const m = migrateProps(old);
  assert.equal(m.style, 'premium-tech');
  assert.equal(m.theme.displayFont, 'none');
  assert.equal((m.scenes[0] as {name: string}).name, '');
});

test('factsSchema trims long lists instead of rejecting the whole site', () => {
  const f = factsSchema.parse({brandName: 'X', oneLiner: 'y', audience: 'z', features: Array.from({length: 12}, (_, i) => `f${i}`), numbers: [{value: 5, meaning: 'min'}], prices: [], tone: 't', cta: 'c'});
  assert.equal(f.features.length, 8);
  assert.equal(f.numbers[0].value, '5');
});

test('brandTheme skips site colors that would vanish on the background', () => {
  const theme = {colors: {background: '#05060f', primary: '#6c5cff', accent: '#22d3ee'}, logo: ''} as never;
  const t = brandTheme(theme, ['#0a0b10', '#e4f222'], 'jobs/x/logo.png');
  assert.equal(t.colors.primary, '#e4f222');
  assert.equal(t.colors.accent, '#22d3ee');
  assert.equal(t.logo, 'jobs/x/logo.png');
});

test('brand scraper refuses local addresses and scripted SVG logos', async () => {
  await assert.rejects(assertPublicUrl('http://localhost:4777/api/jobs'), /private|local/);
  await assert.rejects(assertPublicUrl('http://127.0.0.1/'), /private|local/);
  await assert.rejects(assertPublicUrl('file:///etc/passwd'), /only http/);
  assert.ok(isImageBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')));
  assert.ok(!isImageBytes(Buffer.from('<svg><script>alert(1)</script></svg>')));
  assert.ok(!isImageBytes(Buffer.from('<svg onload="alert(1)"></svg>')));
});

test('detectBeats returns no grid for silence', () => {
  assert.deepEqual(detectBeats(new Float32Array(11025 * 3), 11025), {bpm: 0, beats: []});
});
