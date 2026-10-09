import type {ZodType} from 'zod';

// Minimal zod-4 introspection: enough to build forms for our own schemas (strings, numbers, enums, booleans, arrays, objects).
type Def = {type: string; innerType?: ZodType; element?: ZodType; entries?: Record<string, string>; shape?: Record<string, ZodType>; values?: unknown[]};
const def = (s: ZodType) => (s as unknown as {_zod: {def: Def; bag: {maximum?: number; minimum?: number}}})._zod;
export const unwrap = (s: ZodType): {schema: ZodType; optional: boolean} => {
  const d = def(s).def;
  return d.type === 'optional' || d.type === 'default' ? {schema: unwrap(d.innerType!).schema, optional: true} : {schema: s, optional: false};
};
export const kindOf = (s: ZodType) => def(unwrap(s).schema).def.type;
export const maxOf = (s: ZodType) => def(unwrap(s).schema).bag?.maximum;
export const minOf = (s: ZodType) => def(unwrap(s).schema).bag?.minimum;
export const enumValues = (s: ZodType) => Object.values(def(unwrap(s).schema).def.entries ?? {});
export const elementOf = (s: ZodType) => def(unwrap(s).schema).def.element!;
export const shapeOf = (s: ZodType) => (unwrap(s).schema as unknown as {shape: Record<string, ZodType>}).shape;
export const describe = (s: ZodType) => (s as unknown as {description?: string}).description ?? (unwrap(s).schema as unknown as {description?: string}).description;
