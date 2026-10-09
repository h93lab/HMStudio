import {useRef, useState} from 'react';
import {Check, Loader2, Play, Send} from 'lucide-react';
import {toast} from 'sonner';
import {errMsg, usePoll} from '@/components/studio/usePoll';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {api, mmss} from '@/lib/api';
import {useLocation} from '@/lib/router';

const NAME_KEY = 'ms-review-name';
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

export const ReviewPage: React.FC<{params: Record<string, string>}> = ({params}) => {
  const id = params.id;
  const token = useLocation().query.get('t') ?? '';
  const {data: review, error, loading, reload} = usePoll(() => api.review(id, token), null, [id, token]);
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [text, setText] = useState('');
  const [name, setName] = useState(readName);
  const [busy, setBusy] = useState(false);

  const saveName = (v: string) => {
    setName(v);
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {
      /* private mode: the name just isn't remembered */
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!review || !text.trim()) return;
    setBusy(true);
    try {
      await api.comment(id, {token, time: Math.round((video.current?.currentTime ?? time) * 10) / 10, v: review.v, author: name.trim() || 'Client', text: text.trim()});
      setText('');
      await reload();
      toast.success('Comment sent');
    } catch (err) {
      toast.error(errMsg(err));
    }
    setBusy(false);
  };
  const decide = async (status: 'approved' | 'changes') => {
    setBusy(true);
    try {
      await api.decide(id, {token, status});
      await reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
    setBusy(false);
  };

  return (
    <div className="min-h-full bg-field">
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-background sm:border-x">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Play className="size-4 fill-current" />
          </span>
          <div className="min-w-0">
            <h1 dir="auto" className="font-title truncate text-sm">
              {review ? `${review.title} · v${review.v}` : 'Client review'}
            </h1>
            <p className="text-xs text-muted-foreground">Leave comments at any moment of the video</p>
          </div>
        </header>

        {loading && !review && (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="aspect-[9/16] w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        )}
        {error && !review && (
          <div role="alert" className="m-4 rounded-xl border bg-card p-4 text-center">
            <p className="font-title text-lg">This review link is not valid</p>
            <p className="mt-2 text-sm text-muted-foreground">It may have expired or been copied incompletely. Ask the studio for a new link.</p>
          </div>
        )}

        {review && (
          <div className="flex flex-1 flex-col gap-4 p-4">
            {review.video ? (
              <video ref={video} src={review.video} poster={review.cover} controls playsInline preload="metadata" onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} className="max-h-[58vh] w-full rounded-xl bg-black object-contain" />
            ) : (
              <div className="grid aspect-[9/16] max-h-[60vh] w-full place-items-center rounded-xl bg-card text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> The video is still rendering
                </span>
              </div>
            )}

            {review.approval && (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">
                <Check className="size-4 shrink-0" />
                {review.approval.status === 'approved' ? 'You approved this video. Thank you!' : 'Changes requested. The studio will update the video.'}
              </p>
            )}

            <form onSubmit={send} className="flex flex-col gap-3">
              <label htmlFor="rv-name" className="text-xs text-muted-foreground">
                Your name
              </label>
              <Input id="rv-name" dir="auto" value={name} onChange={(e) => saveName(e.target.value)} placeholder="Optional" />
              <label htmlFor="rv-comment" className="text-xs text-muted-foreground">
                Comment at <b className="text-foreground">{mmss(time)}</b>
              </label>
              <div className="flex gap-2">
                <Input id="rv-comment" dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder="What should change here?" />
                <Button type="submit" size="icon" aria-label="Send comment" disabled={busy || !text.trim()}>
                  <Send />
                </Button>
              </div>
            </form>

            <section aria-label="Comments" className="flex flex-col gap-3">
              <h2 className="font-title text-sm">Comments · {review.comments.length}</h2>
              {review.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              {review.comments.map((c) => (
                <div key={c.id} className="flex gap-3 rounded-lg border bg-card p-3 text-sm">
                  <button
                    type="button"
                    aria-label={`Jump to ${mmss(c.time)}`}
                    className="h-fit rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                    onClick={() => {
                      if (video.current) video.current.currentTime = c.time;
                    }}
                  >
                    {mmss(c.time)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="break-words">
                      {c.text}
                    </p>
                    <p dir="auto" className="text-xs text-muted-foreground">
                      {c.author}
                    </p>
                  </div>
                </div>
              ))}
            </section>

            <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto grid grid-cols-2 gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
              <Button variant="outline" disabled={busy} onClick={() => void decide('changes')}>
                Request changes
              </Button>
              <Button className="font-title" disabled={busy} onClick={() => void decide('approved')}>
                Approve
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
