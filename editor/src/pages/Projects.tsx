import {useMemo, useState} from 'react';
import {Plus, Search} from 'lucide-react';
import {AppShell, PageTitle} from '@/components/AppShell';
import {SimpleSelect} from '@/components/studio/bits';
import {usePoll} from '@/components/studio/usePoll';
import {VideoCard} from '@/components/studio/VideoCard';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {api} from '@/lib/api';
import {navigate} from '@/lib/router';

export const ProjectsPage: React.FC<{params: Record<string, string>}> = () => {
  const [busyPoll, setBusyPoll] = useState<number | null>(null);
  const {data: jobs, error, loading, reload} = usePoll(async () => {
    const j = await api.jobs();
    setBusyPoll(j.some((x) => x.busy) ? 5000 : null);
    return j;
  }, busyPoll);
  const [client, setClient] = useState('');
  const [q, setQ] = useState('');

  const clients = useMemo(() => [...new Map((jobs ?? []).map((j) => [j.client, j.clientName])).entries()].map(([value, label]) => ({value, label})), [jobs]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (jobs ?? []).filter((j) => (!client || j.client === client) && (!s || j.idea.toLowerCase().includes(s) || j.clientName.toLowerCase().includes(s))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [jobs, client, q]);
  const versions = (jobs ?? []).reduce((n, j) => n + j.versions.length, 0);

  return (
    <AppShell>
      <main className="flex flex-col gap-4 p-4 sm:p-5">
        <PageTitle title="Projects" hint={jobs && `${jobs.length} videos · ${versions} versions`}>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search projects" dir="auto" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} className="bg-[#141415] ps-9" />
          </div>
          <SimpleSelect id="filter-client" value={client} onChange={setClient} emptyLabel="All clients" options={clients} className="w-full sm:w-44" />
        </PageTitle>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Could not load projects: {error}{' '}
            <button className="underline" onClick={() => void reload()}>
              Retry
            </button>
          </p>
        )}
        {loading && !jobs ? (
          <Grid>
            {Array.from({length: 5}, (_, i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </Grid>
        ) : jobs && jobs.length === 0 ? (
          <div className="grid place-items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
            <p className="font-title text-xl">No videos yet</p>
            <p className="text-sm text-muted-foreground">Start from an idea; the studio writes, voices and renders it.</p>
            <Button className="font-title" onClick={() => navigate('/new')}>
              <Plus /> Create your first video
            </Button>
          </div>
        ) : shown.length === 0 ? (
          jobs && <p className="py-12 text-center text-sm text-muted-foreground">No videos match this filter.</p>
        ) : (
          <Grid>
            {shown.map((j) => (
              <VideoCard key={j.id} job={j} onChanged={() => void reload()} />
            ))}
          </Grid>
        )}
      </main>
    </AppShell>
  );
};

const Grid: React.FC<{children: React.ReactNode}> = ({children}) => <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">{children}</div>;
