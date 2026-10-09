import {useEffect, useRef, useState} from 'react';
import {Check, Download, Loader2, Share2} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {api, type Format, type JobSummary, type Run} from '@/lib/api';
import {cn} from '@/lib/utils';

const USE: Record<Format, string> = {'9:16': 'Reels · TikTok', '1:1': 'Feed', '4:5': 'Instagram', '16:9': 'YouTube'};

type Props = {open: boolean; onOpenChange: (o: boolean) => void; job: JobSummary; v: number; dirty: boolean; onDone: () => void};

// Export = render this version in its own format (+ reformat runs for the others), then show the files.
export const ExportDialog: React.FC<Props> = ({open, onOpenChange, job, v, dirty, onDone}) => {
  const version = job.versions.find((x) => x.v === v);
  const [formats, setFormats] = useState<Format[]>([job.format]);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const ids = useRef<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setRuns(null);
    ids.current = [];
    setFormats([job.format]);
  }, [open, job.format]);

  useEffect(() => {
    if (!runs || runs.every((r) => r.status !== 'running' && r.status !== 'waiting')) return;
    const t = setInterval(async () => {
      const all = await api.runs().catch(() => null);
      if (!all) return;
      const mine = all.filter((r) => ids.current.includes(r.id));
      setRuns(mine);
      if (mine.length === ids.current.length && mine.every((r) => r.status === 'done')) onDone();
    }, 2000);
    return () => clearInterval(t);
  }, [runs, onDone]);

  const start = async () => {
    try {
      const r = await api.exportVideo(job.id, {v, formats});
      ids.current = r.runs;
      if (!r.runs.length) {
        onDone();
        setRuns([]);
        return;
      }
      setRuns(r.runs.map((id) => ({id, kind: 'render', label: 'Export', status: 'waiting', progress: 0, step: 'Queued', startedAt: new Date().toISOString()})));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const finished = runs !== null && runs.length === ids.current.length && runs.every((r) => r.status === 'done');
  const failed = runs?.find((r) => r.status === 'failed' || r.status === 'cancelled');
  const shareLink = () => navigator.clipboard.writeText(location.origin + job.reviewUrl).then(() => toast.success('Review link copied'), () => toast.error('Could not copy'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {finished ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="grid size-14 -rotate-6 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Check className="size-7" strokeWidth={3} />
            </span>
            <DialogTitle className="font-title text-4xl">Export success</DialogTitle>
            <DialogDescription>Audio mastered to −14 LUFS for social.</DialogDescription>
            <div className="flex flex-wrap justify-center gap-2">
              {Object.entries(version?.videos ?? {}).map(([f, url]) => (
                <Button key={f} variant="outline" asChild>
                  <a href={url} download>
                    <Download /> {f} mp4
                  </a>
                </Button>
              ))}
              <Button className="font-title" onClick={shareLink}>
                <Share2 /> Send to client
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">All formats are saved with v{v} of this project.</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-title text-lg">Export</DialogTitle>
              <DialogDescription>
                v{v} · {version?.seconds.toFixed(1) ?? '?'}s · {version?.scenes ?? '?'} scenes · H.264 mp4, high quality (CRF 18), renders on this Mac.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              {version?.cover ? <img src={version.cover} alt="Video cover" className="hidden aspect-[9/16] w-full rounded-lg object-cover sm:block" /> : <div className="hidden aspect-[9/16] rounded-lg bg-field sm:block" />}
              <div className="flex flex-col gap-3">
                <span className="font-title text-sm">Formats</span>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(USE) as Format[]).map((f) => {
                    const on = formats.includes(f);
                    return (
                      <label key={f} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-3', on && 'border-primary bg-primary/10')}>
                        <Checkbox checked={on} disabled={runs !== null} onCheckedChange={(c) => setFormats((x) => (c ? [...x, f] : x.filter((y) => y !== f)))} className="mt-0.5" />
                        <span className="flex flex-col">
                          <span className="font-semibold">{f}</span>
                          <span className="text-xs text-muted-foreground">{USE[f]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {dirty ? <p className="text-xs text-destructive">You have unsaved edits. Export uses the last saved version (v{v}); save first to include them.</p> : null}
                {runs?.map((r) => (
                  <div key={r.id} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="truncate">{r.label}</span>
                      <span className="text-muted-foreground uppercase">{r.status}</span>
                    </div>
                    <Progress value={r.progress * 100} />
                    <span className="truncate text-xs text-muted-foreground">{r.step}</span>
                  </div>
                ))}
                {failed ? <p className="text-xs text-destructive">Export failed: {failed.step}. Open the Queue for the full log.</p> : null}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {runs ? 'Close' : 'Cancel'}
              </Button>
              <Button className="font-title" disabled={!formats.length || (runs !== null && !failed)} onClick={start}>
                {runs && !failed ? <Loader2 className="animate-spin" /> : <Download />} Export
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
