import {useMemo, useState} from 'react';
import {ArrowLeft, Loader2, Palette, Plus, Save, Sparkles} from 'lucide-react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {EmptyState, ErrorBox, Field, PageBody, Panel} from '@/components/kit';
import {errMsg, useLoad} from '@/components/library/common';
import {PackForm} from '@/components/styles/PackForm';
import {StyleCard} from '@/components/styles/StyleCard';
import {StylePreview} from '@/components/styles/StylePreview';
import {useUnsavedGuard} from '@/components/styles/useUnsavedGuard';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
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
    <PageBody>
      <PageTitle title="Styles" hint="The motion personality of a video: camera, transitions, finish.">
        <Button className="font-title" onClick={() => navigate('/styles/new')}>
          <Plus /> New style
        </Button>
      </PageTitle>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <h2 className="font-title text-sm">Your styles</h2>
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <StyleCard key={s.id} name={s.name} prompt={s.prompt} pack={s.pack} editHref={`/styles/${s.id}`} onDelete={() => setToDelete(s)} />
          ))}
        </div>
      ) : (
        !error && (
          <EmptyState
            icon={<Palette />}
            title="No custom styles yet"
            text="Describe a look and let the AI build it."
            action={
              <Button variant="outline" size="sm" onClick={() => navigate('/styles/new')}>
                <Plus /> New style
              </Button>
            }
          />
        )
      )}
      <h2 className="font-title text-sm">Built-in</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
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

  if (!isNew && styles.loading && !styles.data) return <PageBody><Skeleton className="h-96 rounded-xl" /></PageBody>;
  if (styles.error) return <PageBody><ErrorBox message={styles.error} onRetry={styles.reload} /></PageBody>;
  if (!isNew && !existing) return <PageBody><EmptyState title={`No style "${id}"`} action={<Button asChild variant="outline" size="sm"><Link href="/styles">Back to styles</Link></Button>} /></PageBody>;

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
    <PageBody>
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
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Panel title="Describe">
            <div className="flex flex-col gap-3">
              <Field label="Name" htmlFor="style-name">
                <Input id="style-name" dir="auto" value={draft.name} maxLength={60} onChange={(e) => setDraft({...draft, name: e.target.value})} />
              </Field>
              <Field label="Describe the look" htmlFor="style-prompt">
                <Textarea id="style-prompt" dir="auto" rows={3} value={draft.prompt} onChange={(e) => setDraft({...draft, prompt: e.target.value})} placeholder="Luxurious and calm: gold on black, slow elegant motion, soft film grain" />
              </Field>
            </div>
            <div>
              <Button variant="outline" onClick={() => void generate()} disabled={generating}>
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} {hasPack ? 'Refine with AI' : 'Generate with AI'}
              </Button>
            </div>
          </Panel>
          {notes.length > 0 && (
            <Panel title="AI notes">
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {notes.map((n, i) => (
                  <li key={i} dir="auto">
                    {n}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Fine-tune">
            <PackForm
              pack={draft.pack}
              onChange={(pack) => {
                setDraft({...draft, pack});
                setHasPack(true);
              }}
            />
          </Panel>
        </div>
        <Panel as="aside" title="Live preview" className="lg:sticky lg:top-4 lg:w-96 lg:shrink-0">
          <StylePreview pack={preview} theme={theme} />
          <p className="text-center text-xs text-muted-foreground">Sample video with {theme ? 'the first client brand' : 'the default brand'}.</p>
        </Panel>
      </div>
    </PageBody>
  );
};
