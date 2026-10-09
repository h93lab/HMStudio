import {loadFont as cairo} from '@remotion/google-fonts/Cairo';
import {loadFont as plex} from '@remotion/google-fonts/IBMPlexSansArabic';
import {loadFont as tajawal} from '@remotion/google-fonts/Tajawal';
import {loadFont as readex} from '@remotion/google-fonts/ReadexPro';
import {loadFont as almarai} from '@remotion/google-fonts/Almarai';
import {loadFont as reemKufi} from '@remotion/google-fonts/ReemKufi';
import {loadFont as lalezar} from '@remotion/google-fonts/Lalezar';
import {loadFont as changa} from '@remotion/google-fonts/Changa';
import {loadFont as elMessiri} from '@remotion/google-fonts/ElMessiri';
import {loadFont as kufam} from '@remotion/google-fonts/Kufam';
import {loadFont as marhey} from '@remotion/google-fonts/Marhey';
import {loadFont as rakkas} from '@remotion/google-fonts/Rakkas';
import {loadFont as arefRuqaa} from '@remotion/google-fonts/ArefRuqaa';
import type {DisplayFont, fontNames} from '../schema';

type FontName = (typeof fontNames)[number] | Exclude<DisplayFont, 'none'>;

// Arabic + Latin fonts. To add one: add it to `fontNames` in schema.ts and a loader here.
const loaders: Record<FontName, () => {fontFamily: string; waitUntilDone: () => Promise<unknown>}> = {
  'IBM Plex Sans Arabic': () => plex('normal', {weights: ['400', '700'], subsets: ['arabic', 'latin']}),
  Cairo: () => cairo('normal', {weights: ['400', '700'], subsets: ['arabic', 'latin']}),
  Tajawal: () => tajawal('normal', {weights: ['400', '700'], subsets: ['arabic', 'latin']}),
  'Readex Pro': () => readex('normal', {weights: ['400', '700'], subsets: ['arabic', 'latin']}),
  Almarai: () => almarai('normal', {weights: ['400', '700'], subsets: ['arabic']}),
  // Display faces: only the weights each family really has.
  'Reem Kufi': () => reemKufi('normal', {weights: ['700'], subsets: ['arabic', 'latin']}),
  Lalezar: () => lalezar('normal', {weights: ['400'], subsets: ['arabic', 'latin']}),
  Changa: () => changa('normal', {weights: ['700', '800'], subsets: ['arabic', 'latin']}),
  'El Messiri': () => elMessiri('normal', {weights: ['700'], subsets: ['arabic', 'latin']}),
  Kufam: () => kufam('normal', {weights: ['700', '800'], subsets: ['arabic', 'latin']}),
  Marhey: () => marhey('normal', {weights: ['700'], subsets: ['arabic', 'latin']}),
  Rakkas: () => rakkas('normal', {weights: ['400'], subsets: ['arabic', 'latin']}),
  'Aref Ruqaa': () => arefRuqaa('normal', {weights: ['700'], subsets: ['arabic', 'latin']}),
};

const loaded = new Map<FontName, ReturnType<(typeof loaders)[FontName]>>();
export const loadBrandFont = (name: FontName) => {
  if (!loaded.has(name)) loaded.set(name, loaders[name]());
  return loaded.get(name)!;
};
