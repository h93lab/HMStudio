import {execFileSync, spawn} from 'node:child_process';
import {appendFileSync, closeSync, createReadStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createServer, type ServerResponse} from 'node:http';
import path from 'node:path';
import {ROLE_DEFAULTS, ROOT, config, modelsFor, readSettings, settingsFile, type Role, type Settings} from './config';
import {authHeaders} from './llm';
import {formats} from '../src/schema';
import {loadJob, loadProps, type Job} from './jobs';
import {rewriteScene, saveManual} from './produce';
import {FPS, TRANSITION, type VideoProps} from '../src/schema';
import {packIds, packs} from '../src/design/packs';
import {musicPresets} from './music';

// Local dashboard: submit ideas, follow runs, open review pages, send revisions. Binds to localhost only.
const PORT = Number(process.env.MOTION_PORT ?? 4777);
const RUNS = path.join(config.dirs.jobs, '_runs');
mkdirSync(RUNS, {recursive: true});

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);

const clients = () => {
  const root = readFileSync(path.join(ROOT, 'src', 'Root.tsx'), 'utf8');
  return [...root.matchAll(/id="Promo-([\w-]+)"/g)].map((m) => m[1]);
};

const jobs = (): Job[] =>
  existsSync(config.dirs.jobs)
    ? readdirSync(config.dirs.jobs)
        .filter((d) => existsSync(path.join(config.dirs.jobs, d, 'job.json')))
        .sort()
        .reverse()
        .flatMap((d) => {
          try {
            return [JSON.parse(readFileSync(path.join(config.dirs.jobs, d, 'job.json'), 'utf8'))];
          } catch {
            return []; // being written right now: skip this refresh
          }
        })
    : [];

const runs = () =>
  readdirSync(RUNS)
    .filter((f) => f.endsWith('.log'))
    .sort()
    .reverse()
    .slice(0, 6)
    .map((f) => {
      const text = readFileSync(path.join(RUNS, f), 'utf8');
      const done = /\n✓ |\n✗ |exit \d+/.test(text);
      return {f, done, tail: text.split('\n').filter(Boolean).slice(-4).join('\n')};
    });

const busy = new Set<string>(); // job ids with a revise/reformat in flight

// Runs the CLI as a child process with an argument array (no shell), logging to jobs/_runs/.
// Free text goes after `--` so an idea starting with "-" can never be read as a CLI option.
const startRun = (command: string, options: string[], text: string[], jobId?: string, onSuccess?: () => void) => {
  const log = path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const out = openSync(log, 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'pipeline', 'cli.ts'), command, ...options, '--', ...text], {cwd: ROOT, stdio: ['ignore', out, out], env: process.env});
  closeSync(out); // the child holds its own copy
  if (jobId) busy.add(jobId);
  const done = (msg: string) => {
    if (jobId) busy.delete(jobId);
    appendFileSync(log, `\n${msg}\n`);
  };
  child.on('error', (e) => done(`✗ could not start: ${e.message}\nexit 1`));
  child.on('exit', (code) => {
    done(`exit ${code}`);
    if (code === 0) onSuccess?.();
  });
};

