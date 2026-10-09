import type {ZodType} from 'zod';
import {Lock, LockOpen, Plus, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {cn} from '@/lib/utils';
import {describe, elementOf, enumValues, kindOf, maxOf, shapeOf} from './schemaForm';

const DEFAULT = '__default'; // Radix Select cannot hold an empty value

type Props = {name: string; schema: ZodType; value: unknown; onChange: (v: unknown) => void; locked: boolean; onToggleLock: () => void};

// One form field generated from the zod schema of the selected scene; the lock keeps AI revisions away from it.
export const FieldEditor: React.FC<Props> = ({name, schema, value, onChange, locked, onToggleLock}) => {
  const kind = kindOf(schema);
  const max = maxOf(schema);
  const id = `f-${name}`;
  const header = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor={id} className="capitalize">
        {name}
      </label>
      {max && typeof value === 'string' ? <span className={cn(value.length > max && 'text-destructive')}>{value.length}/{max}</span> : null}
      <span className="flex-1" />
      <button type="button" onClick={onToggleLock} aria-label={locked ? `Unlock ${name}` : `Lock ${name}`} title={locked ? 'Locked: AI keeps this field' : 'Unlocked'} className={cn('rounded p-0.5 hover:text-foreground', locked && 'text-primary')}>
        {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
      </button>
    </div>
  );

  if (kind === 'enum')
    return (
      <div className="grid gap-1.5">
        {header}
        <Select value={value ? String(value) : DEFAULT} onValueChange={(v) => onChange(v === DEFAULT ? undefined : v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>Pack default</SelectItem>
            {enumValues(schema).map((o) => (
              <SelectItem key={String(o)} value={String(o)}>
                {String(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );

  if (kind === 'number')
    return (
      <div className="grid gap-1.5">
        {header}
        <Input id={id} type="number" value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    );

  if (kind === 'array') {
    const el = elementOf(schema);
    const list = (value as unknown[]) ?? [];
    const objects = kindOf(el) === 'object';
    const enums = kindOf(el) === 'enum';
    const set = (k: number, v: unknown) => onChange(list.map((x, j) => (j === k ? v : x)));
    return (
      <div className="grid gap-1.5">
        {header}
        {list.map((item, k) => (
          <div key={k} className="flex gap-1.5">
            {objects ? (
              Object.entries(shapeOf(el)).map(([sub, subSchema]) => {
                const num = kindOf(subSchema) === 'number';
                return <Input key={sub} dir="auto" aria-label={`${name} ${k + 1} ${sub}`} type={num ? 'number' : 'text'} placeholder={sub} value={String((item as Record<string, unknown>)[sub] ?? '')} onChange={(e) => set(k, {...(item as object), [sub]: num ? Number(e.target.value) : e.target.value})} />;
              })
            ) : enums ? (
              <Select value={String(item)} onValueChange={(v) => set(k, v)}>
                <SelectTrigger aria-label={`${name} ${k + 1}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {enumValues(el).map((o) => (
                    <SelectItem key={String(o)} value={String(o)}>
                      {String(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input dir="auto" aria-label={`${name} ${k + 1}`} value={String(item)} onChange={(e) => set(k, e.target.value)} />
            )}
            <Button variant="ghost" size="icon" aria-label={`Remove ${name} ${k + 1}`} onClick={() => onChange(list.filter((_, j) => j !== k))}>
              <X />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...list, objects ? {label: '…', value: 1} : enums ? enumValues(el)[0] : '…'])}>
          <Plus /> Add
        </Button>
      </div>
    );
  }

  const long = (max ?? 0) > 60 || name === 'voiceover' || name.endsWith('Prompt');
  const hint = describe(schema);
  return (
    <div className="grid gap-1.5">
      {header}
      {long ? <Textarea id={id} dir="auto" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /> : <Input id={id} dir="auto" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />}
      {hint && name !== 'duration' ? <small className="text-xs text-muted-foreground">{hint}</small> : null}
    </div>
  );
};
