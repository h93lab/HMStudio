import type {ClientProfile, Theme} from '@/lib/api';
import {isHex} from './contrast';

export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const COLOR_KEYS = ['background', 'surface', 'primary', 'accent', 'text', 'muted'] as const;

export const DEFAULT_THEME = (name: string): Theme => ({
  client: name,
  direction: 'rtl',
  numerals: 'latn',
  font: 'IBM Plex Sans Arabic',
  displayFont: 'none',
  logo: '',
  colors: {background: '#0b0b0d', surface: '#ffffff12', primary: '#dcff2a', accent: '#22d3ee', text: '#f5f7ff', muted: '#9aa0b8'},
  radius: 24,
  glow: 0.5,
  motion: {speed: 1, damping: 30},
});

const cssColor = /^(rgba?|hsla?)\([^)]*\)$/i;

// Returns the first problem that would make the server reject the theme, or null.
export const validateTheme = (t: Theme): string | null => {
  if (!t.client.trim()) return 'Client name is required';
  for (const k of COLOR_KEYS) {
    const c = t.colors[k];
    if (!isHex(c) && !(k === 'surface' && cssColor.test(c.trim()))) return `${k} must be a hex color like #1a2b3c`;
  }
  return null;
};

export const profileMeta = (c: ClientProfile) => `${c.theme.direction === 'rtl' ? 'RTL' : 'LTR'} · ${c.theme.font} · ${c.videos} ${c.videos === 1 ? 'video' : 'videos'}`;
