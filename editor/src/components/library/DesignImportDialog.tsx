import {useRef, useState} from 'react';
import {Loader2, Upload} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {api, type DesignImport, type Theme} from '@/lib/api';
import {cn} from '@/lib/utils';
import {COLOR_KEYS} from './brand';
import {errMsg, formatBytes} from './common';

const EXT = ['.zip', '.md', '.markdown', '.css', '.json', '.html', '.htm', '.txt'];
const MAX = 20 * 1024 * 1024;

const Swatch: React.FC<{color: string}> = ({color}) => <span aria-hidden className="inline-block size-5 shrink-0 rounded-md border" style={{background: color}} />;

const Compare: React.FC<{label: string; before: React.ReactNode; after: React.ReactNode; changed: boolean}> = ({label, before, after, changed}) => (
  <div className={cn('grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1.5 text-xs', changed && 'bg-primary/10')}>
    <span className="capitalize text-muted-foreground">{label}</span>
    <span className="flex min-w-0 items-center gap-1.5">{before}</span>
    <span className="flex min-w-0 items-center gap-1.5">{after}</span>
  </div>
);

export const DesignImportDialog: React.FC<{open: boolean; onOpenChange: (o: boolean) => void; clientId: string; current: Theme; onApply: (t: Theme) => void}> = ({open, onOpenChange, clientId, current, onApply}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DesignImport>();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const close = (o: boolean) => {
    if (busy) return;
    if (!o) {
      setResult(undefined);
      setError('');
    }
    onOpenChange(o);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!EXT.some((x) => file.name.toLowerCase().endsWith(x))) return setError(`Unsupported file type. Use ${EXT.join(', ')}`);
    if (file.size > MAX) return setError(`File is ${formatBytes(file.size)}; the limit is 20 MB`);
    setError('');
    setBusy(true);
    try {
      setResult(await api.importDesignSystem(clientId, file));
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy(false);
  };

  const t = result?.theme;
  const txt = (v: string) => <span className="truncate" dir="auto">{v}</span>;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import design system</DialogTitle>
          <DialogDescription>Export the design system from Claude Design and upload it here.</DialogDescription>
        </DialogHeader>
        {busy ? (
          <div role="status" className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            AI is reading your design system…
            <span className="text-xs">This can take up to a minute.</span>
          </div>
        ) : t && result ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <div className="grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
                <span />
                <span>Current</span>
                <span>Imported</span>
              </div>
              {COLOR_KEYS.map((k) => (
                <Compare key={k} label={k} changed={current.colors[k] !== t.colors[k]} before={<><Swatch color={current.colors[k]} />{txt(current.colors[k])}</>} after={<><Swatch color={t.colors[k]} />{txt(t.colors[k])}</>} />
              ))}
              <Compare label="Body font" changed={current.font !== t.font} before={txt(current.font)} after={txt(t.font)} />
              <Compare label="Title font" changed={current.displayFont !== t.displayFont} before={txt(current.displayFont)} after={txt(t.displayFont)} />
              <Compare label="Radius" changed={current.radius !== t.radius} before={txt(`${current.radius}px`)} after={txt(`${t.radius}px`)} />
            </div>
            {result.notes.length > 0 && (
              <ul aria-label="AI notes" className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {result.notes.map((n, i) => (
                  <li key={i} dir="auto">
                    {n}
                  </li>
                ))}
              </ul>
            )}
            {result.source.length > 0 && (
              <p className="text-xs text-muted-foreground" dir="auto">
                Read: {result.source.join(', ')}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Applying only fills the editor. Press Save on the client to keep it.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onApply(t);
                  close(false);
                }}
              >
                Apply
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                void upload(e.dataTransfer.files[0]);
              }}
              className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/50', over && 'border-primary bg-primary/10')}
            >
              <Upload className="size-5" />
              <span>Drop a file here or click to choose</span>
              <span className="text-xs">{EXT.join(' ')} · up to 20 MB</span>
              <input ref={input} type="file" accept={EXT.join(',')} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
