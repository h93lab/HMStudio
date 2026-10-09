import type {ZodType} from 'zod';
import {sceneSchema, type Scene} from '../../../../src/schema';
import {elementOf, enumValues, kindOf, shapeOf} from './schemaForm';

// Fields the pipeline owns (voice timing, captions) are never edited by hand.
export const HIDDEN = new Set(['type', 'audio', 'captions']);
const sceneOptions = (sceneSchema as unknown as {options: ZodType[]}).options;
const literalOf = (o: ZodType) => (shapeOf(o).type as unknown as {_zod: {def: {values: string[]}}})._zod.def.values[0];
export const shapeFor = (type: string) => shapeOf(sceneOptions.find((o) => literalOf(o) === type)!);
export const sceneTypes = sceneOptions.map(literalOf);

// Starter content when adding a scene; the owner (or AI rewrite) fills it.
export const blank = (type: string): Scene => {
  const s: Record<string, unknown> = {type, duration: 90};
  for (const [k, f] of Object.entries(shapeFor(type))) {
    if (HIDDEN.has(k) || ['duration', 'camera', 'background', 'voiceover', 'icons'].includes(k)) continue;
    const kind = kindOf(f);
    s[k] =
      kind === 'number'
        ? 1
        : kind === 'array'
          ? kindOf(elementOf(f)) === 'object'
            ? [{label: 'A', value: 1}, {label: 'B', value: 2}]
            : ['…', '…']
          : kind === 'enum'
            ? enumValues(f)[0]
            : ['image', 'video', 'url', 'emphasis', 'prefix', 'suffix', 'role', 'name'].includes(k)
              ? ''
              : '…';
  }
  return s as Scene;
};

// Locks are JSON pointers (/scenes/2/title); reordering scenes must carry them along.
export const moveLocks = (locks: string[], map: (i: number) => number | null) =>
  locks.flatMap((l) => {
    const m = l.match(/^\/scenes\/(\d+)(\/.*)$/);
    if (!m) return [l];
    const to = map(Number(m[1]));
    return to === null ? [] : [`/scenes/${to}${m[2]}`];
  });

// Short human label for a scene (timeline + media list).
export const sceneLabel = (s: Scene) => {
  const r = s as Record<string, unknown>;
  return String(r.title ?? r.text ?? r.name ?? r.quote ?? r.label ?? s.type);
};
