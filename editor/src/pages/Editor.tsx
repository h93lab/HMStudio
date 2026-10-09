import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import {ArrowLeft, Captions, Copy, Download, Eye, Loader2, Maximize, MoreVertical, Pause, Play, Plus, Redo2, Save, Share2, SkipBack, SkipForward, Sparkles, Trash2, Undo2} from 'lucide-react';
import {toast} from 'sonner';
import {SceneEngine} from '../../../src/engine/SceneEngine';
import {FPS, TRANSITION, displayFonts, formats, sceneStarts, totalDuration, videoSchema, type Scene, type VideoProps} from '../../../src/schema';
import {packIds, packs} from '../../../src/design/packs';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {Field, Panel, SelectField, ThumbBadge} from '@/components/kit';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Textarea} from '@/components/ui/textarea';
import {ExportDialog} from '@/components/editor/ExportDialog';
import {FieldEditor} from '@/components/editor/FieldEditor';
import {Timeline} from '@/components/editor/Timeline';
import {HIDDEN, blank, moveLocks, sceneLabel, sceneTypes, shapeFor} from '@/components/editor/model';
import {useLoad} from '@/components/library/common';
import {api, type JobSummary} from '@/lib/api';
import {Link, navigate, useLocation} from '@/lib/router';
import {cn} from '@/lib/utils';

type RawJob = {id: string; client: string; hooks?: {text: string; technique: string; score: number}[]};
type Entry = {props: VideoProps; locks: string[]};

const clampForPreview = (p: VideoProps): VideoProps => ({...p, scenes: p.scenes.map((s) => ({...s, duration: Math.max(30, Math.min(900, Number(s.duration) || 30))}))});

