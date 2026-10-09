import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import type {ZodType} from 'zod';
import {SceneEngine} from '../../src/engine/SceneEngine';
import {TRANSITION, fontNames, displayFonts, formats, sceneSchema, sceneStarts, totalDuration, videoSchema, type Scene, type VideoProps} from '../../src/schema';
import {packIds, packs, backgroundNames, cameraModes} from '../../src/design/packs';
import {describe, elementOf, enumValues, kindOf, maxOf, shapeOf} from './schemaForm';

type JobInfo = {id: string; client: string; idea: string; versions: {v: number; videos: Record<string, string>; review?: string}[]};

// Fields the pipeline owns (voice, captions) are never edited by hand.
const HIDDEN = new Set(['type', 'audio', 'captions']);
const sceneOptions = (sceneSchema as unknown as {options: ZodType[]}).options;
const literalOf = (o: ZodType) => (shapeOf(o).type as unknown as {_zod: {def: {values: string[]}}})._zod.def.values[0];
const shapeFor = (type: string) => shapeOf(sceneOptions.find((o) => literalOf(o) === type)!);
const sceneTypes = sceneOptions.map(literalOf);

// Starter content when adding a scene; the owner (or AI rewrite) fills it.
const blank = (type: string): Scene => {
  const s: Record<string, unknown> = {type, duration: 90};
  for (const [k, f] of Object.entries(shapeFor(type))) {
    if (HIDDEN.has(k) || ['duration', 'camera', 'background', 'voiceover', 'icons'].includes(k)) continue;
    const kind = kindOf(f);
    s[k] =
      kind === 'number'
        ? 1
        : kind === 'array'
          ? kindOf(elementOf(f)) === 'object'
            ? [{label: 'A', value: 1}, {label: 'B', value: 2}]
            : ['…', '…']
          : kind === 'enum'
            ? enumValues(f)[0]
            : ['image', 'video', 'url', 'emphasis', 'prefix', 'suffix', 'role', 'name'].includes(k)
              ? ''
              : '…';
  }
  return s as Scene;
};

const moveLocks = (locks: string[], map: (i: number) => number | null) =>
  locks.flatMap((l) => {
    const m = l.match(/^\/scenes\/(\d+)(\/.*)$/);
    if (!m) return [l];
    const to = map(Number(m[1]));
    return to === null ? [] : [`/scenes/${to}${m[2]}`];
  });

