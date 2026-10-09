import {useEffect, useState} from 'react';
import {Loader2, Sparkles} from 'lucide-react';
import {toast} from 'sonner';
import {AppShell} from '@/components/AppShell';
import {AssetPicker} from '@/components/studio/AssetPicker';
import {Field, FORMATS, LogView, SimpleSelect, StatusDot, statusText} from '@/components/studio/bits';
import {errMsg, usePoll} from '@/components/studio/usePoll';
import {Button} from '@/components/ui/button';
import {Progress} from '@/components/ui/progress';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {Textarea} from '@/components/ui/textarea';
import {api, type ClientProfile, type Dialect, type Format, type MakeRequest, type Tier} from '@/lib/api';
import {Link, navigate} from '@/lib/router';
import {cn} from '@/lib/utils';

const DIALECTS: {value: Dialect; label: string}[] = [
  {value: 'egyptian', label: 'Egyptian'},
  {value: 'msa', label: 'MSA'},
  {value: 'gulf', label: 'Gulf'},
  {value: 'levantine', label: 'Levantine'},
];
const TIERS: {value: Tier; label: string; hint: string}[] = [
  {value: 'draft', label: 'Draft', hint: 'Fast preview, lowest cost'},
  {value: 'standard', label: 'Standard', hint: 'Balanced quality for most videos'},
  {value: 'premium', label: 'Premium', hint: 'Best models and extra checks'},
];

export const CreatePage: React.FC<{params: Record<string, string>}> = ({params}) => (
  <AppShell>{params.run ? <RunView id={params.run} /> : <CreateForm />}</AppShell>
);

type Form = {idea: string; client: string; format: Format; dialect: Dialect; seconds: number; tier: Tier; style: string; music: string; gender: 'male' | 'female'; voice: string; url: string; brandTheme: boolean; template: string; variants: number; draft: boolean; qaFix: boolean; screens: string[]; clips: string[]; logo: string[]};
const INITIAL: Form = {idea: '', client: '', format: '9:16', dialect: 'egyptian', seconds: 30, tier: 'standard', style: '', music: '', gender: 'male', voice: '', url: '', brandTheme: false, template: '', variants: 1, draft: false, qaFix: true, screens: [], clips: [], logo: []};

