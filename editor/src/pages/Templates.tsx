import {useState} from 'react';
import {LayoutTemplate, Plus} from 'lucide-react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {EmptyState, ErrorBox, FilterTabs, PageBody} from '@/components/kit';
import {errMsg, useLoad} from '@/components/library/common';
import {CATEGORIES, NewTemplateDialog} from '@/components/library/NewTemplateDialog';
import {TemplateCard} from '@/components/library/TemplateCard';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {api, type Template} from '@/lib/api';

const TABS = [{value: 'all', label: 'All'}, ...CATEGORIES.map((c) => ({value: c, label: c[0].toUpperCase() + c.slice(1)}))];

export const TemplatesPage: React.FC<{params: Record<string, string>}> = () => {
  const {data, error, loading, reload} = useLoad(() => api.templates(), []);
  const [tab, setTab] = useState('all');
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Template | null>(null);

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteTemplate(toDelete.id);
      toast.success('Template deleted');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setToDelete(null);
  };

  const shown = (data ?? []).filter((t) => tab === 'all' || t.category === tab);

  return (
    <AppShell>
      <PageBody>
        <PageTitle title="Templates" hint="Saved video structures. The AI fills the words; you keep the rhythm.">
          <Button className="font-title" onClick={() => setCreating(true)}>
            <Plus /> New template
          </Button>
        </PageTitle>
        <FilterTabs label="Category" value={tab} onChange={setTab} items={TABS} className="w-fit" />
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          !error && (
            <EmptyState
              icon={<LayoutTemplate />}
              title={data?.length ? 'No templates in this category' : 'No templates yet'}
              text={data?.length ? undefined : 'Save a project structure to reuse it.'}
              action={
                data?.length ? undefined : (
                  <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                    <Plus /> New template
                  </Button>
                )
              }
            />
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((t) => (
              <TemplateCard key={t.id} template={t} onDelete={setToDelete} />
            ))}
          </div>
        )}
      </PageBody>
      <NewTemplateDialog open={creating} onOpenChange={setCreating} onDone={reload} />
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription dir="auto">{toDelete?.name} will be removed. Existing videos are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
};
