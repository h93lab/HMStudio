import {useEffect, useState} from 'react';
import {ArrowLeft, Loader2, Plus, X} from 'lucide-react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {Field, SimpleSelect} from '@/components/studio/bits';
import {errMsg, usePoll} from '@/components/studio/usePoll';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {Slider} from '@/components/ui/slider';
import {api, type ModelTest, type Settings} from '@/lib/api';
import {cn} from '@/lib/utils';

const rateNum = (s: string) => parseInt(s, 10) || 0;
const rateStr = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const SettingsPage: React.FC<{params: Record<string, string>}> = () => {
  const {data: loaded, error, loading} = usePoll(api.settings, null);
  const {data: models} = usePoll(api.models, null);
  const {data: usage, error: usageError} = usePoll(api.usage, null);
  const [saved, setSaved] = useState<Settings>();
  const [chains, setChains] = useState<Record<string, string[]>>({});
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState(0);
  const [saving, setSaving] = useState(false);

  const apply = (s: Settings) => {
    setSaved(s);
    setChains(Object.fromEntries(s.roles.map((r) => [r.role, r.models])));
    setVoice(s.voice);
    setRate(rateNum(s.voiceRate));
  };
  useEffect(() => {
    if (loaded) apply(loaded);
  }, [loaded]);

  const save = async () => {
    if (Object.values(chains).some((c) => c.length === 0)) return toast.error('Every role needs at least one model');
    setSaving(true);
    try {
      apply(await api.saveSettings({models: chains, voice, voiceRate: rateStr(rate)}));
      toast.success('Settings saved');
    } catch (e) {
      toast.error(errMsg(e));
    }
    setSaving(false);
  };
  const reset = async () => {
    try {
      apply(await api.saveSettings({reset: true}));
      toast.success('Reset to defaults');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const maxCalls = Math.max(1, ...(usage ?? []).map((u) => u.calls));

  return (
    <AppShell>
      <div className="grid flex-1 gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_340px]">
        <main className="flex min-w-0 flex-col gap-3">
          <PageTitle title="AI models" hint="First model is used; the next ones are automatic fallbacks." />
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Could not load settings: {error}
            </p>
          )}
          {loading && !saved && Array.from({length: 4}, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          {saved?.roles.map((r) => (
            <RoleCard key={r.role} label={r.label} chain={chains[r.role] ?? []} custom={!same(chains[r.role] ?? [], r.defaults)} options={models ?? []} role={r.role} onChange={(c) => setChains((p) => ({...p, [r.role]: c}))} />
          ))}
        </main>
        <aside className="flex flex-col gap-3">
          <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-label="Voice">
            <h2 className="font-title text-sm text-muted-foreground">Voice</h2>
            <Field label="Default narrator" htmlFor="voice">
              <SimpleSelect id="voice" value={voice} onChange={setVoice} emptyLabel="Auto by dialect" options={(saved?.voices ?? []).map((v) => ({value: v, label: v}))} />
            </Field>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span id="rate-label">Speaking rate</span>
                <span className="font-semibold text-primary">{rateStr(rate)}</span>
              </div>
              <Slider aria-labelledby="rate-label" min={-20} max={30} step={1} value={[rate]} onValueChange={([v]) => setRate(v)} />
            </div>
          </section>
          <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4" aria-label="Usage">
            <h2 className="font-title text-sm text-muted-foreground">Usage this week</h2>
            {usageError && <p className="text-xs text-destructive">{usageError}</p>}
            {usage && usage.length === 0 && <p className="text-xs text-muted-foreground">No calls yet.</p>}
            {usage?.map((u) => (
              <div key={u.model} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{u.model}</span>
                  <span className="text-muted-foreground">
                    {u.calls}
                    {u.failures > 0 && <span className="text-destructive"> · {u.failures} failed</span>}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-track">
                  <div className="h-full rounded-full bg-primary" style={{width: `${(u.calls / maxCalls) * 100}%`}} />
                </div>
              </div>
            ))}
          </section>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="flex-1" disabled={!saved}>
                  Reset to defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all models?</AlertDialogTitle>
                  <AlertDialogDescription>Every role goes back to its default model chain, and the voice settings are cleared.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void reset()}>Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button className="font-title flex-1" disabled={!saved || saving} onClick={() => void save()}>
              {saving && <Loader2 className="animate-spin" />} Save
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
};

const RoleCard: React.FC<{role: string; label: string; chain: string[]; custom: boolean; options: string[]; onChange: (c: string[]) => void}> = ({role, label, chain, custom, options, onChange}) => {
  const [draft, setDraft] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ModelTest>();
  const listId = `models-${role}`;

  const add = () => {
    const m = draft.trim();
    if (m && !chain.includes(m)) onChange([...chain, m]);
    setDraft('');
  };
  const test = async () => {
    setTesting(true);
    setResult(undefined);
    try {
      setResult(await api.testModels(chain));
    } catch (e) {
      setResult({ok: false, error: errMsg(e)});
    }
    setTesting(false);
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-title text-base">{label}</h2>
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', custom ? 'border-primary/50 text-primary' : 'text-muted-foreground')}>{custom ? 'custom' : 'default'}</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" disabled={testing || chain.length === 0} onClick={() => void test()}>
          {testing && <Loader2 className="animate-spin" />} Test
        </Button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {chain.map((m, i) => (
          <li key={m} className={cn('flex items-center gap-1 rounded-lg border py-1 ps-2.5 pe-1 text-xs', i === 0 ? 'border-primary bg-primary/10 text-primary' : 'bg-panel text-foreground/80')}>
            <span className="break-all">{m}</span>
            {i > 0 && (
              <Button variant="ghost" size="icon-xs" aria-label={`Move ${m} earlier`} onClick={() => onChange([...chain.slice(0, i - 1), m, chain[i - 1], ...chain.slice(i + 1)])}>
                <ArrowLeft />
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" aria-label={`Remove ${m}`} onClick={() => onChange(chain.filter((x) => x !== m))}>
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input aria-label={`Add a fallback model for ${label}`} list={listId} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+ fallback model" className="bg-panel" />
        <datalist id={listId}>
          {options.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Button type="submit" variant="outline" size="icon" aria-label="Add model" disabled={!draft.trim()}>
          <Plus />
        </Button>
      </form>
      {result && (
        <p dir="auto" role="status" className={cn('text-xs break-words', result.ok ? 'text-primary' : 'text-destructive')}>
          {result.ok ? `✓ ${result.model} · ${(result.ms / 1000).toFixed(1)}s · ${result.reply}` : `✗ ${result.error}`}
        </p>
      )}
    </section>
  );
};
