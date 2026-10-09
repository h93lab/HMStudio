// WCAG contrast helpers for the brand editor.
export const isHex = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim());

const rgb = (c: string): [number, number, number] | null => {
  if (!isHex(c)) return null;
  let h = c.trim().slice(1);
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const contrast = (a: string, b: string): number | null => {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return null;
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

// Native color inputs only take #rrggbb.
export const toInputHex = (c: string) => {
  const v = rgb(c);
  return v ? `#${v.map((n) => n.toString(16).padStart(2, '0')).join('')}` : '#000000';
};
