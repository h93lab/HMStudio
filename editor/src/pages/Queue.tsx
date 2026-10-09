import {useMemo, useState} from 'react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {LogView, StatusDot, statusText} from '@/components/studio/bits';
import {errMsg, usePoll} from '@/components/studio/usePoll';
import {Button} from '@/components/ui/button';
import {Progress} from '@/components/ui/progress';
import {Skeleton} from '@/components/ui/skeleton';
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {api, type Run} from '@/lib/api';
import {cn} from '@/lib/utils';
import {Link, navigate} from '@/lib/router';

const TABS = {all: 'All', running: 'Running', failed: 'Failed', done: 'Done'} as const;
type Tab = keyof typeof TABS;
const inTab = (r: Run, t: Tab) => t === 'all' || (t === 'running' ? r.status === 'running' || r.status === 'waiting' : t === 'failed' ? r.status === 'failed' || r.status === 'cancelled' : r.status === 'done');

export const QueuePage: React.FC<{params: Record<string, string>}> = () => {
  const {data: runs, error, loading, reload} = usePoll(api.runs, 2000);
  const {data: jobs} = usePoll(api.jobs, 10000);
  const [tab, setTab] = useState<Tab>('all');
  const [picked, setPicked] = useState<string>();

  const sorted = useMemo(() => [...(runs ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [runs]);
  const list = sorted.filter((r) => inTab(r, tab));
  const selected = picked ?? list[0]?.id;
  const {data: detail} = usePoll(() => (selected ? api.run(selected) : Promise.resolve(undefined)), 2000, [selected]);
  const abJobs = useMemo(() => new Set((jobs ?? []).filter((j) => j.versions.some((v) => v.variant)).map((j) => j.id)), [jobs]);
  const active = sorted.filter((r) => r.status === 'running').length;
  const waiting = sorted.filter((r) => r.status === 'waiting').length;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <AppShell>
      <div className="grid flex-1 gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_380px]">
        <main className="flex min-w-0 flex-col gap-3">
          <PageTitle title="Queue" hint={`${active} running · ${waiting} waiting · renders one at a time`}>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                {(Object.keys(TABS) as Tab[]).map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {TABS[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </PageTitle>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Could not load the queue: {error}
            </p>
          )}
          {loading && !runs && Array.from({length: 4}, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          {runs && list.length === 0 && <p className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">Nothing here.</p>}
          {list.map((r) => (
            <div key={r.id} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3', r.status === 'running' && 'border-primary/40', r.id === selected && 'ring-1 ring-ring/60')}>
              <button type="button" onClick={() => setPicked(r.id)} aria-label={`Show log: ${r.label}`} aria-pressed={r.id === selected} className="flex min-w-0 flex-1 basis-60 items-start gap-3 text-start">
                <StatusDot status={r.status} className="mt-1.5" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span dir="auto" className="truncate font-semibold">
                      {r.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.kind}</span>
                    <span className={cn('text-xs font-bold uppercase', statusText(r.status))}>{r.status}</span>
                  </span>
                  <Progress value={r.status === 'done' ? 100 : Math.round(r.progress * 100)} className="h-1.5 bg-track" />
                  <span dir="auto" className="truncate text-xs text-muted-foreground">
                    {r.step}
                  </span>
                </span>
              </button>
              <div className="flex gap-2">
                {r.status === 'done' && r.jobId && abJobs.has(r.jobId) && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/compare/${r.jobId}`}>Compare A/B</Link>
                  </Button>
                )}
                {r.status === 'done' && r.jobId && (
                  <Button size="sm" onClick={() => navigate(`/edit/${r.jobId}`)}>
                    Open
                  </Button>
                )}
                {(r.status === 'running' || r.status === 'waiting') && (
                  <Button variant="outline" size="sm" onClick={() => void act(() => api.cancelRun(r.id), 'Cancelled')}>
                    Cancel
                  </Button>
                )}
                {(r.status === 'failed' || r.status === 'cancelled') && (
                  <Button variant="outline" size="sm" onClick={() => void act(() => api.retryRun(r.id), 'Retry started')}>
                    Retry
                  </Button>
                )}
              </div>
            </div>
          ))}
        </main>
        <aside className="flex min-h-64 flex-col gap-2 rounded-2xl border bg-card p-3 lg:max-h-[calc(100vh-9rem)]" aria-label="Run log">
          <div className="flex items-center justify-between text-sm">
            <span dir="auto" className="truncate font-semibold">
              Log{detail ? ` · ${detail.label}` : ''}
            </span>
            {detail?.status === 'running' && <span className="text-xs text-primary">live</span>}
          </div>
          <LogView log={detail?.log} className="flex-1" />
        </aside>
      </div>
    </AppShell>
  );
};
