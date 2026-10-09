import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {cn} from '@/lib/utils';
import type {Format, RunStatus} from '@/lib/api';
import {useEffect, useRef} from 'react';

export const FORMATS: Format[] = ['9:16', '1:1', '4:5', '16:9'];

const DOT: Record<RunStatus, string> = {running: 'bg-primary', waiting: 'bg-muted-foreground', done: 'bg-chart-2', failed: 'bg-destructive', cancelled: 'bg-muted-foreground'};
const TEXT: Record<RunStatus, string> = {running: 'text-primary', waiting: 'text-muted-foreground', done: 'text-chart-2', failed: 'text-destructive', cancelled: 'text-muted-foreground'};
export const statusText = (s: RunStatus) => TEXT[s];

export const StatusDot: React.FC<{status: RunStatus; className?: string}> = ({status, className}) => (
  <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT[status], status === 'running' && 'animate-pulse', className)} />
);

export const Field: React.FC<{label: string; htmlFor: string; hint?: string; className?: string; children: React.ReactNode}> = ({label, htmlFor, hint, className, children}) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
      {label}
    </Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const NONE = '__none__';
// Select that allows an empty value (Radix forbids empty item values).
export const SimpleSelect: React.FC<{id: string; value: string; onChange: (v: string) => void; options: {value: string; label: string}[]; emptyLabel?: string; className?: string}> = ({id, value, onChange, options, emptyLabel, className}) => (
  <Select value={value === '' && emptyLabel ? NONE : value} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
    <SelectTrigger id={id} className={cn('w-full bg-[#141415]', className)}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const LogView: React.FC<{log?: string; className?: string}> = ({log, className}) => {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);
  return (
    <pre ref={ref} tabIndex={0} aria-label="Run log" className={cn('overflow-auto rounded-lg bg-[#141415] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground', className)}>
      {log || 'No log yet.'}
    </pre>
  );
};
