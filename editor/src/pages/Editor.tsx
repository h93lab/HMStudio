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
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Textarea} from '@/components/ui/textarea';
import {ExportDialog} from '@/components/editor/ExportDialog';
import {FieldEditor} from '@/components/editor/FieldEditor';
import {Timeline} from '@/components/editor/Timeline';
import {HIDDEN, blank, moveLocks, sceneLabel, sceneTypes, shapeFor} from '@/components/editor/model';
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
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const props = history[cursor]?.props;
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
  const panel = 'rounded-xl border bg-panel p-3';

  return (
    <div className="flex min-h-full flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Button asChild size="icon" aria-label="Back to projects">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex rounded-lg border bg-panel">
          <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (⌘Z)" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={cursor >= history.length - 1} onClick={() => setCursor(cursor + 1)}>
            <Redo2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label={props.showCaptions ? 'Hide captions' : 'Show captions'} className={cn(props.showCaptions && 'text-primary')} onClick={() => change({...props, showCaptions: !props.showCaptions})}>
            <Captions />
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span dir="auto" className="truncate font-semibold">
            {summary?.clientName ?? raw?.client}
          </span>
          <Select value={String(v)} onValueChange={(x) => openVersion(Number(x))}>
            <SelectTrigger size="sm" aria-label="Version" className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(summary?.versions ?? [{v, variant: undefined}]).map((x) => (
                <SelectItem key={x.v} value={String(x.v)}>
                  v{x.v}
                  {x.variant ? ' · A/B' : ''}
                  {summary?.winner === x.v ? ' · winner' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dirty ? <span className="text-xs text-primary">Unsaved</span> : null}
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
        <Button id="save-version" variant={dirty ? 'default' : 'outline'} className="font-title" disabled={!!busy || !validation?.success || !dirty} onClick={save} title="Save as a new version (⌘S)">
          {busy?.startsWith('Saving') ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
        <Button className="font-title" disabled={!summary || !!busy} onClick={() => setExportOpen(true)}>
          <Download /> Export
        </Button>
      </header>

      {busy ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm" role="status" dir="auto">
          <Loader2 className="size-4 animate-spin text-primary" /> {busy}
        </div>
      ) : null}
      {validation && !validation.success ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" dir="auto">
          {validation.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join(' · ')}
        </div>
      ) : null}

      <div className="grid flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside aria-label="AI tools and look" className="grid content-start gap-3 lg:order-none">
          <div className={panel}>
            <h2 className="mb-2 font-title text-sm">AI tools</h2>
            <Tabs defaultValue="scene">
              <TabsList className="w-full">
                <TabsTrigger value="scene">Scene</TabsTrigger>
                <TabsTrigger value="revise">Revise</TabsTrigger>
                <TabsTrigger value="hooks">Hooks</TabsTrigger>
              </TabsList>
              <TabsContent value="scene" className="grid gap-2">
                <Label htmlFor="ai-scene" className="text-xs text-muted-foreground">
                  Instruction for scene {sel + 1}
                </Label>
                <Textarea id="ai-scene" dir="auto" rows={4} placeholder="e.g. make the title punchier, use a number from the site facts" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                <Button className="font-title" disabled={!!busy || !instruction.trim()} onClick={() => rewrite()}>
                  <Sparkles /> Generate now
                </Button>
              </TabsContent>
              <TabsContent value="revise" className="grid gap-2">
                <Label htmlFor="ai-revise" className="text-xs text-muted-foreground">
                  Feedback for the whole video (creates a new version)
                </Label>
                <Textarea id="ai-revise" dir="auto" rows={4} placeholder="e.g. shorter, more energetic, end with the website" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                <Button className="font-title" disabled={!!busy || !feedback.trim()} onClick={revise}>
                  <Sparkles /> Revise video
                </Button>
              </TabsContent>
              <TabsContent value="hooks" className="grid max-h-72 gap-2 overflow-y-auto">
                {raw?.hooks?.length ? (
                  raw.hooks.map((h, k) => (
                    <button key={k} type="button" disabled={!!busy} onClick={() => rewrite(`Use exactly this opening hook as the main line: "${h.text}"`, 0)} className="grid gap-1 rounded-lg border bg-card p-2 text-start hover:border-primary disabled:opacity-50" title="Use as the opening line of scene 1">
                      <span dir="auto" className="text-sm">
                        {h.text}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        #{k + 1} · {h.technique} · {h.score.toFixed(2)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No hook tournament for this project (draft tier).</p>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className={panel}>
            <h2 className="mb-2 font-title text-sm">Style pack</h2>
            <div className="flex flex-wrap gap-1.5">
              {packIds.map((p) => (
                <Button key={p} size="sm" variant={props.style === p ? 'default' : 'outline'} onClick={() => change({...props, style: p})}>
                  {packs[p].label}
                </Button>
              ))}
            </div>
          </div>

          <div className={cn(panel, 'grid gap-3')}>
            <h2 className="font-title text-sm">Look &amp; style</h2>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2 text-xs">
              <Label htmlFor="title-font" className="text-muted-foreground">
                Title font
              </Label>
              <Select value={props.theme.displayFont} onValueChange={(x) => theme({displayFont: x as VideoProps['theme']['displayFont']})}>
                <SelectTrigger id="title-font" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {displayFonts.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f === 'none' ? 'Pack default' : f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="accent" className="text-muted-foreground">
                Accent
              </Label>
              <div className="flex items-center gap-2">
                <input id="accent" type="color" value={/^#[0-9a-f]{6}$/i.test(props.theme.colors.accent) ? props.theme.colors.accent : '#ffffff'} onChange={(e) => theme({colors: {...props.theme.colors, accent: e.target.value}})} className="size-7 cursor-pointer rounded border-0 bg-transparent" />
                <span className="font-mono uppercase">{props.theme.colors.accent}</span>
              </div>
            </div>
            {look.map((s) => (
              <div key={s.label} className="grid grid-cols-[80px_minmax(0,1fr)_36px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{s.label}</span>
                <Slider aria-label={s.label} min={s.min} max={s.max} step={0.05} value={[s.value]} onValueChange={([x]) => s.set(x)} />
                <span className="text-end">{s.value.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className={cn(panel, 'grid gap-3 text-sm')}>
            <label className="flex items-center gap-2">
              <Switch checked={props.showCaptions} onCheckedChange={(c) => change({...props, showCaptions: c})} /> <span className="font-title text-xs">Captions</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={props.sfx} onCheckedChange={(c) => change({...props, sfx: c})} /> <span className="font-title text-xs">Transition SFX</span>
            </label>
            <span className="text-xs text-muted-foreground">Music: {props.music ? props.music.split('/').pop() : 'none'}</span>
          </div>
        </aside>

        <main className="grid min-w-0 content-start gap-3">
          <div className={cn(panel, 'grid gap-3')}>
            {/* The Player lays out in LTR; the video content sets its own direction. */}
            <div className="mx-auto w-full overflow-hidden rounded-lg bg-black" dir="ltr" style={{aspectRatio: `${width} / ${height}`, maxHeight: '62vh', maxWidth: `calc(62vh * ${width / height})`}}>
              <Player ref={player} component={SceneEngine} inputProps={preview} durationInFrames={total} fps={FPS} compositionWidth={width} compositionHeight={height} style={{width: '100%', height: '100%'}} clickToPlay acknowledgeRemotionLicense />
            </div>
            <div className="flex items-center gap-2" dir="ltr">
              <span className="rounded-md border px-2 py-1 text-xs">{props.format}</span>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" aria-label="Previous scene" onClick={() => seek(Math.max(0, sceneAt(frame) - 1))}>
                <SkipBack />
              </Button>
              <Button size="icon" aria-label={playing ? 'Pause' : 'Play'} className="rounded-full" onClick={() => player.current?.toggle()}>
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next scene" onClick={() => seek(Math.min(props.scenes.length - 1, sceneAt(frame) + 1))}>
                <SkipForward />
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {(frame / FPS).toFixed(1)}s / {(total / FPS).toFixed(1)}s
              </span>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" aria-label="Fullscreen" onClick={() => player.current?.requestFullscreen()}>
                <Maximize />
              </Button>
            </div>
          </div>
          <Timeline scenes={preview.scenes} starts={starts} sel={sel} frame={frame} stills={stills} locks={locks} music={!!props.music} onSelect={seek} onSeek={(f) => player.current?.seekTo(f)} onResizeStart={startResize} />
          <p className="text-xs text-muted-foreground">Cross-fades overlap scenes by {(TRANSITION / FPS).toFixed(1)}s. Drag a block's right edge to change its length; edited fields are locked so AI revisions keep them.</p>
        </main>

        <aside aria-label="Project media and inspector" className="grid content-start gap-3">
          <div className={panel}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-title text-sm">Project media</h2>
              <span className="text-xs text-muted-foreground">
                {props.scenes.length} scenes · {(total / FPS).toFixed(0)}s
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {props.scenes.map((s, i) => (
                <div key={i} draggable onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dragFrom !== null && move(dragFrom, i)} className={cn('group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-lg bg-card ring-2', i === sel ? 'ring-primary' : 'ring-transparent')} onClick={() => seek(i)} title={`${i + 1}. ${s.type} · drag to reorder`}>
                  {stills[i] ? <img src={stills[i]} alt={sceneLabel(s)} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10px] text-muted-foreground">{s.type}</span>}
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px]">{i + 1}</span>
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px]">{(s.duration / FPS).toFixed(1)}s</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={`Scene ${i + 1} actions`} onClick={(e) => e.stopPropagation()} className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100">
                        <MoreVertical className="size-3.5" />
                      </button>
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
                  <button type="button" aria-label="Add scene" className="grid aspect-[3/4] place-items-center rounded-lg border border-dashed text-muted-foreground hover:text-foreground">
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
          </div>

          {scene ? (
            <div className={cn(panel, 'grid gap-3')}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-title text-sm">
                  Scene {sel + 1} · {scene.type}
                </h2>
                <span className="text-xs text-muted-foreground">{(scene.duration / FPS).toFixed(1)}s</span>
              </div>
              {Object.entries(shapeFor(scene.type))
                .filter(([k]) => !HIDDEN.has(k))
                .map(([k, f]) => {
                  const path = `/scenes/${sel}/${k}`;
                  const locked = locks.includes(path);
                  return <FieldEditor key={`${sel}-${k}`} name={k} schema={f} value={(scene as Record<string, unknown>)[k]} onChange={(val) => setScene(sel, {[k]: val}, k)} locked={locked} onToggleLock={() => setLocks(locked ? locks.filter((l) => l !== path) : [...locks, path])} />;
                })}
            </div>
          ) : null}
        </aside>
      </div>

      {summary ? <ExportDialog open={exportOpen} onOpenChange={setExportOpen} job={summary} v={v} dirty={dirty} onDone={refreshSummary} /> : null}
    </div>
  );
};

const Centered: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="grid min-h-[60vh] place-items-center">
    <div className="flex items-center gap-2 text-muted-foreground" dir="auto">
      {children}
    </div>
  </div>
);
