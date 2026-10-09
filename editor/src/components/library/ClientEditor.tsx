import {useEffect, useState} from 'react';
import {Archive, ArchiveRestore, Copy, Save} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Slider} from '@/components/ui/slider';
import {Skeleton} from '@/components/ui/skeleton';
import {api, type ClientProfile, type Dialect, type Format, type Theme} from '@/lib/api';
import {displayFonts, fontNames} from '../../../../src/schema';
import {BrandPreview} from './BrandPreview';
import {COLOR_KEYS, validateTheme} from './brand';
import {errMsg, formatBytes, Pick, useLoad} from './common';
import {contrast, isHex, toInputHex} from './contrast';
import {DuplicateDialog} from './ClientDialogs';

type Draft = {theme: Theme; defaults: ClientProfile['defaults']};
const fromProfile = (p: ClientProfile): Draft => ({theme: p.theme, defaults: p.defaults ?? {}});

const Section: React.FC<{title: string; children: React.ReactNode}> = ({title, children}) => (
  <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
    <h2 className="font-title text-sm text-muted-foreground">{title}</h2>
    {children}
  </section>
);

const Ratio: React.FC<{label: string; a: string; b: string}> = ({label, a, b}) => {
  const r = contrast(a, b);
  if (r === null) return <span className="text-muted-foreground">{label}: n/a</span>;
  const ok = r >= 4.5;
  return (
    <span className={ok ? 'text-primary' : 'text-amber-400'}>
      {ok ? '✓' : '⚠'} {label} {r.toFixed(1)}:1
    </span>
  );
};

const SliderRow: React.FC<{label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void}> = ({label, value, min, max, step, onChange}) => (
  <div className="flex flex-col gap-2">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <Slider aria-label={label} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
  </div>
);

