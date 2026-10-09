import type {DisplayFont} from '../schema';

// Style packs = the motion personality of a video, separate from brand colors (theme).
// Everything here is data so the AI (and the editor) only ever pick a pack by name.

export const packIds = ['premium-tech', 'apple-minimal', 'cyber-neon', 'editorial', 'bold-pop'] as const;
export type PackId = (typeof packIds)[number];

export const backgroundNames = ['orbs', 'grid', 'mesh', 'aurora', 'spotlight', 'minimal'] as const;
export type BackgroundName = (typeof backgroundNames)[number];

export const cameraModes = ['static', 'drift', 'push', 'float'] as const;
export type CameraMode = (typeof cameraModes)[number];

export const transitionNames = ['pushCut', 'slide', 'wipe', 'fade', 'iris', 'clockWipe', 'zoomBlur', 'crossZoom', 'linearBlur', 'filmBurn'] as const;
export type TransitionName = (typeof transitionNames)[number];

export type Bezier = [number, number, number, number];

export type Pack = {
  label: string;
  ease: Bezier; // entrance curve
  overshoot: number; // 0 = none; >0 = back-out overshoot amount
  enterFrames: number; // entrance length at motion.speed = 1
  stagger: {each: number; from: 'start' | 'center' | 'end'};
  camera: {mode: CameraMode; intensity: number};
  transitions: TransitionName[]; // rotated between scenes
  transitionFrames: number;
  backgrounds: BackgroundName[]; // rotated between scenes
  finish: {grain: number; vignette: number; leaks: number; chroma: number};
  reveal: 'blur' | 'rise' | 'wipe' | 'scale';
  displayFont: DisplayFont; // 'none' = brand font for titles too
  tracking: number; // title letter-spacing in em (Latin only; Arabic stays 0 to keep joining)
  accent: 'underline' | 'bracket' | 'glow';
};

export const packs: Record<PackId, Pack> = {
  'premium-tech': {
    label: 'Premium Tech',
    ease: [0.16, 1, 0.3, 1],
    overshoot: 0,
    enterFrames: 22,
    stagger: {each: 3, from: 'start'},
    camera: {mode: 'drift', intensity: 0.6},
    transitions: ['pushCut', 'zoomBlur', 'slide', 'crossZoom', 'wipe'],
    transitionFrames: 18,
    backgrounds: ['orbs', 'grid', 'mesh', 'spotlight'],
    finish: {grain: 0.22, vignette: 0.6, leaks: 0.3, chroma: 0},
    reveal: 'blur',
    displayFont: 'none',
    tracking: -0.01,
    accent: 'underline',
  },
  'apple-minimal': {
    label: 'Apple Minimal',
    ease: [0.25, 1, 0.5, 1],
    overshoot: 0,
    enterFrames: 30,
    stagger: {each: 4, from: 'start'},
    camera: {mode: 'push', intensity: 0.35},
    transitions: ['fade', 'linearBlur', 'fade', 'slide'],
    transitionFrames: 22,
    backgrounds: ['minimal', 'spotlight'],
    finish: {grain: 0.08, vignette: 0.35, leaks: 0, chroma: 0},
    reveal: 'rise',
    displayFont: 'none',
    tracking: -0.02,
    accent: 'underline',
  },
  'cyber-neon': {
    label: 'Cyber Neon',
    ease: [0.34, 1.3, 0.64, 1],
    overshoot: 0.15,
    enterFrames: 16,
    stagger: {each: 2, from: 'center'},
    camera: {mode: 'float', intensity: 0.8},
    transitions: ['zoomBlur', 'pushCut', 'crossZoom', 'filmBurn'],
    transitionFrames: 16,
    backgrounds: ['grid', 'aurora', 'orbs'],
    finish: {grain: 0.32, vignette: 0.7, leaks: 0.15, chroma: 0.6},
    reveal: 'scale',
    displayFont: 'Kufam',
    tracking: 0.02,
    accent: 'glow',
  },
  editorial: {
    label: 'Editorial',
    ease: [0.65, 0, 0.35, 1],
    overshoot: 0,
    enterFrames: 26,
    stagger: {each: 5, from: 'start'},
    camera: {mode: 'push', intensity: 0.25},
    transitions: ['wipe', 'slide', 'iris', 'filmBurn'],
    transitionFrames: 20,
    backgrounds: ['minimal', 'mesh'],
    finish: {grain: 0.4, vignette: 0.45, leaks: 0.5, chroma: 0},
    reveal: 'wipe',
    displayFont: 'El Messiri',
    tracking: 0,
    accent: 'bracket',
  },
  'bold-pop': {
    label: 'Bold Pop',
    ease: [0.34, 1.56, 0.64, 1],
    overshoot: 0.25,
    enterFrames: 14,
    stagger: {each: 2, from: 'start'},
    camera: {mode: 'push', intensity: 0.6},
    transitions: ['pushCut', 'slide', 'clockWipe', 'pushCut'],
    transitionFrames: 14,
    backgrounds: ['mesh', 'aurora'],
    finish: {grain: 0.15, vignette: 0.3, leaks: 0.2, chroma: 0},
    reveal: 'scale',
    displayFont: 'Lalezar',
    tracking: 0,
    accent: 'glow',
  },
};

// Stagger offsets so groups (cards, words, steps) enter as one choreographed motion.
export const staggerDelay = (i: number, n: number, s: Pack['stagger']) =>
  s.from === 'start' ? i * s.each : s.from === 'end' ? (n - 1 - i) * s.each : Math.abs(i - (n - 1) / 2) * s.each;
