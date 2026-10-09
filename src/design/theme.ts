import {createContext, useContext} from 'react';
import {Easing, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Theme} from '../schema';
import {loadBrandFont} from './fonts';
import {packs, type Pack} from './packs';

const ThemeContext = createContext<Theme | null>(null);
export const ThemeProvider = ThemeContext.Provider;

const PackContext = createContext<Pack>(packs['premium-tech']);
export const PackProvider = PackContext.Provider;
export const usePack = () => useContext(PackContext);

// Title font: the brand's explicit display font, else the style pack's, else the body font.
export const displayFontName = (theme: Theme, pack: Pack) =>
  theme.displayFont !== 'none' ? theme.displayFont : pack.displayFont !== 'none' ? pack.displayFont : theme.font;

export const useTheme = () => {
  const theme = useContext(ThemeContext);
  const pack = usePack();
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return {
    ...theme,
    fontFamily: loadBrandFont(theme.font).fontFamily,
    displayFamily: loadBrandFont(displayFontName(theme, pack)).fontFamily,
    isRtl: theme.direction === 'rtl',
  };
};

// Size unit: designs are authored for a 1080px short side, scaled for other formats.
export const useUnit = () => {
  const {width, height} = useVideoConfig();
  return Math.min(width, height) / 1080;
};

// Entrance curve shared by every component: the style pack decides its shape (bezier or overshoot), the theme its speed.
export const enterProgress = (frame: number, pack: Pack, speed: number) => {
  const t = Math.min(1, Math.max(0, (frame * speed) / pack.enterFrames));
  return pack.overshoot > 0 ? Easing.out(Easing.back(pack.overshoot * 10))(t) : Easing.bezier(...pack.ease)(t);
};

export const useEnter = (delay = 0) => {
  const frame = useCurrentFrame();
  const {motion} = useTheme();
  return enterProgress(frame - delay, usePack(), motion.speed);
};

export const formatNumber = (n: number, theme: Theme) =>
  Math.round(n).toLocaleString(`ar-EG-u-nu-${theme.numerals}`);

export const isArabic = (text: string) => /[؀-ۿ]/.test(text);

// Assets can be a public/ path or a full URL.
export const assetSrc = (path: string) => (/^https?:\/\//.test(path) ? path : staticFile(path.replace(/^\/+/, '')));

// Transparent version of any CSS color (hex, rgb(), hsl(), named), unlike appending a hex alpha suffix.
export const alpha = (color: string, amount: number) => `color-mix(in srgb, ${color} ${Math.round(amount * 100)}%, transparent)`;

// Profiles with Arabic-Indic numerals get them everywhere, not only in counters. Latin-only strings (URLs, English) stay as written.
export const localizeDigits = (text: string, numerals: Theme['numerals']) =>
  numerals === 'arab' && isArabic(text) ? text.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]).replace(/%/g, '٪') : text;
