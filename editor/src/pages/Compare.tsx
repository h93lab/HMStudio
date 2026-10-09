import {useRef, useState} from 'react';
import {Pause, Play, Trophy} from 'lucide-react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {EmptyState, ErrorBox, PageBody, Panel} from '@/components/kit';
import {errMsg, useLoad} from '@/components/library/common';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {Slider} from '@/components/ui/slider';
import {api, mmss, type JobSummary, type VersionSummary} from '@/lib/api';
import {Link, navigate} from '@/lib/router';
import {cn} from '@/lib/utils';

const score = (n?: number) => n ?? -1;
const best = (list: VersionSummary[]) => [...list].sort((a, b) => score(b.criticScore) - score(a.criticScore) || score(b.qaScore) - score(a.qaScore))[0];
const videoOf = (job: JobSummary, v: VersionSummary) => v.videos[job.format.replace(':', 'x')] ?? v.videos[job.format] ?? Object.values(v.videos)[0];

type Stat = {label: string; value: string; win: boolean};
const stats = (v: VersionSummary, all: VersionSummary[]): Stat[] => {
  const top = (pick: (x: VersionSummary) => number | undefined) => {
    const vals = all.map(pick).filter((n): n is number => n !== undefined);
    return (x: VersionSummary) => vals.length > 1 && pick(x) === Math.max(...vals) && new Set(vals).size > 1;
  };
  const qa = top((x) => x.qaScore);
  const critic = top((x) => x.criticScore);
  return [
    {label: 'QA score', value: v.qaScore === undefined ? '–' : `${v.qaScore} / 10`, win: qa(v)},
    {label: 'Script critic', value: v.criticScore === undefined ? '–' : `${v.criticScore} / 10`, win: critic(v)},
    {label: 'Length', value: `${v.seconds.toFixed(1)}s`, win: false},
    {label: 'Scenes', value: String(v.scenes), win: false},
  ];
};

export const ComparePage: React.FC<{params: Record<string, string>}> = ({params}) => {
  const id = params.id;
  const {data: job, error, loading, reload} = useLoad(() => api.job(id), [id]);
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [keeping, setKeeping] = useState<number | null>(null);

  const withVariant = job?.versions.filter((v) => v.variant) ?? [];
  const candidates = withVariant.length >= 2 ? withVariant : (job?.versions ?? []);
  const rec = candidates.length ? best(candidates) : undefined;
  const videos = () => refs.current.filter((x): x is HTMLVideoElement => !!x);
  const known = Object.values(durations).filter((d) => d > 0);
  const shortest = known.length ? Math.min(...known) : 0;

  const togglePlay = () => {
    const vs = videos();
    if (playing) vs.forEach((x) => x.pause());
    else vs.forEach((x) => void x.play().catch(() => toast.error('Could not play a video')));
    setPlaying(!playing);
  };
  const seek = (t: number) => {
    videos().forEach((x) => (x.currentTime = t));
    setTime(t);
  };

  const keep = async (v: VersionSummary) => {
    setKeeping(v.v);
    try {
      await api.pickWinner(id, v.v);
      navigate(`/edit/${id}?v=${v.v}`);
    } catch (e) {
      toast.error(errMsg(e));
      setKeeping(null);
    }
  };

  return (
    <AppShell>
      <PageBody>
        <Link href="/" className="w-fit text-sm text-muted-foreground hover:text-foreground">
          ← Projects
        </Link>
        <PageTitle title={job ? `${job.clientName} · A / B` : 'A / B compare'} hint="Same idea, different hooks. Play both, keep one.">
          <Button variant="outline" onClick={togglePlay} disabled={!job || candidates.every((v) => !videoOf(job, v))}>
            {playing ? <Pause /> : <Play />} {playing ? 'Pause both' : 'Play both in sync'}
          </Button>
        </PageTitle>
        {job && (
          <p className="text-sm text-muted-foreground" dir="auto">
            {job.idea}
          </p>
        )}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !job && (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        )}
        {job && candidates.length === 0 && <EmptyState title="No versions to compare yet" />}
        {job && candidates.length === 1 && <EmptyState title="Only one version exists" text="Generate variants to compare hooks." />}
        {job && candidates.length > 0 && (
          <>
            <div className={cn('grid gap-4 md:grid-cols-2', candidates.length > 2 && 'xl:grid-cols-3')}>
              {candidates.map((v, i) => {
                const src = videoOf(job, v);
                const isRec = v === rec && candidates.length > 1;
                const letter = String.fromCharCode(65 + i);
                return (
                  <Panel
                    key={v.v}
                    className={cn(isRec && 'border-primary')}
                    title={
                      <span className="flex items-center gap-2">
                        <span className={cn('grid size-7 place-items-center rounded-md text-sm font-bold', isRec ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>{letter}</span>
                        <span dir="auto">Version {v.v}</span>
                      </span>
                    }
                    meta={`${v.seconds.toFixed(1)}s`}
                    actions={
                      <>
                        {job.winner === v.v && (
                          <Badge>
                            <Trophy /> Current winner
                          </Badge>
                        )}
                        {isRec && <Badge variant="outline">Recommended</Badge>}
                      </>
                    }
                  >
                    <div className="mx-auto flex aspect-[9/16] h-[60vh] max-w-full items-center justify-center overflow-hidden rounded-xl bg-field">
                      {src ? (
                        <video
                          ref={(el) => void (refs.current[i] = el)}
                          src={src}
                          poster={v.cover}
                          controls
                          playsInline
                          preload="metadata"
                          onPlay={() => setPlaying(true)}
                          onTimeUpdate={(e) => i === 0 && setTime(e.currentTarget.currentTime)}
                          onEnded={() => setPlaying(false)}
                          onPause={() => setPlaying(videos().some((x) => !x.paused))}
                          onLoadedMetadata={(e) => {
                            const len = e.currentTarget.duration;
                            setDurations((d) => ({...d, [i]: len}));
                          }}
                          className="size-full bg-black object-contain"
                        />
                      ) : v.cover ? (
                        <img src={v.cover} alt={`Cover of ${letter}`} className="size-full object-contain" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Not rendered yet</span>
                      )}
                    </div>
                    {v.variant && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted-foreground">Hook</span>
                        <p className="text-sm" dir="auto">
                          {v.variant}
                        </p>
                      </div>
                    )}
                    <dl className="flex flex-col text-sm">
                      {stats(v, candidates).map((s) => (
                        <div key={s.label} className="flex justify-between gap-3 border-b py-2 last:border-b-0">
                          <dt className="text-muted-foreground">{s.label}</dt>
                          <dd className={cn(s.win && 'font-medium text-primary')}>{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <Button className={cn('w-full', isRec && 'font-title')} variant={isRec ? 'default' : 'outline'} disabled={keeping !== null} onClick={() => keep(v)}>
                      {keeping === v.v ? 'Saving…' : `Keep ${letter} · open in editor`}
                    </Button>
                  </Panel>
                );
              })}
            </div>
            {candidates.some((v) => videoOf(job, v)) && shortest > 0 && (
              <Panel className="flex-row items-center gap-3">
                <span className="w-10 text-xs tabular-nums text-muted-foreground">{mmss(time)}</span>
                <Slider aria-label="Seek both videos" min={0} max={Math.max(shortest, 0.1)} step={0.1} value={[Math.min(time, shortest)]} onValueChange={([t]) => seek(t)} />
                <span className="w-10 text-end text-xs tabular-nums text-muted-foreground">{mmss(shortest)}</span>
              </Panel>
            )}
          </>
        )}
      </PageBody>
    </AppShell>
  );
};
