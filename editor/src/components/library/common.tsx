import {useCallback, useEffect, useState} from 'react';
import {AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {cn} from '@/lib/utils';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Loads once (and on reload()); a stale response never overwrites a newer one.
export const useLoad = <T,>(fn: () => Promise<T>, deps: unknown[]) => {
  const [state, setState] = useState<{data?: T; error?: string; loading: boolean}>({loading: true});
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let live = true;
    setState((s) => ({...s, error: undefined, loading: true}));
    run().then(
      (data) => live && setState({data, loading: false}),
      (e) => live && setState({error: errMsg(e), loading: false}),
    );
    return () => void (live = false);
  }, [run, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {...state, reload};
};

export const ErrorBox: React.FC<{message: string; onRetry?: () => void}> = ({message, onRetry}) => (
  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
    <AlertTriangle className="size-4 text-destructive" />
    <span className="flex-1">{message}</span>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);

export const Empty: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="grid place-items-center rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{children}</div>
);

export const Chips: React.FC<{value: string; onChange: (v: string) => void; items: {value: string; label: string}[]; label: string}> = ({value, onChange, items, label}) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
    {items.map((i) => (
      <button
        key={i.value}
        type="button"
        aria-pressed={value === i.value}
        onClick={() => onChange(i.value)}
        className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', value === i.value ? 'border-primary bg-primary font-bold text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
      >
        {i.label}
      </button>
    ))}
  </div>
);

export type Opt = {value: string; label: string};

// Labelled select with string values (Radix forbids empty-string items, so '' is mapped to a sentinel).
const NONE = '__none__';
export const Pick: React.FC<{id: string; label: string; value: string; onChange: (v: string) => void; options: Opt[]; className?: string; hideLabel?: boolean}> = ({id, label, value, onChange, options, className, hideLabel}) => (
  <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
    <Label htmlFor={id} className={cn('text-xs text-muted-foreground', hideLabel && 'sr-only')}>
      {label}
    </Label>
    <Select value={value === '' ? NONE : value} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value === '' ? NONE : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export const formatBytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
};