const CreateForm: React.FC = () => {
  const {data: clients, error: clientsError} = usePoll(api.clients, null);
  const {data: options} = usePoll(api.options, null);
  const {data: templates} = usePoll(api.templates, null);
  const [f, setF] = useState<Form>(INITIAL);
  const [busy, setBusy] = useState(false);
  const {data: assets} = usePoll(() => (f.client ? api.assets(f.client) : Promise.resolve([])), null, [f.client]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({...p, [k]: v}));

  const pickClient = (id: string) => {
    const d = (clients?.find((c) => c.id === id) as ClientProfile | undefined)?.defaults ?? {};
    setF((p) => ({...p, client: id, screens: [], clips: [], logo: [], style: d.style ?? p.style, music: d.music ?? p.music, voice: d.voice ?? p.voice, dialect: d.dialect ?? p.dialect, format: d.format ?? p.format, url: d.url ?? p.url}));
  };
  useEffect(() => {
    if (clients && !f.client && clients.filter((c) => !c.archived).length === 1) pickClient(clients.find((c) => !c.archived)!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.idea.trim()) return toast.error('Write the idea first');
    if (!f.client) return toast.error('Choose a client');
    const body: MakeRequest = {
      idea: f.idea.trim(), client: f.client, format: f.format, dialect: f.dialect, seconds: f.seconds, tier: f.tier, gender: f.gender, ...(f.variants > 1 ? {variants: f.variants} : {}), draft: f.draft, qaFix: f.qaFix,
      style: f.style || undefined, music: f.music || undefined, voice: f.voice || undefined, template: f.template || undefined,
      url: f.url.trim() || undefined, brandTheme: f.url.trim() ? f.brandTheme : undefined,
      screens: f.screens.length ? f.screens : undefined, clips: f.clips.length ? f.clips : undefined, logo: f.logo[0],
    };
    setBusy(true);
    try {
      const {run} = await api.make(body);
      navigate(`/new/${run}`);
    } catch (err) {
      toast.error(errMsg(err));
      setBusy(false);
    }
  };

  const usable = (clients ?? []).filter((c) => !c.archived);
  const byKind = (...k: string[]) => (assets ?? []).filter((a) => k.includes(a.kind));

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <h1 className="font-title text-2xl">New video</h1>
        {clientsError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Could not load clients: {clientsError}
          </p>
        )}
        <Field label="Idea" htmlFor="idea">
          <Textarea id="idea" dir="auto" required rows={4} value={f.idea} onChange={(e) => set('idea', e.target.value)} placeholder="What is the video about, and for whom?" className="bg-[#141415]" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Client" htmlFor="client">
            {clients ? <SimpleSelect id="client" value={f.client} onChange={pickClient} emptyLabel="Choose a client" options={usable.map((c) => ({value: c.id, label: c.theme.client || c.id}))} /> : <Skeleton className="h-9" />}
          </Field>
          <Field label="Format" htmlFor="format">
            <SimpleSelect id="format" value={f.format} onChange={(v) => set('format', v as Format)} options={(options?.formats ?? FORMATS).map((x) => ({value: x, label: x}))} />
          </Field>
          <Field label="Dialect" htmlFor="dialect">
            <SimpleSelect id="dialect" value={f.dialect} onChange={(v) => set('dialect', v as Dialect)} options={DIALECTS} />
          </Field>
          <Field label="Style" htmlFor="style">
            <SimpleSelect id="style" value={f.style} onChange={(v) => set('style', v)} emptyLabel="Director picks" options={(options?.styles ?? []).map((s) => ({value: s.id, label: s.label}))} />
          </Field>
          <Field label="Music" htmlFor="music">
            <SimpleSelect id="music" value={f.music} onChange={(v) => set('music', v)} emptyLabel="Director picks" options={(options?.music ?? []).map((m) => ({value: m, label: m}))} />
          </Field>
          <Field label="Template" htmlFor="template">
            <SimpleSelect id="template" value={f.template} onChange={(v) => set('template', v)} emptyLabel="None (free structure)" options={(templates ?? []).map((t) => ({value: t.id, label: t.name}))} />
          </Field>
          <Field label="Narrator" htmlFor="gender">
            <SimpleSelect id="gender" value={f.gender} onChange={(v) => set('gender', v as 'male' | 'female')} options={[{value: 'male', label: 'Male'}, {value: 'female', label: 'Female'}]} />
          </Field>
          <Field label="Specific voice" htmlFor="voice" className="lg:col-span-2">
            <SimpleSelect id="voice" value={f.voice} onChange={(v) => set('voice', v)} emptyLabel="Auto (by narrator and dialect)" options={(options?.voices ?? []).map((v) => ({value: v, label: v}))} />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span id="secs-label">Length</span>
            <span className="font-semibold text-primary">{f.seconds}s</span>
          </div>
          <Slider aria-labelledby="secs-label" min={10} max={90} step={5} value={[f.seconds]} onValueChange={([v]) => set('seconds', v)} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">Quality</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Quality">
            {TIERS.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={f.tier === t.value} onClick={() => set('tier', t.value)} className={cn('rounded-xl border bg-card p-3 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', f.tier === t.value && 'border-primary bg-primary/10')}>
                <span className={cn('block text-sm font-semibold', f.tier === t.value && 'text-primary')}>{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Client website (optional): facts, logo, colors" htmlFor="url">
            <Input id="url" type="url" inputMode="url" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" className="bg-[#141415]" />
          </Field>
          <div className="flex items-end gap-2 pb-2">
            <Switch id="brand" checked={f.brandTheme} disabled={!f.url.trim()} onCheckedChange={(v) => set('brandTheme', v)} />
            <label htmlFor="brand" className="text-sm">
              Use brand colors
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 sm:col-span-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span id="var-label">A/B variants</span>
              <span className="font-semibold text-primary">{f.variants}</span>
            </div>
            <Slider aria-labelledby="var-label" min={1} max={5} step={1} value={[f.variants]} onValueChange={([v]) => set('variants', v)} />
          </div>
          <Toggle id="draft" label="Draft render (faster)" checked={f.draft} onChange={(v) => set('draft', v)} />
          <Toggle id="qafix" label="Auto-fix QA issues" checked={f.qaFix} onChange={(v) => set('qaFix', v)} />
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-label="Assets">
          <h2 className="font-title text-sm text-muted-foreground">Assets from the library</h2>
          {!f.client ? <p className="text-xs text-muted-foreground">Choose a client to pick its screens, clips and logo.</p> : !assets ? <Skeleton className="h-16" /> : (
            <>
              <p className="text-xs text-muted-foreground">Screens</p>
              <AssetPicker label="Screens" assets={byKind('screenshot', 'image')} selected={f.screens} onChange={(v) => set('screens', v)} />
              <p className="text-xs text-muted-foreground">Clips</p>
              <AssetPicker label="Clips" assets={byKind('clip')} selected={f.clips} onChange={(v) => set('clips', v)} />
              <p className="text-xs text-muted-foreground">Logo</p>
              <AssetPicker label="Logos" single assets={byKind('logo')} selected={f.logo} onChange={(v) => set('logo', v)} />
            </>
          )}
        </section>

        <Button type="submit" size="lg" className="font-title self-start" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate
        </Button>
      </form>
    </main>
  );
};

const Toggle: React.FC<{id: string; label: string; checked: boolean; onChange: (v: boolean) => void}> = ({id, label, checked, onChange}) => (
  <div className="flex items-center gap-2">
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
    <label htmlFor={id} className="text-sm">
      {label}
    </label>
  </div>
);

const RunView: React.FC<{id: string}> = ({id}) => {
  const [ms, setMs] = useState<number | null>(2000);
  const {data: run, error, loading} = usePoll(async () => {
    const r = await api.run(id);
    setMs(r.status === 'running' || r.status === 'waiting' ? 2000 : null);
    return r;
  }, ms, [id]);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      const {run: next} = await api.retryRun(id);
      navigate(`/new/${next}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setRetrying(false);
  };

  if (error && !run) return <p role="alert" className="m-6 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Could not load this run: {error}</p>;
  if (loading && !run) return <div className="mx-auto w-full max-w-3xl p-6"><Skeleton className="h-64 rounded-2xl" /></div>;
  if (!run) return null;
  const live = run.status === 'running' || run.status === 'waiting';

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusDot status={run.status} />
        <h1 dir="auto" className="font-title min-w-0 flex-1 truncate text-xl">
          {run.label}
        </h1>
        <span className={cn('text-xs font-bold uppercase', statusText(run.status))}>{run.status}</span>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-label="Progress">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{live ? 'Creating your video' : run.status === 'done' ? 'Finished' : 'Stopped'}</span>
          <span className="font-semibold text-primary">{run.status === 'done' ? 100 : Math.round(run.progress * 100)}%</span>
        </div>
        <Progress value={run.status === 'done' ? 100 : Math.round(run.progress * 100)} className="bg-track" />
        <p dir="auto" className={cn('text-sm break-words', run.status === 'failed' && 'text-destructive')}>
          {run.status === 'failed' ? `Failed at: ${run.step}` : run.step}
        </p>
        {live && <p className="text-xs text-muted-foreground">This may take a few minutes. You can leave this page; the run continues in the <Link href="/queue" className="underline">Queue</Link>.</p>}
        <div className="flex flex-wrap gap-2">
          {run.status === 'done' && run.jobId && (
            <>
              <Button className="font-title" onClick={() => navigate(`/edit/${run.jobId}`)}>
                Open editor
              </Button>
              <Button variant="outline" onClick={() => navigate(`/compare/${run.jobId}`)}>
                Compare A/B
              </Button>
            </>
          )}
          {(run.status === 'failed' || run.status === 'cancelled') && (
            <Button className="font-title" disabled={retrying} onClick={() => void retry()}>
              {retrying && <Loader2 className="animate-spin" />} Retry
            </Button>
          )}
          {live && (
            <Button variant="outline" onClick={() => void api.cancelRun(id).catch((e) => toast.error(errMsg(e)))}>
              Cancel
            </Button>
          )}
        </div>
      </section>
      <LogView log={run.log} className="max-h-96 min-h-48" />
    </main>
  );
};
