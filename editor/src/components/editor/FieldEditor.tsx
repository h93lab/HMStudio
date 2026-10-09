import type {ZodType} from 'zod';
import {Lock, LockOpen, Plus, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {Field} from '@/components/kit';
import {cn} from '@/lib/utils';
import {describe, elementOf, enumValues, kindOf, maxOf, shapeOf} from './schemaForm';

const DEFAULT = '__default'; // Radix Select cannot hold an empty value

type Props = {name: string; schema: ZodType; value: unknown; onChange: (v: unknown) => void; locked: boolean; onToggleLock: () => void};

// One form field generated from the zod schema of the selected scene; the lock keeps AI revisions away from it.
export const FieldEditor: React.FC<Props> = ({name, schema, value, onChange, locked, onToggleLock}) => {
  const kind = kindOf(schema);
  const max = maxOf(schema);
  const id = `f-${name}`;
  const aside = (
    <span className="flex items-center gap-1">
      {max && typeof value === 'string' ? <span className={cn('tabular-nums', value.length > max && 'text-destructive')}>{value.length}/{max}</span> : null}
      <Button type="button" variant="ghost" size="icon-xs" onClick={onToggleLock} aria-label={locked ? `Unlock ${name}` : `Lock ${name}`} title={locked ? 'Locked: AI keeps this field' : 'Unlocked'} className={cn(locked && 'text-primary')}>
        {locked ? <Lock /> : <LockOpen />}
      </Button>
    </span>
  );
  const label = <span className="capitalize">{name}</span>;
  const wrap = (children: React.ReactNode, hint?: React.ReactNode) => (
    <Field label={label} htmlFor={id} aside={aside} hint={hint}>
      {children}
    </Field>
  );

  if (kind === 'enum')
    return wrap(
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
      </Select>,
    );

  if (kind === 'number') return wrap(<Input id={id} type="number" value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />);

  if (kind === 'array') {
    const el = elementOf(schema);
    const list = (value as unknown[]) ?? [];
    const objects = kindOf(el) === 'object';
    const enums = kindOf(el) === 'enum';
    const set = (k: number, v: unknown) => onChange(list.map((x, j) => (j === k ? v : x)));
    return wrap(
      <div className="flex flex-col gap-2">
        {list.map((item, k) => (
          <div key={k} className="flex items-center gap-2">
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
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`Remove ${name} ${k + 1}`} onClick={() => onChange(list.filter((_, j) => j !== k))}>
              <X />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...list, objects ? {label: '…', value: 1} : enums ? enumValues(el)[0] : '…'])}>
          <Plus /> Add
        </Button>
      </div>,
    );
  }

  const long = (max ?? 0) > 60 || name === 'voiceover' || name.endsWith('Prompt');
  const hint = describe(schema);
  return wrap(long ? <Textarea id={id} dir="auto" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /> : <Input id={id} dir="auto" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />, hint && name !== 'duration' ? hint : undefined);
};
