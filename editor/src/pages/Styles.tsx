import {useMemo, useState} from 'react';
import {ArrowLeft, Loader2, Plus, Save, Sparkles} from 'lucide-react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {Empty, errMsg, ErrorBox, useLoad} from '@/components/library/common';
import {PackForm} from '@/components/styles/PackForm';
import {StyleCard} from '@/components/styles/StyleCard';
import {StylePreview} from '@/components/styles/StylePreview';
import {useUnsavedGuard} from '@/components/styles/useUnsavedGuard';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Skeleton} from '@/components/ui/skeleton';
import {Textarea} from '@/components/ui/textarea';
import {api, type CustomStyle} from '@/lib/api';
import {Link, navigate, useLocation} from '@/lib/router';
import {packIds, packs, type Pack} from '../../../src/design/packs';

export const StylesPage: React.FC<{params: Record<string, string>}> = ({params}) => (
  <AppShell>{params.id ? <StyleEditor key={params.id} id={params.id} /> : <StyleList />}</AppShell>
);

const StyleList = () => {
  const {data, error, loading, reload} = useLoad(() => api.styles(), []);
  const [toDelete, setToDelete] = useState<CustomStyle | null>(null);

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteStyle(toDelete.id);
      toast.success('Style deleted');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setToDelete(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <PageTitle title="Styles" hint="The motion personality of a video: camera, transitions, finish.">
        <Button className="font-title" onClick={() => navigate('/styles/new')}>
          <Plus /> New style
        </Button>
      </PageTitle>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <h2 className="font-title text-sm text-muted-foreground">Your styles</h2>
      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <StyleCard key={s.id} name={s.name} prompt={s.prompt} pack={s.pack} editHref={`/styles/${s.id}`} onDelete={() => setToDelete(s)} />
          ))}
        </div>
      ) : (
        !error && <Empty>No custom styles yet. Describe a look and let the AI build it.</Empty>
      )}
      <h2 className="mt-2 font-title text-sm text-muted-foreground">Built-in</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {packIds.map((id) => (
          <StyleCard key={id} builtIn name={packs[id].label} pack={packs[id]} editHref={`/styles/new?base=${id}`} />
        ))}
      </div>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this style?</AlertDialogTitle>
            <AlertDialogDescription dir="auto">{toDelete?.name} will be removed. Videos already made with it keep their look.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const StyleEditor: React.FC<{id: string}> = ({id}) => {
  const isNew = id === 'new';
  const {query} = useLocation();
  const base = query.get('base');
  const styles = useLoad(() => api.styles(), []);
  const clients = useLoad(() => api.clients(), []);
  const theme = clients.data?.find((c) => !c.archived)?.theme;
  const existing = isNew ? undefined : styles.data?.find((s) => s.id === id);

  if (!isNew && styles.loading && !styles.data) return <Skeleton className="m-5 h-96 rounded-2xl" />;
  if (styles.error) return <div className="p-5"><ErrorBox message={styles.error} onRetry={styles.reload} /></div>;
  if (!isNew && !existing) return <div className="p-5"><Empty>No style "{id}". <Link href="/styles" className="text-primary underline">Back to styles</Link></Empty></div>;

  const builtIn = packIds.find((p) => p === base);
  const start = existing ? {name: existing.name, prompt: existing.prompt, pack: existing.pack} : {name: builtIn ? `${packs[builtIn].label} (custom)` : '', prompt: '', pack: structuredClone(packs[builtIn ?? 'premium-tech'])};
  return <Form id={isNew ? undefined : id} start={start} hasPack={!isNew || !!builtIn} theme={theme} />;
};

type Draft = {name: string; prompt: string; pack: Pack};

const Form: React.FC<{id?: string; start: Draft; hasPack: boolean; theme: import('@/lib/api').Theme | undefined}> = ({id, start, hasPack: initialHasPack, theme}) => {
  const [saved, setSaved] = useState(start);
  const [draft, setDraft] = useState(start);
  const [hasPack, setHasPack] = useState(initialHasPack); // false until the AI or the user shaped a pack
  const [notes, setNotes] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || (!id && hasPack !== initialHasPack);
  useUnsavedGuard(dirty);
  const preview = useMemo(() => draft.pack, [draft.pack]);

  const generate = async () => {
    if (!draft.prompt.trim()) return void toast.error('Describe the style first');
    setGenerating(true);
    try {
      const r = await api.generateStyle(draft.prompt.trim(), hasPack ? draft.pack : undefined);
      setDraft((d) => ({...d, pack: r.pack}));
      setNotes(r.notes);
      setHasPack(true);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setGenerating(false);
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) return void toast.error('Give the style a name');
    setSaving(true);
    try {
      const pack = {...draft.pack, label: name};
      const s = await api.saveStyle({name, prompt: draft.prompt.trim(), pack}, id);
      setSaved({name, prompt: draft.prompt.trim(), pack}); // clears the guard before navigating
      setHasPack(true);
      toast.success('Style saved');
      if (!id) navigate(`/styles/${s.id}`, true);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <PageTitle title={id ? 'Edit style' : 'New style'} hint={dirty ? <span className="text-amber-400">● Unsaved changes</span> : undefined}>
        <Button asChild variant="outline">
          <Link href="/styles">
            <ArrowLeft /> Styles
          </Link>
        </Button>
        <Button className="font-title" onClick={() => void save()} disabled={saving || (!!id && !dirty)}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="style-name" className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input id="style-name" dir="auto" value={draft.name} maxLength={60} onChange={(e) => setDraft({...draft, name: e.target.value})} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="style-prompt" className="text-xs text-muted-foreground">
                Describe the look
              </Label>
              <Textarea id="style-prompt" dir="auto" rows={3} value={draft.prompt} onChange={(e) => setDraft({...draft, prompt: e.target.value})} placeholder="Luxurious and calm: gold on black, slow elegant motion, soft film grain" />
            </div>
            <div>
              <Button variant="outline" onClick={() => void generate()} disabled={generating}>
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} {hasPack ? 'Refine with AI' : 'Generate with AI'}
              </Button>
            </div>
            {notes.length > 0 && (
              <ul aria-label="AI notes" className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {notes.map((n, i) => (
                  <li key={i} dir="auto">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
            <h2 className="font-title text-sm text-muted-foreground">Fine-tune</h2>
            <PackForm
              pack={draft.pack}
              onChange={(pack) => {
                setDraft({...draft, pack});
                setHasPack(true);
              }}
            />
          </section>
        </div>
        <aside className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
          <h2 className="font-title text-sm text-muted-foreground">Live preview</h2>
          <StylePreview pack={preview} theme={theme} />
          <p className="text-center text-xs text-muted-foreground">Sample video with {theme ? 'the first client brand' : 'the default brand'}.</p>
        </aside>
      </div>
    </div>
  );
};