export const ClientEditor: React.FC<{profile: ClientProfile; onChanged: (nextId?: string) => void; onDirty: (dirty: boolean) => void}> = ({profile, onChanged, onDirty}) => {
  const [saved, setSaved] = useState<Draft>(() => fromProfile(profile));
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(false);
  const options = useLoad(() => api.options(), []);
  const logos = useLoad(() => api.assets(profile.id).then((a) => a.filter((x) => x.kind === 'logo')), [profile.id]);

  const serverData = JSON.stringify(fromProfile(profile));
  useEffect(() => {
    const next = JSON.parse(serverData) as Draft;
    setSaved(next);
    setDraft(next);
  }, [serverData]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const {theme, defaults} = draft;
  const setTheme = (patch: Partial<Theme>) => setDraft((d) => ({...d, theme: {...d.theme, ...patch}}));
  const setColor = (k: (typeof COLOR_KEYS)[number], v: string) => setDraft((d) => ({...d, theme: {...d.theme, colors: {...d.theme.colors, [k]: v}}}));
  const setDefault = (patch: Partial<Draft['defaults']>) => setDraft((d) => ({...d, defaults: {...d.defaults, ...patch}}));

  const save = async () => {
    const problem = validateTheme(theme);
    if (problem) return void toast.error(problem);
    setBusy(true);
    try {
      await api.saveClient(profile.id, draft);
      setSaved(draft);
      toast.success('Client saved');
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    try {
      await api.archiveClient(profile.id, !profile.archived);
      toast.success(profile.archived ? 'Client restored' : 'Client archived');
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const opts = options.data;
  const strOpts = (xs: string[]) => xs.map((x) => ({value: x, label: x}));
  const withAuto = (xs: {value: string; label: string}[]) => [{value: '', label: 'Auto (director picks)'}, ...xs];
  const dialects: Dialect[] = ['msa', 'egyptian', 'gulf', 'levantine'];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl text-xl font-extrabold" style={{background: theme.colors.primary, color: theme.colors.background}}>
          <span dir="auto">{(theme.client || profile.id)[0]?.toUpperCase()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Label htmlFor="client-name" className="sr-only">
            Client name
          </Label>
          <Input id="client-name" dir="auto" value={theme.client} onChange={(e) => setTheme({client: e.target.value})} className="h-9 text-base font-bold" />
          <div className="mt-1 text-xs text-muted-foreground">
            {profile.id} · {profile.videos} {profile.videos === 1 ? 'video' : 'videos'}
            {dirty && <span className="ms-2 text-amber-400">● Unsaved changes</span>}
          </div>
        </div>
        <Button variant="outline" onClick={archive}>
          {profile.archived ? <ArchiveRestore /> : <Archive />}
          {profile.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button variant="outline" onClick={() => setDup(true)}>
          <Copy /> Duplicate
        </Button>
        <Button className="font-title" onClick={save} disabled={busy || !dirty}>
          <Save /> {busy ? 'Saving…' : 'Save'}
        </Button>
      </section>

      <Section title="Brand colors">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_KEYS.map((k) => {
            const v = theme.colors[k];
            const bad = !isHex(v) && !(k === 'surface' && /^(rgba?|hsla?)\(/i.test(v.trim()));
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={`color-${k}`} className="text-xs capitalize text-muted-foreground">
                  {k}
                </Label>
                <div className="flex items-center gap-2">
                  {isHex(v) ? (
                    <input type="color" aria-label={`${k} color picker`} value={toInputHex(v)} onChange={(e) => setColor(k, e.target.value)} className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
                  ) : (
                    <span aria-hidden className="size-9 shrink-0 rounded-md border" style={{background: v}} />
                  )}
                  <Input id={`color-${k}`} value={v} onChange={(e) => setColor(k, e.target.value)} aria-invalid={bad} spellCheck={false} className="font-mono text-sm" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Ratio label="Text on background" a={theme.colors.text} b={theme.colors.background} />
          <Ratio label="Muted on background" a={theme.colors.muted} b={theme.colors.background} />
        </div>
      </Section>

      <Section title="Logo & type">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logo-path" className="text-xs text-muted-foreground">
            Logo path or URL (empty = text logo)
          </Label>
          <Input id="logo-path" value={theme.logo} onChange={(e) => setTheme({logo: e.target.value})} placeholder="clients/nova/logo.png" />
          {logos.loading ? (
            <Skeleton className="h-12 w-full" />
          ) : logos.data && logos.data.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Logo assets">
              {logos.data.map((a) => (
                <button key={a.name} type="button" aria-pressed={theme.logo === a.url} onClick={() => setTheme({logo: a.url})} className={`flex items-center gap-2 rounded-lg border p-1.5 pe-3 text-xs ${theme.logo === a.url ? 'border-primary' : ''}`}>
                  <img src={a.url} alt="" className="size-8 rounded object-contain" />
                  <span className="max-w-32 truncate" dir="auto">
                    {a.name}
                  </span>
                  <span className="text-muted-foreground">{formatBytes(a.bytes)}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{logos.error ?? 'No logo assets for this client yet. Upload one in Assets.'}</span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Pick id="font" label="Body font" value={theme.font} onChange={(v) => setTheme({font: v as Theme['font']})} options={strOpts([...fontNames])} />
          <Pick id="display-font" label="Title font" value={theme.displayFont} onChange={(v) => setTheme({displayFont: v as Theme['displayFont']})} options={displayFonts.map((f) => ({value: f, label: f === 'none' ? 'Pack default' : f}))} />
          <Pick id="direction" label="Direction" value={theme.direction} onChange={(v) => setTheme({direction: v as Theme['direction']})} options={[{value: 'rtl', label: 'Right to left'}, {value: 'ltr', label: 'Left to right'}]} />
          <Pick id="numerals" label="Numerals" value={theme.numerals} onChange={(v) => setTheme({numerals: v as Theme['numerals']})} options={[{value: 'latn', label: 'Latin 123'}, {value: 'arab', label: 'Arabic-Indic ١٢٣'}]} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SliderRow label="Corner radius" min={0} max={80} step={1} value={theme.radius} onChange={(radius) => setTheme({radius})} />
          <SliderRow label="Glow" min={0} max={1} step={0.05} value={theme.glow} onChange={(glow) => setTheme({glow: +glow.toFixed(2)})} />
          <SliderRow label="Motion speed" min={0.5} max={2} step={0.05} value={theme.motion.speed} onChange={(speed) => setTheme({motion: {...theme.motion, speed: +speed.toFixed(2)}})} />
          <SliderRow label="Motion damping" min={8} max={200} step={1} value={theme.motion.damping} onChange={(damping) => setTheme({motion: {...theme.motion, damping}})} />
        </div>
      </Section>

      <Section title="Defaults for new videos">
        {options.loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Pick id="d-style" label="Style pack" value={defaults.style ?? ''} onChange={(style) => setDefault({style})} options={withAuto((opts?.styles ?? []).map((s) => ({value: s.id, label: s.label})))} />
            <Pick id="d-music" label="Music" value={defaults.music ?? ''} onChange={(music) => setDefault({music})} options={withAuto(strOpts(['none', ...(opts?.music ?? [])]))} />
            <Pick id="d-voice" label="Narrator voice" value={defaults.voice ?? ''} onChange={(voice) => setDefault({voice})} options={withAuto(strOpts(opts?.voices ?? []))} />
            <Pick id="d-dialect" label="Dialect" value={defaults.dialect ?? ''} onChange={(d) => setDefault({dialect: (d || undefined) as Dialect | undefined})} options={withAuto(strOpts(dialects))} />
            <Pick id="d-format" label="Format" value={defaults.format ?? ''} onChange={(f) => setDefault({format: (f || undefined) as Format | undefined})} options={withAuto(strOpts(opts?.formats ?? []))} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-url" className="text-xs text-muted-foreground">
                Website URL
              </Label>
              <Input id="d-url" type="url" value={defaults.url ?? ''} onChange={(e) => setDefault({url: e.target.value})} placeholder="https://example.com" />
            </div>
          </div>
        )}
        {options.error && <span className="text-xs text-destructive">Could not load options: {options.error}</span>}
      </Section>

      <Section title="Brand preview">
        <BrandPreview theme={theme} />
      </Section>

      <DuplicateDialog open={dup} onOpenChange={setDup} sourceId={profile.id} onDone={onChanged} />
    </div>
  );
};
