import {useCallback, useState} from 'react';
import {Plus} from 'lucide-react';
import {AppShell, PageTitle} from '@/components/AppShell';
import {BrandSwatches} from '@/components/library/BrandSwatches';
import {ClientEditor} from '@/components/library/ClientEditor';
import {NewClientDialog} from '@/components/library/ClientDialogs';
import {profileMeta} from '@/components/library/brand';
import {EmptyState, ErrorBox, PageBody} from '@/components/kit';
import {useLoad} from '@/components/library/common';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {Switch} from '@/components/ui/switch';
import {Label} from '@/components/ui/label';
import {api} from '@/lib/api';
import {Link, navigate} from '@/lib/router';
import {cn} from '@/lib/utils';

export const ClientsPage: React.FC<{params: Record<string, string>}> = ({params}) => {
  const {data, error, loading, reload} = useLoad(() => api.clients(), []);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const onDirty = useCallback((d: boolean) => setDirty(d), []);

  const all = data ?? [];
  const visible = all.filter((c) => showArchived || !c.archived || c.id === params.id);
  const selected = all.find((c) => c.id === params.id) ?? (params.id ? undefined : visible[0]);

  const go = (id: string) => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate(`/clients/${id}`);
  };

  return (
    <AppShell>
      <PageBody>
        <PageTitle title="Clients" hint="Brand kits for your videos">
          <Button className="font-title" onClick={() => setCreating(true)}>
            <Plus /> New client
          </Button>
        </PageTitle>
        {error && <ErrorBox message={error} onRetry={reload} />}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <aside aria-label="Clients" className="flex shrink-0 flex-col gap-2 lg:sticky lg:top-4 lg:w-72">
            {loading && !data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            {!loading && !error && visible.length === 0 && <EmptyState title="No clients yet" text="Create the first one." className="px-4 py-8" />}
            {visible.map((c) => {
              const on = c.id === selected?.id;
              return (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  aria-current={on ? 'true' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    go(c.id);
                  }}
                  className={cn('flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-card/60', on && 'border-primary bg-card', c.archived && 'opacity-60')}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md font-bold" style={{background: c.theme.colors.primary, color: c.theme.colors.background}} dir="auto">
                    {(c.theme.client || c.id)[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" dir="auto">
                      {c.theme.client || c.id}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{c.archived ? 'Archived · ' : ''}{profileMeta(c)}</span>
                  </span>
                  <BrandSwatches colors={[c.theme.colors.primary, c.theme.colors.accent, c.theme.colors.background]} />
                </Link>
              );
            })}
            <div className="flex items-center gap-2 px-1 pt-2">
              <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="show-archived" className="text-xs text-muted-foreground">
                Show archived
              </Label>
            </div>
          </aside>
          {loading && !data ? (
            <Skeleton className="h-96 flex-1 rounded-xl" />
          ) : selected ? (
            <ClientEditor key={selected.id} profile={selected} onDirty={onDirty} onChanged={(nextId) => (nextId ? (reload(), navigate(`/clients/${nextId}`)) : reload())} />
          ) : (
            !error && <EmptyState className="flex-1" title={params.id ? `No client "${params.id}"` : 'Select a client'} />
          )}
        </div>
      </PageBody>
      <NewClientDialog
        open={creating}
        onOpenChange={setCreating}
        onDone={(id) => {
          reload();
          navigate(`/clients/${id}`);
        }}
      />
    </AppShell>
  );
};
