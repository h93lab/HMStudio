import {useMemo, useState} from 'react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {EmptyState, ErrorBox, FilterTabs, LogView, PageBody, Panel, StatusDot, StatusLabel} from '@/components/kit';
import {errMsg, usePoll} from '@/components/studio/usePoll';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Progress} from '@/components/ui/progress';
import {Skeleton} from '@/components/ui/skeleton';
import {api, type Run, runTitle} from '@/lib/api';
import {Link, navigate} from '@/lib/router';
import {cn} from '@/lib/utils';

const TABS = [
  {value: 'all', label: 'All'},
  {value: 'running', label: 'Running'},
  {value: 'failed', label: 'Failed'},
  {value: 'done', label: 'Done'},
];
const inTab = (r: Run, t: string) => t === 'all' || (t === 'running' ? r.status === 'running' || r.status === 'waiting' : t === 'failed' ? r.status === 'failed' || r.status === 'cancelled' : r.status === 'done');
const KIND: Record<Run['kind'], string> = {make: 'Make', revise: 'Revise', render: 'Render', reformat: 'Reformat'};
// Legacy runs were labelled with their raw id.
const runLabel = runTitle;

export const QueuePage: React.FC<{params: Record<string, string>}> = () => {
  const {data: runs, error, loading, reload} = usePoll(api.runs, 2000);
  const {data: jobs} = usePoll(api.jobs, 10000);
  const [tab, setTab] = useState('all');
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
      <PageBody>
        <PageTitle title="Queue" hint={`${active} running · ${waiting} waiting · renders one at a time`}>
          <FilterTabs label="Filter runs" value={tab} onChange={setTab} items={TABS} />
        </PageTitle>
        {error && <ErrorBox message={`Could not load the queue: ${error}`} onRetry={() => void reload()} />}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <Panel className="flex-1" aria-label="Runs">
            {loading && !runs && Array.from({length: 4}, (_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            {runs && list.length === 0 && <EmptyState title="Nothing here" text="Runs show up when you create or revise a video." />}
            {list.map((r) => (
              <div key={r.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors hover:border-muted-foreground/50', r.id === selected && 'border-primary hover:border-primary')}>
                <button type="button" onClick={() => setPicked(r.id)} aria-label={`Show log: ${runLabel(r)}`} aria-pressed={r.id === selected} className="flex min-w-0 flex-1 basis-60 items-start gap-3 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <StatusDot status={r.status} className="mt-1.5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span dir="auto" className="min-w-0 truncate font-semibold">
                        {runLabel(r)}
                      </span>
                      <Badge variant="outline">{KIND[r.kind] ?? r.kind}</Badge>
                      <StatusLabel status={r.status} />
                    </span>
                    <Progress value={r.status === 'done' ? 100 : Math.round(r.progress * 100)} className="h-1.5 bg-track" />
                    <span dir="auto" className="truncate text-xs text-muted-foreground">
                      {r.step}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  {r.status === 'done' && r.jobId && abJobs.has(r.jobId) && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/compare/${r.jobId}`}>Compare A/B</Link>
                    </Button>
                  )}
                  {r.status === 'done' && r.jobId && (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/edit/${r.jobId}`)}>
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
          </Panel>
          <Panel
            as="aside"
            aria-label="Run log"
            title={
              <span dir="auto" className="block max-w-full truncate">
                {detail ? `Log · ${runLabel(detail)}` : 'Log'}
              </span>
            }
            actions={detail?.status === 'running' ? <span className="text-xs text-primary">live</span> : undefined}
            className="min-h-64 lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:w-96 lg:shrink-0"
          >
            <LogView log={detail?.log} className="min-h-0 flex-1" />
          </Panel>
        </div>
      </PageBody>
    </AppShell>
  );
};