export const App: React.FC<{jobId: string}> = ({jobId}) => {
  const [job, setJob] = useState<JobInfo | null>(null);
  const [v, setV] = useState(0);
  // Undo history keeps props and locks together, so undoing a reorder also undoes its lock remapping.
  const [history, setHistory] = useState<{props: VideoProps; locks: string[]}[]>([]);
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<'scene' | 'video'>('scene');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const player = useRef<PlayerRef>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (poll.current) clearInterval(poll.current);
    },
    [],
  );
  const props = history[cursor]?.props;
  const locks = history[cursor]?.locks ?? [];
  const setLocks = (next: string[]) => setHistory((h) => h.map((e, k) => (k === cursor ? {...e, locks: next} : e)));

  const load = useCallback(
    async (version?: number) => {
      const r = await fetch(`/api/jobs/${jobId}${version ? `?v=${version}` : ''}`);
      const data = await r.json();
      if (!r.ok) return setStatus(data.error ?? 'could not load');
      setJob(data.job);
      setV(data.v);
      setHistory([{props: data.props, locks: data.locks ?? []}]);
      setCursor(0);
      setSel(0);
    },
    [jobId],
  );
  useEffect(() => {
    load();
  }, [load]);

  // Every change goes through here: one undo step, optional lock on the edited path.
  const change = (next: VideoProps, lockPath?: string, nextLocks?: string[]) => {
    const l = nextLocks ?? (lockPath && !locks.includes(lockPath) ? [...locks, lockPath] : locks);
    setHistory((h) => [...h.slice(0, cursor + 1), {props: next, locks: l}].slice(-100));
    setCursor((c) => Math.min(c + 1, 99));
  };
  const setScene = (i: number, patch: Record<string, unknown>, lockKey?: string) => {
    const scenes = props.scenes.map((s, k) => (k === i ? ({...s, ...patch} as Scene) : s));
    change({...props, scenes}, lockKey ? `/scenes/${i}/${lockKey}` : undefined);
  };

  const validation = useMemo(() => (props ? videoSchema.safeParse(props) : null), [props]);
  // The preview never crashes mid-typing: durations are clamped for the Player (the form still shows the error).
  const previewProps = useMemo(() => (props ? {...props, scenes: props.scenes.map((s) => ({...s, duration: Math.max(30, Math.min(900, Number(s.duration) || 30))}))} : props), [props]);
  const starts = useMemo(() => (props ? sceneStarts(props.scenes) : []), [props]);
  const total = previewProps ? Math.max(1, totalDuration(previewProps.scenes)) : 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target as HTMLElement).closest('input,textarea,select')) return;
      const key = e.key.toLowerCase(); // Shift+Z reports "Z"
      if (key === 'z' && !e.shiftKey) setCursor((c) => Math.max(0, c - 1));
      if ((key === 'z' && e.shiftKey) || key === 'y') setCursor((c) => Math.min(history.length - 1, c + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history.length]);

  if (!props) return <div className="empty">{status || 'Loading…'}</div>;
  const {width, height} = formats[props.format];
  const scene = props.scenes[sel];

  const seek = (i: number) => {
    setSel(i);
    player.current?.seekTo(starts[i] + 20);
  };

  const call = async (url: string, body: unknown) => {
    const r = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const text = await r.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {error: text.slice(0, 200)};
    }
    return {ok: r.ok, data};
  };

  const save = async () => {
    setBusy(true);
    setStatus('Saving: voicing changed lines and rendering previews…');
    let res: Awaited<ReturnType<typeof call>>;
    try {
      res = await call(`/api/jobs/${jobId}/save`, {props, locks, note: 'editor'});
    } catch (e) {
      return setStatus(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
    const {ok, data} = res as {ok: boolean; data: {error?: string; v: number; notes?: string[]; props: VideoProps}};
    if (!ok) return setStatus(`✗ ${data.error}`);
    setStatus(`✓ saved as v${data.v}${data.notes?.length ? ` · ${data.notes.length} note(s): ${data.notes.slice(0, 2).join(' | ')}` : ''}`);
    setV(data.v);
    change(data.props, undefined, locks);
    fetch(`/api/jobs/${jobId}`)
      .then((x) => x.json())
      .then((d) => setJob(d.job));
  };

  const render = async () => {
    setStatus('Rendering mp4 in the background…');
    const {ok, data} = await call(`/api/jobs/${jobId}/render`, {v});
    if (!ok) return setStatus(`✗ ${data.error}`);
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      const d = await (await fetch(`/api/jobs/${jobId}`)).json().catch(() => ({busy: true}));
      if (!d.busy) {
        if (poll.current) clearInterval(poll.current);
        setJob(d.job);
        const ver = d.job.versions.find((x: {v: number}) => x.v === v);
        setStatus(ver && Object.keys(ver.videos).length ? '✓ video ready' : '✗ render failed, see the dashboard runs');
      }
    }, 3000);
  };

  const rewrite = async () => {
    if (!instruction.trim()) return;
    setBusy(true);
    setStatus(`AI rewriting scene ${sel + 1}…`);
    const {ok, data} = await call(`/api/jobs/${jobId}/rewrite`, {props, index: sel, instruction, locks}).finally(() => setBusy(false));
    if (!ok) return setStatus(`✗ ${data.error}`);
    change({...props, scenes: props.scenes.map((s, k) => (k === sel ? (data.scene as Scene) : s))});
    setStatus(`✓ scene ${sel + 1} rewritten (locked fields kept). Save to voice it.`);
    setInstruction('');
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    const scenes = [...props.scenes];
    const [s] = scenes.splice(from, 1);
    scenes.splice(to, 0, s);
    const map = (i: number) => (i === from ? to : from < to && i > from && i <= to ? i - 1 : from > to && i >= to && i < from ? i + 1 : i);
    change({...props, scenes}, undefined, moveLocks(locks, map));
    setSel(to);
  };
  const remove = (i: number) => {
    if (props.scenes.length <= 1) return;
    change({...props, scenes: props.scenes.filter((_, k) => k !== i)}, undefined, moveLocks(locks, (k) => (k === i ? null : k > i ? k - 1 : k)));
    setSel(Math.max(0, i - 1));
  };
  const duplicate = (i: number) => {
    const scenes = [...props.scenes];
    scenes.splice(i + 1, 0, structuredClone(props.scenes[i]));
    change({...props, scenes}, undefined, moveLocks(locks, (k) => (k > i ? k + 1 : k)));
    setSel(i + 1);
  };
  const add = (type: string) => {
    const scenes = [...props.scenes];
    scenes.splice(sel + 1, 0, blank(type));
    change({...props, scenes}, undefined, moveLocks(locks, (k) => (k > sel ? k + 1 : k)));
    setSel(sel + 1);
  };

  const lockButton = (path: string) => {
    const on = locks.includes(path);
    return (
      <button className={`lock ${on ? 'on' : ''}`} title={on ? 'Locked: AI will not change this field (click to unlock)' : 'Unlocked'} onClick={() => setLocks(on ? locks.filter((l) => l !== path) : [...locks, path])}>
        {on ? '🔒' : '🔓'}
      </button>
    );
  };

  // Field editor generated from the zod schema of the selected scene type.
  const field = (name: string, schema: ZodType, value: unknown, onChange: (v: unknown) => void, path: string) => {
    const kind = kindOf(schema);
    const max = maxOf(schema);
    const label = (
      <div className="label">
        <span>{name}</span>
        {max && typeof value === 'string' ? <span className={value.length > max ? 'bad' : 'muted'}>{value.length}/{max}</span> : null}
        {lockButton(path)}
      </div>
    );
    if (kind === 'enum')
      return (
        <label className="field" key={path}>
          {label}
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">(pack default)</option>
            {enumValues(schema).map((o) => (
              <option key={String(o)}>{String(o)}</option>
            ))}
          </select>
        </label>
      );
    if (kind === 'number')
      return (
        <label className="field" key={path}>
          {label}
          <input type="number" value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
        </label>
      );
    if (kind === 'array') {
      const el = elementOf(schema);
      const list = (value as unknown[]) ?? [];
      const objectItems = kindOf(el) === 'object';
      return (
        <div className="field" key={path}>
          {label}
          {list.map((item, k) => (
            <div key={k} className="arr">
              {objectItems ? (
                Object.entries(shapeOf(el)).map(([sub, subSchema]) => (
                  <input key={sub} dir="auto" type={kindOf(subSchema) === 'number' ? 'number' : 'text'} value={String((item as Record<string, unknown>)[sub] ?? '')} placeholder={sub} onChange={(e) => onChange(list.map((x, j) => (j === k ? {...(x as object), [sub]: kindOf(subSchema) === 'number' ? Number(e.target.value) : e.target.value} : x)))} />
                ))
              ) : kindOf(el) === 'enum' ? (
                <select value={String(item)} onChange={(e) => onChange(list.map((x, j) => (j === k ? e.target.value : x)))}>
                  {enumValues(el).map((o) => (
                    <option key={String(o)}>{String(o)}</option>
                  ))}
                </select>
              ) : (
                <input dir="auto" value={String(item)} onChange={(e) => onChange(list.map((x, j) => (j === k ? e.target.value : x)))} />
              )}
              <button className="ghost" onClick={() => onChange(list.filter((_, j) => j !== k))}>
                ✕
              </button>
            </div>
          ))}
          <button className="ghost" onClick={() => onChange([...list, objectItems ? {label: '…', value: 1} : kindOf(el) === 'enum' ? enumValues(el)[0] : '…'])}>
            + add
          </button>
        </div>
      );
    }
    const long = (max ?? 0) > 60 || name === 'voiceover' || name.endsWith('Prompt');
    const hint = describe(schema);
    return (
      <label className="field" key={path}>
        {label}
        {long ? <textarea dir="auto" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /> : <input dir="auto" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />}
        {hint && name !== 'duration' ? <small className="muted">{hint}</small> : null}
      </label>
    );
  };

  // Timeline: drag a block's edge to change that scene's duration (and lock it).
  const startResize = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const bar = (e.currentTarget.closest('.timeline') as HTMLElement).getBoundingClientRect();
    const framesPerPx = (total + TRANSITION * (props.scenes.length - 1)) / bar.width; // blocks are sized by full scene durations
    const x0 = e.clientX;
    const d0 = props.scenes[i].duration;
    change({...props}, `/scenes/${i}/duration`); // one undo point for the whole drag, duration locked
    const onMove = (ev: PointerEvent) => {
      const d = Math.max(30, Math.min(900, Math.round(d0 + (ev.clientX - x0) * framesPerPx)));
      setHistory((h) => h.map((en, k) => (k === h.length - 1 ? {...en, props: {...en.props, scenes: en.props.scenes.map((s, j) => (j === i ? {...s, duration: d} : s))}} : en)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const current = job?.versions.find((x) => x.v === v);
  const color = (c: 'background' | 'surface' | 'primary' | 'accent' | 'text' | 'muted', value: string) => change({...props, theme: {...props.theme, colors: {...props.theme.colors, [c]: value}}});
  return (
    <div className="app">
      <header>
        <b>Motion Editor</b>
        <span className="muted">
          {job?.client} · {jobId}
        </span>
        <select value={v} onChange={(e) => (cursor === 0 || confirm('Discard unsaved changes and open this version?') ? load(Number(e.target.value)) : undefined)}>
          {job?.versions.map((x) => (
            <option key={x.v} value={x.v}>
              v{x.v}
            </option>
          ))}
        </select>
        <button className="ghost" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)} title="Undo (⌘Z)">
          ↶
        </button>
        <button className="ghost" disabled={cursor >= history.length - 1} onClick={() => setCursor(cursor + 1)} title="Redo (⇧⌘Z)">
          ↷
        </button>
        <span className="grow" />
        {current?.review ? (
          <a href={`/files/${jobId}/${current.review}`} target="_blank" rel="noreferrer">
            review
          </a>
        ) : null}
        {current
          ? Object.entries(current.videos).map(([f, file]) => (
              <a key={f} href={`/files/${jobId}/${file}`} target="_blank" rel="noreferrer">
                mp4 {f}
              </a>
            ))
          : null}
        <button disabled={busy || !validation?.success || cursor === 0} onClick={save}>
          Save as new version
        </button>
        <button className="ghost" disabled={busy} onClick={render}>
          Render mp4
        </button>
        <a href="/">dashboard</a>
      </header>
      {status ? (
        <div className="status" dir="auto">
          {status}
        </div>
      ) : null}
      {validation && !validation.success ? (
        <div className="status bad" dir="auto">
          {validation.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join(' · ')}
        </div>
      ) : null}
      <main>
        <aside className="scenes">
          {props.scenes.map((s, i) => (
            <div key={i} className={`scene ${i === sel ? 'sel' : ''}`} draggable onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dragFrom !== null && move(dragFrom, i)} onClick={() => seek(i)}>
              <span className="handle">⋮⋮</span>
              <span className="num">{i + 1}</span>
              <span className="type">{s.type}</span>
              <span className="muted">{(s.duration / 30).toFixed(1)}s</span>
              <span className="grow" />
              <button className="ghost" title="Duplicate" onClick={(e) => (e.stopPropagation(), duplicate(i))}>
                ⧉
              </button>
              <button className="ghost" title="Delete" onClick={(e) => (e.stopPropagation(), remove(i))}>
                ✕
              </button>
            </div>
          ))}
          <select value="" onChange={(e) => e.target.value && add(e.target.value)}>
            <option value="">+ add scene…</option>
            {sceneTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </aside>
        <section className="stage">
          {/* The Player computes its layout in LTR; the video content sets its own direction. */}
          <div className="player" dir="ltr" style={{aspectRatio: `${width} / ${height}`}}>
            <Player ref={player} component={SceneEngine} inputProps={previewProps!} durationInFrames={total} fps={30} compositionWidth={width} compositionHeight={height} style={{width: '100%', height: '100%'}} controls acknowledgeRemotionLicense />
          </div>
          <div className="timeline" dir="ltr">
            {props.scenes.map((s, i) => (
              <div key={i} className={`block ${i === sel ? 'sel' : ''}`} style={{flexGrow: s.duration}} onClick={() => seek(i)}>
                <span>
                  {i + 1}. {s.type}
                </span>
                {locks.includes(`/scenes/${i}/duration`) ? <span className="lockmark">🔒</span> : null}
                <div className="edge" onPointerDown={(e) => startResize(i, e)} title="Drag to change duration" />
              </div>
            ))}
          </div>
        </section>
        <aside className="inspector">
          <div className="tabs">
            <button className={tab === 'scene' ? '' : 'ghost'} onClick={() => setTab('scene')}>
              Scene {sel + 1}
            </button>
            <button className={tab === 'video' ? '' : 'ghost'} onClick={() => setTab('video')}>
              Video & brand
            </button>
          </div>
          {tab === 'scene' && scene ? (
            <>
              <div className="ai">
                <textarea dir="auto" placeholder="AI: how should this scene change? (e.g. make the title punchier, use a number from the facts)" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                <button disabled={busy || !instruction.trim()} onClick={rewrite}>
                  Rewrite scene with AI
                </button>
              </div>
              {Object.entries(shapeFor(scene.type))
                .filter(([k]) => !HIDDEN.has(k))
                .map(([k, f]) => field(k, f, (scene as Record<string, unknown>)[k], (val) => setScene(sel, {[k]: val}, k), `/scenes/${sel}/${k}`))}
            </>
          ) : null}
          {tab === 'video' ? (
            <>
              <label className="field">
                <div className="label">style pack</div>
                <select value={props.style} onChange={(e) => change({...props, style: e.target.value as VideoProps['style']})}>
                  {packIds.map((p) => (
                    <option key={p} value={p}>
                      {packs[p].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <div className="label">format</div>
                <select value={props.format} onChange={(e) => change({...props, format: e.target.value as VideoProps['format']})}>
                  {Object.keys(formats).map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              {(['background', 'surface', 'primary', 'accent', 'text', 'muted'] as const).map((c) => (
                <label key={c} className="field row">
                  {/^#[0-9a-f]{6}$/i.test(props.theme.colors[c]) ? <input type="color" value={props.theme.colors[c]} onChange={(e) => color(c, e.target.value)} /> : null}
                  <input value={props.theme.colors[c]} onChange={(e) => color(c, e.target.value)} />
                  <span className="muted">{c}</span>
                </label>
              ))}
              <label className="field">
                <div className="label">body font</div>
                <select value={props.theme.font} onChange={(e) => change({...props, theme: {...props.theme, font: e.target.value as VideoProps['theme']['font']}})}>
                  {fontNames.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <div className="label">title font</div>
                <select value={props.theme.displayFont} onChange={(e) => change({...props, theme: {...props.theme, displayFont: e.target.value as VideoProps['theme']['displayFont']}})}>
                  {displayFonts.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <div className="label">glow {props.theme.glow.toFixed(2)}</div>
                <input type="range" min={0} max={1} step={0.05} value={props.theme.glow} onChange={(e) => change({...props, theme: {...props.theme, glow: Number(e.target.value)}})} />
              </label>
              <label className="field">
                <div className="label">motion speed {props.theme.motion.speed.toFixed(2)}</div>
                <input type="range" min={0.5} max={2} step={0.05} value={props.theme.motion.speed} onChange={(e) => change({...props, theme: {...props.theme, motion: {...props.theme.motion, speed: Number(e.target.value)}}})} />
              </label>
              <label className="field">
                <div className="label">music volume {props.musicVolume.toFixed(2)}</div>
                <input type="range" min={0} max={1} step={0.05} value={props.musicVolume} onChange={(e) => change({...props, musicVolume: Number(e.target.value)})} />
              </label>
              <label className="field row">
                <input type="checkbox" checked={props.showCaptions} onChange={(e) => change({...props, showCaptions: e.target.checked})} /> captions
              </label>
              <label className="field row">
                <input type="checkbox" checked={props.sfx} onChange={(e) => change({...props, sfx: e.target.checked})} /> transition SFX
              </label>
              <p className="muted">
                Per-scene camera ({cameraModes.join(', ')}) and background ({backgroundNames.join(', ')}) are in each scene's fields.
              </p>
            </>
          ) : null}
        </aside>
      </main>
    </div>
  );
};
