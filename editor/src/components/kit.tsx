import {useEffect, useRef} from 'react';
import {AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import type {RunStatus} from '@/lib/api';
import {cn} from '@/lib/utils';

// The studio's layout kit. Every page builds from these so radius, spacing and type stay identical (see editor/DESIGN.md).

// Page content under the AppShell header: one padding, one vertical rhythm.
export const PageBody: React.FC<{children: React.ReactNode; className?: string}> = ({children, className}) => <div className={cn('flex flex-1 flex-col gap-5 p-4 sm:p-6', className)}>{children}</div>;

// A titled surface. All cards/panels/sections are this: rounded-xl, border, bg-card, p-4, gap-4.
export const Panel: React.FC<{title?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; as?: 'section' | 'div' | 'aside' | 'article'} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({title, meta, actions, children, className, as: Tag = 'section', ...rest}) => (
  <Tag className={cn('flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4', className)} {...rest}>
    {title || meta || actions ? (
      <header className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
        {title ? <h2 className="font-title text-sm">{title}</h2> : null}
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
        {actions ? <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
    ) : null}
    {children}
  </Tag>
);

// Label + control + optional hint, always the same gaps.
export const Field: React.FC<{label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; aside?: React.ReactNode; className?: string; children: React.ReactNode}> = ({label, htmlFor, hint, aside, className, children}) => (
  <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
    </div>
    {children}
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

export type Opt = {value: string; label: string};
const NONE = '__none__'; // Radix forbids empty-string item values
// Select with string values where '' is a real choice (shown as `emptyLabel`).
export const SelectField: React.FC<{id: string; value: string; onChange: (v: string) => void; options: Opt[]; emptyLabel?: string; label?: React.ReactNode; hint?: React.ReactNode; className?: string; size?: 'sm' | 'default'}> = ({id, value, onChange, options, emptyLabel, label, hint, className, size}) => {
  const control = (
    <Select value={value === '' ? NONE : value} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger id={id} size={size} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel !== undefined ? <SelectItem value={NONE}>{emptyLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value || NONE} value={o.value === '' ? NONE : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return label ? (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      {control}
    </Field>
  ) : (
    <div className={className}>{control}</div>
  );
};

// One segmented filter for every list page (Queue status, asset kinds, template categories…).
export const FilterTabs: React.FC<{value: string; onChange: (v: string) => void; items: Opt[]; label: string; className?: string}> = ({value, onChange, items, label, className}) => (
  <div role="tablist" aria-label={label} className={cn('inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted p-1', className)}>
    {items.map((i) => (
      <button
        key={i.value}
        type="button"
        role="tab"
        aria-selected={value === i.value}
        onClick={() => onChange(i.value)}
        className={cn('h-7 rounded-md px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50', value === i.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
      >
        {i.label}
      </button>
    ))}
  </div>
);

// Empty and first-run states: dashed well, optional icon, one line, one action.
export const EmptyState: React.FC<{icon?: React.ReactNode; title: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode; className?: string} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>> = ({icon, title, text, action, className, ...rest}) => (
  <div className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-field/40 px-6 py-12 text-center', className)} {...rest}>
    {icon ? <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</span> : null}
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{title}</p>
      {text ? <p className="max-w-md text-xs text-muted-foreground">{text}</p> : null}
    </div>
    {action}
  </div>
);

export const ErrorBox: React.FC<{message: string; onRetry?: () => void; className?: string}> = ({message, onRetry, className}) => (
  <div role="alert" className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm', className)}>
    <AlertTriangle className="size-4 shrink-0 text-destructive" />
    <span className="min-w-0 flex-1" dir="auto">
      {message}
    </span>
    {onRetry ? (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    ) : null}
  </div>
);

const DOT: Record<RunStatus, string> = {running: 'bg-primary', waiting: 'bg-muted-foreground', done: 'bg-chart-2', failed: 'bg-destructive', cancelled: 'bg-muted-foreground'};
const TEXT: Record<RunStatus, string> = {running: 'text-primary', waiting: 'text-muted-foreground', done: 'text-chart-2', failed: 'text-destructive', cancelled: 'text-muted-foreground'};
export const statusText = (s: RunStatus) => TEXT[s];
export const StatusDot: React.FC<{status: RunStatus; className?: string}> = ({status, className}) => <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', DOT[status], status === 'running' && 'animate-pulse', className)} />;
// Status as text, same casing and size everywhere.
export const StatusLabel: React.FC<{status: RunStatus}> = ({status}) => <span className={cn('text-xs font-semibold uppercase', TEXT[status])}>{status}</span>;

// Small label on top of a thumbnail (scene number, duration, QA score).
export const ThumbBadge: React.FC<{children: React.ReactNode; className?: string}> = ({children, className}) => <span className={cn('rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] leading-none font-medium text-white backdrop-blur-sm', className)}>{children}</span>;

export const LogView: React.FC<{log?: string; className?: string}> = ({log, className}) => {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);
  return (
    <pre ref={ref} tabIndex={0} aria-label="Run log" dir="ltr" className={cn('overflow-auto rounded-lg bg-field p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground', className)}>
      {log || 'No log yet.'}
    </pre>
  );
};
