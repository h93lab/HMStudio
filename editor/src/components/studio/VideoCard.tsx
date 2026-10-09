import {useState} from 'react';
import {Columns2, Copy, Film, Loader2, MessageSquare, MoreVertical, Pencil, RefreshCw, Shapes} from 'lucide-react';
import {toast} from 'sonner';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {api, type Format, type JobSummary} from '@/lib/api';
import {Link, navigate} from '@/lib/router';
import {FORMATS} from './bits';
import {errMsg} from './usePoll';

const shown = (j: JobSummary) => j.versions.find((v) => v.v === j.winner) ?? j.versions[j.versions.length - 1];

export const VideoCard: React.FC<{job: JobSummary; onChanged: () => void}> = ({job, onChanged}) => {
  const [reviseOpen, setReviseOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const v = shown(job);
  const hasVariants = job.versions.some((x) => x.variant);

  const start = async (fn: () => Promise<{run: string}>, ok: string) => {
    try {
      await fn();
      toast.success(ok, {action: {label: 'Queue', onClick: () => navigate('/queue')}});
      onChanged();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + job.reviewUrl);
      toast.success('Review link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };
  const revise = async () => {
    setSending(true);
    if (await start(() => api.revise(job.id, feedback.trim()), 'Revision started')) {
      setReviseOpen(false);
      setFeedback('');
    }
    setSending(false);
  };

  return (
    <article className="group overflow-hidden rounded-2xl border bg-card">
      <Link href={`/edit/${job.id}`} className="relative block aspect-[9/16] max-h-80 w-full overflow-hidden bg-panel" aria-label={`Open editor: ${job.idea.slice(0, 60)}`}>
        {v?.cover ? <img src={v.cover} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" /> : <Film className="absolute inset-0 m-auto size-8 text-muted-foreground" />}
        {job.busy && (
          <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-primary">
            <Loader2 className="size-3 animate-spin" /> Working
          </span>
        )}
        {v?.qaScore != null && <Badge className="absolute end-2 top-2 bg-black/70 text-primary" title="QA score">QA {v.qaScore.toFixed(1)}</Badge>}
      </Link>
      <div className="flex flex-col gap-2 p-3">
        <p dir="auto" className="line-clamp-2 min-h-10 text-sm">
          {job.idea}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span dir="auto" className="font-semibold text-foreground">
            {job.clientName}
          </span>
          <span>{job.format}</span>
          <span>{job.versions.length} {job.versions.length === 1 ? 'version' : 'versions'}</span>
          {job.approval && <Badge variant="outline" className={job.approval.status === 'approved' ? 'text-primary' : 'text-chart-5'}>{job.approval.status === 'approved' ? 'Approved' : 'Changes asked'}</Badge>}
          {job.openComments > 0 && (
            <span className="inline-flex items-center gap-1 text-chart-5">
              <MessageSquare className="size-3" /> {job.openComments}
            </span>
          )}
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Video actions">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => navigate(`/edit/${job.id}`)}>
                <Film /> Open editor
              </DropdownMenuItem>
              {hasVariants && (
                <DropdownMenuItem onSelect={() => navigate(`/compare/${job.id}`)}>
                  <Columns2 /> Compare A/B
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={copyLink}>
                <Copy /> Copy review link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setReviseOpen(true)}>
                <Pencil /> Revise…
              </DropdownMenuItem>
              {job.openComments > 0 && (
                <DropdownMenuItem onSelect={() => void start(() => api.applyComments(job.id), 'Applying comments')}>
                  <MessageSquare /> Apply {job.openComments} {job.openComments === 1 ? 'comment' : 'comments'}
                </DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Shapes /> Reformat
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {FORMATS.filter((f) => f !== job.format).map((f: Format) => (
                    <DropdownMenuItem key={f} onSelect={() => void start(() => api.reformat(job.id, f), `Reformatting to ${f}`)}>
                      <RefreshCw /> {f}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Dialog open={reviseOpen} onOpenChange={setReviseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revise video</DialogTitle>
            <DialogDescription>Describe what to change. A new version is created; the current one is kept.</DialogDescription>
          </DialogHeader>
          <Label htmlFor={`fb-${job.id}`}>Feedback</Label>
          <Textarea id={`fb-${job.id}`} dir="auto" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Make the hook punchier, show the logo earlier…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviseOpen(false)}>
              Cancel
            </Button>
            <Button className="font-title" disabled={!feedback.trim() || sending} onClick={revise}>
              {sending && <Loader2 className="animate-spin" />} Revise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
};