export const EditorPage: React.FC<{params: Record<string, string>}> = ({params}) => {
  const id = params.id;
  const {query} = useLocation();
  const [raw, setRaw] = useState<RawJob | null>(null);
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [v, setV] = useState(0);
  const [error, setError] = useState('');
  // Undo history keeps props and locks together, so undoing a reorder also undoes its lock remapping.
  const [history, setHistory] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [feedback, setFeedback] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const player = useRef<PlayerRef>(null);
  const customStyles = useLoad(() => api.styles(), []);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const props = history[cursor]?.props;
  const customPack = !!(props as {pack?: unknown} | undefined)?.pack; // VideoProps.pack (custom style) is set by another agent in src/schema.ts
  const locks = history[cursor]?.locks ?? [];
  const dirty = cursor > 0;

  const refreshSummary = useCallback(() => api.job(id).then(setSummary, () => undefined), [id]);
  const load = useCallback(
    async (version?: number) => {
      try {
        const r = await fetch(`/api/jobs/${encodeURIComponent(id)}${version ? `?v=${version}` : ''}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Could not load this project');
        setRaw(data.job);
        setV(data.v);
        setHistory([{props: data.props, locks: data.locks ?? []}]);
        setCursor(0);
        setSel(0);
        refreshSummary();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [id, refreshSummary],
  );
  useEffect(() => {
    load(Number(query.get('v')) || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const change = (next: VideoProps, lockPath?: string, nextLocks?: string[]) => {
    const l = nextLocks ?? (lockPath && !locks.includes(lockPath) ? [...locks, lockPath] : locks);
    setHistory((h) => [...h.slice(0, cursor + 1), {props: next, locks: l}].slice(-100));
    setCursor((c) => Math.min(c + 1, 99));
  };
  const setLocks = (next: string[]) => setHistory((h) => h.map((e, k) => (k === cursor ? {...e, locks: next} : e)));
  const setScene = (i: number, patch: Record<string, unknown>, key?: string) => change({...props!, scenes: props!.scenes.map((s, k) => (k === i ? ({...s, ...patch} as Scene) : s))}, key ? `/scenes/${i}/${key}` : undefined);

  const validation = useMemo(() => (props ? videoSchema.safeParse(props) : null), [props]);
  const preview = useMemo(() => (props ? clampForPreview(props) : null), [props]);
  const starts = useMemo(() => (preview ? sceneStarts(preview.scenes) : []), [preview]);
  const total = preview ? Math.max(1, totalDuration(preview.scenes)) : 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) setCursor((c) => Math.max(0, c - 1));
      if ((key === 'z' && e.shiftKey) || key === 'y') setCursor((c) => Math.min(history.length - 1, c + 1));
      if (key === 's') {
        e.preventDefault();
        document.getElementById('save-version')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history.length]);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: {detail: {frame: number}}) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener('frameupdate', onFrame);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    return () => {
      p.removeEventListener('frameupdate', onFrame);
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
    };
  }, [preview !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (error) return <Centered>{error}</Centered>;
  if (!props || !preview) return <Centered><Loader2 className="animate-spin" /> Loading project…</Centered>;

  const {width, height} = formats[props.format];
  const scene = props.scenes[sel];
  const version = summary?.versions.find((x) => x.v === v);
  const stills = version?.stills ?? [];
  const seek = (i: number) => {
    setSel(i);
    player.current?.seekTo(starts[i] + 20);
  };
  const sceneAt = (f: number) => {
    let i = starts.length - 1;
    while (i > 0 && f < starts[i]) i--;
    return i;
  };

  const save = async () => {
    setBusy('Saving: voicing changed lines and rendering previews…');
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(id)}/save`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({props, locks, note: 'editor'})});
      const data = await r.json().catch(() => ({error: r.statusText}));
      if (!r.ok) throw new Error(data.error);
      toast.success(`Saved as v${data.v}`, {description: data.notes?.slice(0, 2).join(' · ')});
      setV(data.v);
      setHistory([{props: data.props, locks}]);
      setCursor(0);
      refreshSummary();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const rewrite = async (text = instruction, index = sel) => {
    if (!text.trim()) return;
    setBusy(`AI is rewriting scene ${index + 1}…`);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(id)}/rewrite`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({props, index, instruction: text, locks})});
      const data = await r.json().catch(() => ({error: r.statusText}));
      if (!r.ok) throw new Error(data.error);
      change({...props, scenes: props.scenes.map((s, k) => (k === index ? (data.scene as Scene) : s))});
      toast.success(`Scene ${index + 1} rewritten`, {description: 'Locked fields kept. Save to voice it.'});
      setInstruction('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const revise = async () => {
    if (!feedback.trim()) return;
    if (dirty && !confirm('Unsaved edits will be dropped: the AI revises the last saved version. Continue?')) return;
    setBusy('AI is revising the whole video…');
    try {
      const {run} = await api.revise(id, feedback);
      setFeedback('');
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        if (!alive.current) return;
        const r = await api.run(run);
        setBusy(`Revising: ${r.step}`);
        if (r.status === 'done') break;
        if (r.status === 'failed' || r.status === 'cancelled') throw new Error(`Revision ${r.status}: ${r.step}`);
      }
      toast.success('Revision ready');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
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

  // Drag a timeline block's edge: one undo step for the whole drag, duration gets locked.
  const startResize = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const bar = (e.currentTarget.parentElement!.parentElement as HTMLElement).getBoundingClientRect();
    const framesPerPx = props.scenes.reduce((a, s) => a + s.duration, 0) / bar.width;
    const x0 = e.clientX;
    const d0 = props.scenes[i].duration;
    change({...props}, `/scenes/${i}/duration`);
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

  const theme = (patch: Partial<VideoProps['theme']>) => change({...props, theme: {...props.theme, ...patch}});
  const openVersion = (next: number) => {
    if (dirty && !confirm('Discard unsaved changes and open this version?')) return;
    navigate(`/edit/${id}?v=${next}`, true);
    load(next);
  };
  const copyReview = () => summary && navigator.clipboard.writeText(location.origin + summary.reviewUrl).then(() => toast.success('Review link copied'), () => toast.error('Could not copy'));
  const look = [
    {label: 'Glow', value: props.theme.glow, min: 0, max: 1, set: (x: number) => theme({glow: x})},
    {label: 'Motion', value: props.theme.motion.speed, min: 0.5, max: 2, set: (x: number) => theme({motion: {...props.theme.motion, speed: x}})},
    {label: 'Music vol', value: props.musicVolume, min: 0, max: 1, set: (x: number) => change({...props, musicVolume: x})},
  ];

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <IconTip label="Back to projects">
          <Button asChild variant="outline" size="icon" aria-label="Back to projects">
            <Link href="/">
              <ArrowLeft />
            </Link>
          </Button>
        </IconTip>
        <div className="flex h-9 items-center rounded-md border">
          <IconTip label="Undo (⌘Z)">
            <Button variant="ghost" size="icon" aria-label="Undo" className="rounded-e-none" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)}>
              <Undo2 />
            </Button>
          </IconTip>
          <IconTip label="Redo (⇧⌘Z)">
            <Button variant="ghost" size="icon" aria-label="Redo" className="rounded-none" disabled={cursor >= history.length - 1} onClick={() => setCursor(cursor + 1)}>
              <Redo2 />
            </Button>
          </IconTip>
          <IconTip label={props.showCaptions ? 'Hide captions' : 'Show captions'}>
            <Button variant="ghost" size="icon" aria-label={props.showCaptions ? 'Hide captions' : 'Show captions'} className={cn('rounded-s-none', props.showCaptions && 'text-primary')} onClick={() => change({...props, showCaptions: !props.showCaptions})}>
              <Captions />
            </Button>
          </IconTip>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span dir="auto" className="truncate font-title text-sm">
            {summary?.clientName ?? raw?.client}
          </span>
          <SelectField
            id="version"
            size="sm"
            className="w-auto"
            value={String(v)}
            onChange={(x) => openVersion(Number(x))}
            options={(summary?.versions ?? [{v, variant: undefined}]).map((x) => ({value: String(x.v), label: `v${x.v}${x.variant ? ' · A/B' : ''}${summary?.winner === x.v ? ' · winner' : ''}`}))}
          />
          {dirty ? (
            <Badge variant="outline" className="border-primary/40 text-primary">
              Unsaved
            </Badge>
          ) : null}
        </div>
        {summary?.reviewUrl ? (
          <Button variant="outline" asChild>
            <a href={summary.reviewUrl} target="_blank" rel="noreferrer">
              <Eye /> Preview
            </a>
          </Button>
        ) : null}
        <Button variant="outline" onClick={copyReview} disabled={!summary}>
          <Share2 /> Share
        </Button>
        <Button id="save-version" variant={dirty ? 'default' : 'outline'} className={cn(dirty && 'font-title')} disabled={!!busy || !validation?.success || !dirty} onClick={save} title="Save as a new version (⌘S)">
          {busy?.startsWith('Saving') ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
        <Button className="font-title" disabled={!summary || !!busy} onClick={() => setExportOpen(true)}>
          <Download /> Export
        </Button>
      </header>

      {busy ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm" role="status" dir="auto">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> {busy}
        </div>
      ) : null}
      {validation && !validation.success ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert" dir="auto">
          {validation.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join(' · ')}
        </div>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside aria-label="AI tools and look" className="flex min-w-0 flex-col gap-4 lg:content-start">
          <Panel title="AI tools">
            <Tabs defaultValue="scene" className="gap-3">
              <TabsList className="w-full">
                <TabsTrigger value="scene">Scene</TabsTrigger>
                <TabsTrigger value="revise">Revise</TabsTrigger>
                <TabsTrigger value="hooks">Hooks</TabsTrigger>
              </TabsList>
              <TabsContent value="scene" className="flex flex-col gap-3">
                <Field label={`Instruction for scene ${sel + 1}`} htmlFor="ai-scene">
                  <Textarea id="ai-scene" dir="auto" rows={4} placeholder="e.g. make the title punchier, use a number from the site facts" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                </Field>
                <Button className="font-title" disabled={!!busy || !instruction.trim()} onClick={() => rewrite()}>
                  <Sparkles /> Generate now
                </Button>
              </TabsContent>
              <TabsContent value="revise" className="flex flex-col gap-3">
                <Field label="Feedback for the whole video (creates a new version)" htmlFor="ai-revise">
                  <Textarea id="ai-revise" dir="auto" rows={4} placeholder="e.g. shorter, more energetic, end with the website" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                </Field>
                <Button className="font-title" disabled={!!busy || !feedback.trim()} onClick={revise}>
                  <Sparkles /> Revise video
                </Button>
              </TabsContent>
              <TabsContent value="hooks" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {raw?.hooks?.length ? (
                  raw.hooks.map((h, k) => (
                    <button key={k} type="button" disabled={!!busy} onClick={() => rewrite(`Use exactly this opening hook as the main line: "${h.text}"`, 0)} className="flex flex-col gap-1 rounded-lg border p-3 text-start hover:border-primary disabled:opacity-50" title="Use as the opening line of scene 1">
                      <span dir="auto" className="text-sm">
                        {h.text}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        #{k + 1} · {h.technique} · {h.score.toFixed(2)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No hook tournament for this project (draft tier).</p>
                )}
              </TabsContent>
            </Tabs>
          </Panel>

          <Panel title="Style pack">
            <div className="flex flex-wrap gap-2">
              {packIds.map((p) => (
                <Button key={p} size="sm" variant={props.style === p && !customPack ? 'default' : 'outline'} onClick={() => change({...props, style: p, pack: undefined})}>
                  {packs[p].label}
                </Button>
              ))}
              {(customStyles.data ?? []).map((c) => (
                <Button key={c.id} size="sm" dir="auto" variant={props.style === c.id ? 'default' : 'outline'} onClick={() => change({...props, style: c.id, pack: c.pack})}>
                  {c.name}
                </Button>
              ))}
            </div>
          </Panel>

          <Panel title="Look & style">
            <div className="flex flex-col gap-3">
              <div className={LOOK_ROW}>
                <Label htmlFor="title-font" className={LOOK_LABEL}>
                  Title font
                </Label>
                <SelectField id="title-font" size="sm" className="col-span-2" value={props.theme.displayFont} onChange={(x) => theme({displayFont: x as VideoProps['theme']['displayFont']})} options={displayFonts.map((f) => ({value: f, label: f === 'none' ? 'Pack default' : f}))} />
              </div>
              <div className={LOOK_ROW}>
                <Label htmlFor="accent" className={LOOK_LABEL}>
                  Accent
                </Label>
                <input id="accent" type="color" value={/^#[0-9a-f]{6}$/i.test(props.theme.colors.accent) ? props.theme.colors.accent : '#ffffff'} onChange={(e) => theme({colors: {...props.theme.colors, accent: e.target.value}})} className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
                <span className={LOOK_VALUE + ' font-mono uppercase'}>{props.theme.colors.accent}</span>
              </div>
              {look.map((s) => (
                <div key={s.label} className={LOOK_ROW}>
                  <span className={LOOK_LABEL}>{s.label}</span>
                  <Slider aria-label={s.label} min={s.min} max={s.max} step={0.05} value={[s.value]} onValueChange={([x]) => s.set(x)} />
                  <span className={LOOK_VALUE}>{s.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Audio & captions">
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span>Captions</span>
                <Switch checked={props.showCaptions} onCheckedChange={(c) => change({...props, showCaptions: c})} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Transition SFX</span>
                <Switch checked={props.sfx} onCheckedChange={(c) => change({...props, sfx: c})} />
              </label>
              <span className="truncate text-xs text-muted-foreground">Music: {props.music ? props.music.split('/').pop() : 'none'}</span>
            </div>
          </Panel>
        </aside>

        <main className="order-first flex min-w-0 flex-col gap-4 lg:order-none lg:content-start">
          <Panel>
            {/* The Player lays out in LTR; the video content sets its own direction. */}
            <div className="mx-auto w-full overflow-hidden rounded-xl bg-black" dir="ltr" style={{aspectRatio: `${width} / ${height}`, maxHeight: '62vh', maxWidth: `calc(62vh * ${width / height})`}}>
              <Player ref={player} component={SceneEngine} inputProps={preview} durationInFrames={total} fps={FPS} compositionWidth={width} compositionHeight={height} style={{width: '100%', height: '100%'}} clickToPlay acknowledgeRemotionLicense />
            </div>
            <div className="flex items-center gap-2" dir="ltr">
              <div className="flex flex-1 justify-start">
                <Badge variant="outline">{props.format}</Badge>
              </div>
              <IconTip label="Previous scene">
                <Button variant="ghost" size="icon" aria-label="Previous scene" onClick={() => seek(Math.max(0, sceneAt(frame) - 1))}>
                  <SkipBack />
                </Button>
              </IconTip>
              <IconTip label={playing ? 'Pause' : 'Play'}>
                <Button size="icon" aria-label={playing ? 'Pause' : 'Play'} onClick={() => player.current?.toggle()}>
                  {playing ? <Pause /> : <Play />}
                </Button>
              </IconTip>
              <IconTip label="Next scene">
                <Button variant="ghost" size="icon" aria-label="Next scene" onClick={() => seek(Math.min(props.scenes.length - 1, sceneAt(frame) + 1))}>
                  <SkipForward />
                </Button>
              </IconTip>
              <div className="flex flex-1 items-center justify-end gap-2">
                <span className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
                  {(frame / FPS).toFixed(1)}s / {(total / FPS).toFixed(1)}s
                </span>
                <IconTip label="Fullscreen">
                  <Button variant="ghost" size="icon" aria-label="Fullscreen" onClick={() => player.current?.requestFullscreen()}>
                    <Maximize />
                  </Button>
                </IconTip>
              </div>
            </div>
          </Panel>
          <Timeline scenes={preview.scenes} starts={starts} sel={sel} frame={frame} stills={stills} locks={locks} music={!!props.music} onSelect={seek} onSeek={(f) => player.current?.seekTo(f)} onResizeStart={startResize} />
          <p className="text-xs text-muted-foreground">Cross-fades overlap scenes by {(TRANSITION / FPS).toFixed(1)}s. Drag a block's right edge to change its length; edited fields are locked so AI revisions keep them.</p>
        </main>

        <aside aria-label="Project media and inspector" className="flex min-w-0 flex-col gap-4 lg:content-start">
          <Panel title="Project media" meta={`${props.scenes.length} scenes · ${(total / FPS).toFixed(0)}s`}>
            <div className="grid grid-cols-4 gap-2">
              {props.scenes.map((s, i) => (
                <div key={i} draggable onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dragFrom !== null && move(dragFrom, i)} className={cn('group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-lg bg-field ring-2 transition-shadow', i === sel ? 'ring-primary' : 'ring-transparent hover:ring-border')} onClick={() => seek(i)} role="button" tabIndex={0} aria-label={`Scene ${i + 1}: ${s.type}`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), seek(i))} title={`${i + 1}. ${s.type} · drag to reorder`}>
                  {stills[i] ? <img src={stills[i]} alt={sceneLabel(s)} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[11px] text-muted-foreground">{s.type}</span>}
                  <ThumbBadge className="absolute start-1 top-1">{i + 1}</ThumbBadge>
                  <ThumbBadge className="absolute end-1 bottom-1">{(s.duration / FPS).toFixed(1)}s</ThumbBadge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" aria-label={`Scene ${i + 1} actions`} onClick={(e) => e.stopPropagation()} className="absolute end-1 top-1 bg-black/65 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:bg-black/80 hover:text-white">
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => duplicate(i)}>
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" disabled={props.scenes.length <= 1} onClick={() => remove(i)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Add scene" className="grid aspect-[3/4] place-items-center rounded-lg border border-dashed bg-field/40 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
                    <Plus className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  {sceneTypes.map((t) => (
                    <DropdownMenuItem key={t} onClick={() => add(t)}>
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Panel>

          {scene ? (
            <Panel title={`Scene ${sel + 1} · ${scene.type}`} meta={`${(scene.duration / FPS).toFixed(1)}s`}>
              <div className="flex flex-col gap-3">
                {Object.entries(shapeFor(scene.type))
                  .filter(([k]) => !HIDDEN.has(k))
                  .map(([k, f]) => {
                    const path = `/scenes/${sel}/${k}`;
                    const locked = locks.includes(path);
                    return <FieldEditor key={`${sel}-${k}`} name={k} schema={f} value={(scene as Record<string, unknown>)[k]} onChange={(val) => setScene(sel, {[k]: val}, k)} locked={locked} onToggleLock={() => setLocks(locked ? locks.filter((l) => l !== path) : [...locks, path])} />;
                  })}
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>

      {summary ? <ExportDialog open={exportOpen} onOpenChange={setExportOpen} job={summary} v={v} dirty={dirty} onDone={refreshSummary} /> : null}
    </div>
  );
};

// Look & style rows: fixed label column, flexible control, fixed right-aligned value column.
const LOOK_ROW = 'grid grid-cols-[72px_minmax(0,1fr)_44px] items-center gap-2';
const LOOK_LABEL = 'text-xs font-normal text-muted-foreground';
const LOOK_VALUE = 'text-end text-xs text-muted-foreground tabular-nums';

const IconTip: React.FC<{label: string; children: React.ReactElement}> = ({label, children}) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

const Centered: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="grid min-h-[60vh] place-items-center">
    <div className="flex items-center gap-2 text-muted-foreground" dir="auto">
      {children}
    </div>
  </div>
);