const page = (body: string) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motion Studio</title>
<style>
:root{--bg:#07080f;--card:#11131d;--line:#23263a;--fg:#eef0f8;--muted:#8d93ad;--accent:#22d3ee;--primary:#6c5cff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;padding:24px 16px}
main{max-width:980px;margin:auto;display:grid;gap:18px}h1{margin:0;font-size:24px}h2{margin:0 0 10px;font-size:17px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
textarea,select,input{width:100%;background:#0b0d16;color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit}
textarea{min-height:110px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:10px 0}
button{background:var(--primary);color:#fff;border:0;white-space:nowrap;border-radius:10px;padding:10px 18px;font:inherit;font-weight:700;cursor:pointer}
label{color:var(--muted);font-size:13px}.muted{color:var(--muted)}pre{white-space:pre-wrap;background:#0b0d16;padding:10px;border-radius:10px;margin:6px 0 0;direction:ltr;text-align:left;font-size:12px}
.job{border-top:1px solid var(--line);padding:12px 0}.job:first-child{border:0}.vs a{color:var(--accent);margin-inline-end:12px}
.idea{margin:4px 0}.inline{display:flex;gap:8px;margin-top:8px}.inline input{flex:1}
</style></head><body><main>${body}</main></body></html>`;

const home = () => {
  const cl = clients();
  const rs = runs();
  const running = rs.some((r) => !r.done);
  return page(`
<h1>Motion Studio <a href="/settings" style="font-size:14px;color:var(--accent);margin-inline-start:12px">⚙️ موديلات الذكاء الاصطناعي</a></h1>
${running ? '<script>setInterval(()=>{const typing=[...document.querySelectorAll("textarea,input:not([type=hidden]):not([type=checkbox]):not([type=number])")].some(e=>e.value.trim()||e===document.activeElement);if(!typing)location.reload()},5000)</script>' : ''}
<section><h2>فيديو جديد</h2>
<form method="post" action="/make">
<textarea name="idea" dir="auto" required placeholder="اكتب الفكرة أو معلومات المنتج: ايه هو، لمين، أهم ميزة، أي أرقام حقيقية، الموقع..."></textarea>
<div class="row">
<div><label>العميل</label><select name="client">${cl.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
<div><label>المقاس</label><select name="format">${Object.keys(formats).map((f) => `<option>${f}</option>`).join('')}</select></div>
<div><label>اللهجة</label><select name="dialect"><option value="msa">فصحى مبسطة</option><option value="egyptian">مصري</option><option value="gulf">خليجي</option><option value="levantine">شامي</option></select></div>
<div><label>المدة (ثانية)</label><input name="seconds" type="number" min="10" max="90" value="30"></div>
</div>
<div class="row">
<div><label>الجودة</label><select name="tier"><option value="standard">قياسي (hook tournament + ناقد + QA)</option><option value="premium">بريميوم (+3 نسخ A/B + تصحيح)</option><option value="draft">مسودة سريعة</option></select></div>
<div><label>الستايل</label><select name="style"><option value="">المخرج يختار</option>${packIds.map((p) => `<option value="${p}">${esc(packs[p].label)}</option>`).join('')}</select></div>
<div><label>المزيكا</label><select name="music"><option value="">المخرج يختار</option>${musicPresets.map((m) => `<option>${m}</option>`).join('')}<option value="none">بدون</option></select></div>
<div><label>الراوي</label><select name="gender"><option value="male">صوت رجالي</option><option value="female">صوت حريمي</option></select></div>
</div>
<div class="row"><div><label>موقع العميل (اختياري: حقائق + لوجو)</label><input name="url" type="url" dir="ltr" placeholder="https://"></div><label><input type="checkbox" name="brandtheme" style="width:auto"> خُد ألوان البراند من الموقع</label></div>
<div class="row"><label><input type="checkbox" name="draft" style="width:auto"> مسودة (صور بدون فيديو)</label><label><input type="checkbox" name="qafix" style="width:auto"> تصحيح تلقائي من الـ QA</label></div>
<button>ابدأ</button></form></section>
${rs.length ? `<section><h2>التشغيلات ${running ? '(شغال…)' : ''}</h2>${rs.map((r) => `<div><a class="muted" href="/runs/${esc(r.f)}">${esc(r.f)}</a> ${r.done ? '' : '⏳'}<pre>${esc(r.tail)}</pre></div>`).join('')}</section>` : ''}
<section><h2>الفيديوهات</h2>${
    jobs()
      .map(
        (j) => `<div class="job"><b>${esc(j.client)}</b> <span class="muted">· ${esc(j.id)} · ${esc(j.format)}</span>
<p class="idea" dir="auto">${esc(j.idea.slice(0, 220))}</p>
<div class="vs">${j.versions
          .map((v) => `<a href="/files/${esc(j.id)}/${esc(v.review ?? '')}">v${v.v}${v.variant ? ' · A/B' : ''}${v.qa ? ` · QA ${v.qa.score}/10` : ''}</a>${Object.entries(v.videos).map(([f, file]) => `<a href="/files/${esc(j.id)}/${esc(file)}">mp4 ${esc(f)}</a>`).join('')}`)
          .join('<br>')}</div>
<div class="vs" style="margin-top:6px"><a href="/edit/${esc(j.id)}">✏️ المحرر</a><a href="/review/${esc(j.id)}?t=${esc(reviewToken(j.id))}">🔗 رابط مراجعة العميل</a>${commentsOf(j.id).filter((c) => !c.resolved).length ? `<form method="post" action="/apply-comments" style="display:inline"><input type="hidden" name="job" value="${esc(j.id)}"><button>طبّق ${commentsOf(j.id).filter((c) => !c.resolved).length} تعليق</button></form>` : ''}</div>
<form class="inline" method="post" action="/revise"><input type="hidden" name="job" value="${esc(j.id)}"><input name="feedback" dir="auto" placeholder="ملاحظات للتعديل…" required><button>عدّل</button></form>
<form class="inline" method="post" action="/reformat"><input type="hidden" name="job" value="${esc(j.id)}"><select name="format">${Object.keys(formats).map((f) => `<option>${f}</option>`).join('')}</select><button>مقاس تاني</button></form></div>`,
      )
      .join('') || '<p class="muted">لسه مفيش فيديوهات.</p>'
  }</section>`);
};

const send = (res: ServerResponse, code: number, body: string, type = 'text/html; charset=utf-8') => {
  res.writeHead(code, {'content-type': type, 'x-content-type-options': 'nosniff'});
  res.end(body);
};

const types: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.log': 'text/plain; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon'};

// Static files with HTTP Range support so mp4s can be seeked in every browser.
const serveFile = (res: ServerResponse, base: string, rel: string, range?: string, sandbox = true) => {
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'not found', 'text/plain');
  const size = statSync(file).size;
  const type = types[path.extname(file)] ?? 'application/octet-stream';
  // Served files never run code on the dashboard origin (a scraped SVG logo could carry <script>).
  if (sandbox) res.setHeader('content-security-policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'");
  if (size === 0) {
    res.writeHead(200, {'content-type': type, 'content-length': 0});
    return res.end();
  }
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, {'content-range': `bytes */${size}`});
      return res.end();
    }
    res.writeHead(206, {'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes'});
  } else {
    res.writeHead(200, {'content-type': type, 'content-length': size, 'accept-ranges': 'bytes'});
  }
  createReadStream(file, {start, end})
    .on('error', () => res.destroy())
    .pipe(res);
};

const readForm = async (req: import('node:http').IncomingMessage) => new URLSearchParams(await readBody(req));

const readBody = (req: import('node:http').IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 5_000_000) {
        reject(new Error('form too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); // decode once: multi-byte Arabic never splits
    req.on('error', reject);
  });

// Only this machine's own pages may use the dashboard: blocks DNS rebinding (Host) and cross-site form posts (Origin).
// Reachable from this Mac and from the owner's own Tailscale devices only (never the LAN/internet).
const tailscale = (() => {
  const bin = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'].find((b) => existsSync(b));
  return (args: string[]) => (bin ? execFileSync(bin, args, {encoding: 'utf8', timeout: 5000}).trim() : '');
})();
const tailnet = () => {
  try {
    const ip = tailscale(['ip', '-4']).split('\n')[0];
    const name = String(JSON.parse(tailscale(['status', '--json'])).Self?.DNSName ?? '').replace(/\.$/, '');
    return /^100\.\d+\.\d+\.\d+$/.test(ip) ? {ip, name} : null;
  } catch {
    return null;
  }
};
const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const allowTailnet = (t: {ip: string; name: string}) => {
  allowedHosts.add(`${t.ip}:${PORT}`);
  if (t.name) {
    allowedHosts.add(`${t.name}:${PORT}`);
    allowedHosts.add(`${t.name.split('.')[0]}:${PORT}`); // short MagicDNS name
  }
};
const trusted = (req: import('node:http').IncomingMessage) => {
  if (!allowedHosts.has(req.headers.host ?? '')) return false;
  const origin = req.headers.origin;
  if (req.method === 'POST' && (!origin || !allowedHosts.has(origin.replace(/^https?:\/\//, '')))) return false;
  return true;
};

// ── AI model settings ────────────────────────────────────────────────────────
let modelCache: {at: number; ids: string[]} | null = null;
const availableModels = async () => {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.ids;
  const r = await fetch(`${config.baseUrl}/models`, {headers: authHeaders(), signal: AbortSignal.timeout(20_000)});
  const ids: string[] = r.ok ? ((await r.json()).data ?? []).map((m: {id: string}) => m.id) : [];
  modelCache = {at: Date.now(), ids};
  return ids;
};

const ROLE_AR: Record<Role, string> = {
  director: 'المخرج (الفكرة، الـ hook، الستايل، المزيكا)',
  writer: 'الكاتب (السكريبت، الجمل الافتتاحية، التعديلات، حقائق الموقع)',
  judge: 'الحَكَم (مسابقة الجمل، ناقد السكريبت، المقارنات)',
  vision: 'المراجعة البصرية للقطات',
  image: 'توليد الصور',
  video: 'توليد الفيديو (فاضي = صورة حيّة)',
  stt: 'تحويل الصوت لنص (للأصوات غير Edge بس)',
};

const settingsPage = async () => {
  const s = readSettings();
  const ids = await availableModels().catch(() => [] as string[]);
  const roles = Object.keys(ROLE_DEFAULTS) as Role[];
  return page(`<h1>موديلات الذكاء الاصطناعي <a href="/" style="font-size:14px;color:var(--accent);margin-inline-start:12px">← الرئيسية</a></h1>
<section><p class="muted">لكل دور: اكتب الموديل الأساسي، وبعده بدايل (مفصولين بفاصلة)؛ لو الأول وقع النظام يجرب اللي بعده. التغيير بيتطبق على أول طلب بعد الحفظ. ${ids.length} موديل متاح في OmniRoute.</p>
<form method="post" action="/settings">
<datalist id="models">${ids.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
${roles
  .map(
    (r) => `<div style="margin:14px 0"><label>${esc(ROLE_AR[r])} <span class="muted" dir="ltr">(${r})</span></label>
<div class="inline"><input name="${r}" dir="ltr" list="models" value="${esc(modelsFor(r).join(', '))}" placeholder="${esc(ROLE_DEFAULTS[r].models.join(', ') || 'فاضي')}">
${['director', 'writer', 'judge', 'vision'].includes(r) ? `<button type="button" class="ghost" onclick="testRole('${r}', this)">اختبر</button>` : ''}</div>
<small class="muted" id="t-${r}" dir="ltr">${s.models?.[r]?.length ? 'من الإعدادات' : 'الافتراضي'}</small></div>`,
  )
  .join('')}
<div class="row"><div><label>الراوي الافتراضي (فاضي = حسب اللهجة)</label><input name="voice" dir="ltr" value="${esc(s.voice ?? '')}" placeholder="ar-EG-SalmaNeural"></div>
<div><label>سرعة الكلام</label><input name="voiceRate" dir="ltr" value="${esc(s.voiceRate ?? '+6%')}" placeholder="+6%"></div></div>
<button>احفظ</button> <button type="submit" name="reset" value="1" class="ghost" style="background:transparent;border:1px solid var(--line)">رجّع الافتراضي</button>
</form></section>
<script>
async function testRole(role, btn) {
  const out = document.getElementById('t-' + role);
  const models = document.querySelector('input[name="' + role + '"]').value;
  btn.disabled = true; out.textContent = '…';
  const r = await fetch('/api/settings/test', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({models})});
  const d = await r.json().catch(() => ({error: 'bad response'}));
  out.textContent = d.ok ? '✓ ' + d.model + ' · ' + d.ms + 'ms · "' + d.reply + '"' : '✗ ' + (d.error || 'failed');
  btn.disabled = false;
}
</script>`);
};

const saveSettings = (f: URLSearchParams) => {
  if (f.get('reset')) {
    writeFileSync(settingsFile, JSON.stringify({}, null, 2));
    return;
  }
  const valid = /^[\w./:@+-]+$/;
  const models: Settings['models'] = {};
  for (const r of Object.keys(ROLE_DEFAULTS) as Role[]) {
    const list = (f.get(r) ?? '').split(',').map((x) => x.trim()).filter((x) => valid.test(x)).slice(0, 8);
    // Only store what differs from the default, so future default improvements still reach untouched roles.
    if (list.join(',') !== ROLE_DEFAULTS[r].models.join(',')) models[r] = list;
  }
  const voice = (f.get('voice') ?? '').trim();
  const voiceRate = (f.get('voiceRate') ?? '').trim();
  const next: Settings = {models, ...(valid.test(voice) ? {voice} : {}), ...(/^[+-]\d{1,2}%$/.test(voiceRate) ? {voiceRate} : {})};
  writeFileSync(settingsFile, JSON.stringify(next, null, 2));
};

// ── Review links + comments ──────────────────────────────────────────────────
type Comment = {id: string; v: number; time: number; text: string; author: string; at: string; resolved?: boolean};
const commentsFile = (id: string) => path.join(config.dirs.jobs, id, 'comments.json');
const commentsOf = (id: string): Comment[] => {
  try {
    return existsSync(commentsFile(id)) ? JSON.parse(readFileSync(commentsFile(id), 'utf8')) : [];
  } catch {
    return [];
  }
};
const saveComments = (id: string, list: Comment[]) => writeFileSync(commentsFile(id), JSON.stringify(list, null, 2));

// Per-job secret for the client review link, in its own file so concurrent job.json writes can never drop it.
const reviewToken = (id: string) => {
  const file = path.join(config.dirs.jobs, id, '.review-token');
  if (!existsSync(file)) writeFileSync(file, randomBytes(12).toString('hex'));
  return readFileSync(file, 'utf8').trim();
};

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const reviewPage = (id: string, token: string) => {
  const job = loadJob(id);
  const v = job.versions.filter((x) => Object.keys(x.videos).length).at(-1);
  const video = v ? Object.values(v.videos)[0] : undefined;
  const list = commentsOf(id).filter((c) => !c.resolved);
  return page(`<h1>مراجعة: ${esc(job.client)}</h1>
<section>${video ? `<video id="v" src="/files/${esc(id)}/${esc(video)}" controls playsinline style="width:100%;max-width:420px;display:block;margin:auto;border-radius:12px;background:#000"></video>` : '<p class="muted">الفيديو لسه بيترندر.</p>'}
<form id="f" style="margin-top:12px"><label>تعليقك (هيتسجل عند الثانية الحالية في الفيديو)</label>
<div class="inline"><input id="name" placeholder="اسمك" style="max-width:140px"><input id="text" dir="auto" placeholder="مثلاً: غيّر الجملة دي، اللون أغمق…" required><button>أضف</button></div></form></section>
<section><h2>التعليقات</h2>${list.map((c) => `<p dir="auto"><b>${esc(mmss(c.time))}</b> · ${esc(c.author || 'العميل')}: ${esc(c.text)}</p>`).join('') || '<p class="muted">مفيش تعليقات لسه.</p>'}</section>
<script>
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const v = document.getElementById('v');
  const r = await fetch('/api/jobs/${esc(id)}/comments', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({token: ${JSON.stringify(token)}, time: v ? v.currentTime : 0, v: ${v?.v ?? 0}, author: document.getElementById('name').value, text: document.getElementById('text').value})});
  if (r.ok) location.reload(); else alert(await r.text());
};
</script>`);
};

// Unresolved comments → one revision brief with timestamps mapped to scenes.
const commentsToFeedback = (id: string, list: Comment[]) => {
  const job = loadJob(id);
  const last = job.versions.at(-1);
  const scenes = last ? loadProps(id, last.v).scenes : [];
  const sceneAt = (t: number) => {
    let at = 0;
    for (const [i, s] of scenes.entries()) {
      if (t * FPS < at + s.duration - TRANSITION) return i + 1;
      at += s.duration - TRANSITION;
    }
    return scenes.length;
  };
  return list.map((c) => `At ${mmss(c.time)} (scene ${sceneAt(c.time)}): ${c.text}`).join('\n');
};

const readJson = async (req: import('node:http').IncomingMessage) => JSON.parse((await readBody(req)) || '{}');

const validJob = (id: string | null) => !!id && /^[\w-]+$/.test(id) && existsSync(path.join(config.dirs.jobs, id, 'job.json'));

const handler = async (req: import('node:http').IncomingMessage, res: ServerResponse) => {
  try {
    if (!trusted(req)) return send(res, 403, 'forbidden', 'text/plain');
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, home());
    const json = (code: number, data: unknown) => send(res, code, JSON.stringify(data), 'application/json; charset=utf-8');
    if (req.method === 'GET' && url.pathname.startsWith('/files/')) return serveFile(res, config.dirs.jobs, decodeURIComponent(url.pathname.slice(7)), req.headers.range);
    // Visual editor (built with `npm run editor`): SPA under /edit/<job>.
    if (req.method === 'GET' && url.pathname.startsWith('/edit')) {
      const dist = path.join(ROOT, 'editor', 'dist');
      if (!existsSync(path.join(dist, 'index.html'))) return send(res, 503, 'Editor not built yet: run `npm run editor`', 'text/plain');
      const rel = decodeURIComponent(url.pathname.replace(/^\/edit\/?/, ''));
      if (rel.startsWith('assets/')) return serveFile(res, dist, rel, undefined, false);
      return serveFile(res, dist, 'index.html', undefined, false);
    }
    const reviewMatch = url.pathname.match(/^\/review\/([\w-]+)$/);
    if (req.method === 'GET' && reviewMatch) {
      if (!validJob(reviewMatch[1]) || url.searchParams.get('t') !== reviewToken(reviewMatch[1])) return send(res, 403, 'invalid review link', 'text/plain');
      return send(res, 200, reviewPage(reviewMatch[1], url.searchParams.get('t')!));
    }
    // ── JSON API for the editor ──
    const api = url.pathname.match(/^\/api\/jobs\/([\w-]+)(?:\/(save|rewrite|render|comments))?$/);
    if (api) {
      const [, id, action] = api;
      if (!validJob(id)) return json(404, {error: 'unknown job'});
      if (req.method === 'GET' && !action) {
        const job = loadJob(id);
        const v = Number(url.searchParams.get('v')) || job.versions.at(-1)?.v;
        if (!v) return json(404, {error: 'job has no versions yet'});
        return json(200, {job, v, props: loadProps(id, v), locks: job.versions.find((x) => x.v === v)?.locks ?? [], busy: busy.has(id)});
      }
      if (req.method === 'GET' && action === 'comments') return json(200, commentsOf(id));
      if (req.method === 'POST' && action === 'comments') {
        const body = await readJson(req);
        if (body.token !== reviewToken(id) || typeof body.text !== 'string' || !body.text.trim()) return json(400, {error: 'bad comment'});
        const list = commentsOf(id);
        list.push({id: randomBytes(6).toString('hex'), v: Number(body.v) || 0, time: Math.max(0, Number(body.time) || 0), text: body.text.trim().slice(0, 1000), author: String(body.author ?? '').slice(0, 60), at: new Date().toISOString()});
        saveComments(id, list);
        return json(200, {ok: true});
      }
      if (req.method === 'POST' && busy.has(id)) return json(409, {error: 'this job is busy, wait for the current task to finish'});
      if (req.method === 'POST' && action === 'save') {
        const body = await readJson(req);
        busy.add(id);
        try {
          const r = await saveManual(id, body.props as VideoProps, Array.isArray(body.locks) ? body.locks.filter((l: unknown) => typeof l === 'string') : [], typeof body.note === 'string' ? body.note.slice(0, 200) : 'manual edit');
          return json(200, {v: r.version.v, props: r.props, notes: r.version.notes, review: r.version.review});
        } catch (e) {
          return json(400, {error: (e as Error).message});
        } finally {
          busy.delete(id);
        }
      }
      if (req.method === 'POST' && action === 'rewrite') {
        const body = await readJson(req);
        try {
          const scene = await rewriteScene(id, body.props as VideoProps, Number(body.index), String(body.instruction ?? '').slice(0, 500), Array.isArray(body.locks) ? body.locks : []);
          return json(200, {scene});
        } catch (e) {
          return json(400, {error: (e as Error).message});
        }
      }
      if (req.method === 'POST' && action === 'render') {
        const body = await readJson(req);
        startRun('render', body.v ? ['--version', String(Number(body.v))] : [], [id], id);
        return json(200, {ok: true});
      }
      return json(405, {error: 'method not allowed'});
    }
    if (req.method === 'GET' && url.pathname === '/api/runs') return json(200, runs());
    if (req.method === 'GET' && url.pathname === '/settings') return send(res, 200, await settingsPage());
    if (req.method === 'POST' && url.pathname === '/api/settings/test') {
      const body = await readJson(req);
      const models = String(body.models ?? '').split(',').map((x: string) => x.trim()).filter(Boolean).slice(0, 8);
      if (!models.length) return json(400, {error: 'no model'});
      const started = Date.now();
      try {
        const {chat} = await import('./llm');
        const r = await chat({role: 'settings-test', models, messages: [{role: 'user', content: 'Reply with one short Arabic word meaning "ready".'}], maxTokens: 800, timeoutMs: 90_000});
        return json(200, {ok: true, model: r.model, ms: Date.now() - started, reply: r.text.trim().slice(0, 40)});
      } catch (e) {
        return json(200, {ok: false, error: (e as Error).message.split('\n').slice(0, 2).join(' ').slice(0, 300)});
      }
    }
    // Brand/job assets for the editor's live Player (staticFile paths resolve to /jobs/…, /music/…).
    if (req.method === 'GET' && /^\/(jobs|music|sfx|clients)\//.test(url.pathname)) return serveFile(res, path.join(ROOT, 'public'), decodeURIComponent(url.pathname.slice(1)), req.headers.range);
    if (req.method === 'GET' && url.pathname.startsWith('/runs/')) return serveFile(res, RUNS, decodeURIComponent(url.pathname.slice(6)));
    if (req.method === 'POST') {
      const f = await readForm(req);
      if (url.pathname === '/make') {
        const idea = (f.get('idea') ?? '').trim();
        const client = f.get('client') ?? '';
        const format = f.get('format') ?? '9:16';
        if (!idea || !clients().includes(client) || !(format in formats)) return send(res, 400, 'bad input', 'text/plain');
        const dialect = ['msa', 'egyptian', 'gulf', 'levantine'].includes(f.get('dialect') ?? '') ? f.get('dialect')! : 'msa';
        const seconds = String(Math.min(90, Math.max(10, Number(f.get('seconds')) || 30)));
        const tier = ['draft', 'standard', 'premium'].includes(f.get('tier') ?? '') ? f.get('tier')! : 'standard';
        const style = packIds.includes(f.get('style') as never) ? ['--style', f.get('style')!] : [];
        const music = [...musicPresets, 'none'].includes(f.get('music') as never) ? ['--music', f.get('music')!] : [];
        const url = /^https?:\/\/[^\s]+$/.test(f.get('url') ?? '') ? ['--url', f.get('url')!, ...(f.get('brandtheme') ? ['--brand-theme'] : [])] : [];
        const gender = f.get('gender') === 'female' ? 'female' : 'male';
        startRun('make', ['--client', client, '--format', format, '--dialect', dialect, '--seconds', seconds, '--tier', tier, '--gender', gender, ...style, ...music, ...url, ...(f.get('draft') ? ['--draft'] : []), ...(f.get('qafix') ? ['--qa-fix'] : [])], [idea]);
      } else if (url.pathname === '/revise') {
        const job = f.get('job');
        const feedback = (f.get('feedback') ?? '').trim();
        if (!validJob(job) || !feedback) return send(res, 400, 'bad input', 'text/plain');
        if (busy.has(job!)) return send(res, 409, 'this job is already being updated, wait for it to finish', 'text/plain');
        startRun('revise', [], [job!, feedback], job!);
      } else if (url.pathname === '/settings') {
        saveSettings(f);
        res.writeHead(303, {location: '/settings'});
        return res.end();
      } else if (url.pathname === '/apply-comments') {
        const job = f.get('job');
        if (!validJob(job)) return send(res, 400, 'bad input', 'text/plain');
        if (busy.has(job!)) return send(res, 409, 'this job is already being updated, wait for it to finish', 'text/plain');
        const open = commentsOf(job!).filter((c) => !c.resolved);
        if (!open.length) return send(res, 400, 'no open comments', 'text/plain');
        const ids = new Set(open.map((c) => c.id));
        // Comments are resolved only when the revision really succeeded, so failed runs never lose client feedback.
        startRun('revise', [], [job!, `Client review comments:\n${commentsToFeedback(job!, open)}`], job!, () => saveComments(job!, commentsOf(job!).map((c) => (ids.has(c.id) ? {...c, resolved: true} : c))));
      } else if (url.pathname === '/reformat') {
        const job = f.get('job');
        const format = f.get('format') ?? '';
        if (!validJob(job) || !(format in formats)) return send(res, 400, 'bad input', 'text/plain');
        if (busy.has(job!)) return send(res, 409, 'this job is already being updated, wait for it to finish', 'text/plain');
        startRun('reformat', ['--format', format], [job!], job!);
      } else return send(res, 404, 'not found', 'text/plain');
      res.writeHead(303, {location: '/'});
      return res.end();
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    if (!res.headersSent) send(res, (e as Error).name === 'SyntaxError' ? 400 : 500, esc((e as Error).message), 'text/plain');
    else res.destroy();
  }
};

createServer(handler).listen(PORT, '127.0.0.1', () => console.log(`Motion Studio dashboard → http://localhost:${PORT}`));

// Second listener on the Tailscale address only. Tailscale may come up after login, so keep trying until it does.
const bindTailnet = () => {
  const t = tailnet();
  if (!t) return setTimeout(bindTailnet, 30_000);
  allowTailnet(t);
  createServer(handler)
    .on('error', () => setTimeout(bindTailnet, 30_000))
    .listen(PORT, t.ip, () => console.log(`Tailscale → http://${t.name || t.ip}:${PORT}`));
};
bindTailnet();
