import {evolvePath} from '@remotion/paths';
import {interpolate} from 'remotion';
import type {iconNames} from '../schema';
import {alpha, useEnter, useTheme, useUnit} from '../design/theme';

// 24×24 line icons (single stroke paths) so they can be "drawn on" with evolvePath.
const PATHS: Record<(typeof iconNames)[number], string> = {
  bolt: 'M13 2 L4 14 H12 L11 22 L20 10 H12 Z',
  shield: 'M12 2 L20 5 V11 C20 16 16.5 20 12 22 C7.5 20 4 16 4 11 V5 Z M8.5 12 L11 14.5 L15.5 9.5',
  chart: 'M4 20 V4 M4 20 H20 M8 16 V11 M12 16 V7 M16 16 V13',
  clock: 'M12 3 A9 9 0 1 1 11.99 3 M12 7 V12 L15.5 14',
  globe: 'M12 3 A9 9 0 1 1 11.99 3 M3 12 H21 M12 3 C15 6 15 18 12 21 C9 18 9 6 12 3',
  lock: 'M6 11 H18 V21 H6 Z M8.5 11 V8 A3.5 3.5 0 0 1 15.5 8 V11',
  star: 'M12 3 L14.6 9 L21 9.6 L16.2 13.8 L17.6 20.2 L12 16.9 L6.4 20.2 L7.8 13.8 L3 9.6 L9.4 9 Z',
  heart: 'M12 20 C5 15 3 11.5 3 8.5 A4.5 4.5 0 0 1 12 6.5 A4.5 4.5 0 0 1 21 8.5 C21 11.5 19 15 12 20 Z',
  rocket: 'M12 2 C16 5 17 10 15 15 H9 C7 10 8 5 12 2 Z M9 15 L6 19 L9 18 M15 15 L18 19 L15 18 M12 8 A1.5 1.5 0 1 1 11.99 8',
  check: 'M4 12.5 L9.5 18 L20 6',
  users: 'M9 11 A3.5 3.5 0 1 1 8.99 11 M2.5 20 C3.5 16 6 14.5 9 14.5 C12 14.5 14.5 16 15.5 20 M16 4.5 A3 3 0 0 1 16 10.5 M18 14 C20 14.8 21.2 16.5 21.5 19',
  phone: 'M7 2 H17 V22 H7 Z M10.5 18.5 H13.5',
  camera: 'M3 7 H7 L9 4.5 H15 L17 7 H21 V19 H3 Z M12 9.5 A3.5 3.5 0 1 1 11.99 9.5',
  card: 'M3 6 H21 V18 H3 Z M3 10 H21 M6.5 14.5 H10',
  cloud: 'M7 18 A4.5 4.5 0 0 1 7.5 9 A5.5 5.5 0 0 1 18 10 A4 4 0 0 1 17.5 18 Z',
  spark: 'M12 3 V8 M12 16 V21 M3 12 H8 M16 12 H21 M5.6 5.6 L9 9 M15 15 L18.4 18.4 M18.4 5.6 L15 9 M9 15 L5.6 18.4',
};

export const DrawIcon: React.FC<{name: (typeof iconNames)[number]; delay?: number; size?: number}> = ({name, delay = 0, size = 56}) => {
  const {colors} = useTheme();
  const u = useUnit();
  const p = useEnter(delay);
  const d = PATHS[name];
  const s = size * u;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{flexShrink: 0, overflow: 'visible', filter: `drop-shadow(0 0 ${8 * u}px ${alpha(colors.accent, 0.7)})`}}>
      <path d={d} fill="none" stroke={colors.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...evolvePath(Math.min(1, Math.max(0, p)), d)} />
    </svg>
  );
};

// Hand-drawn style accent under/around the emphasis of a statement, drawn on after the text lands.
export const AccentStroke: React.FC<{kind: 'underline' | 'bracket' | 'glow'; delay?: number; width: number}> = ({kind, delay = 0, width}) => {
  const {colors} = useTheme();
  const u = useUnit();
  const p = Math.min(1, Math.max(0, useEnter(delay)));
  if (kind === 'glow') {
    return <div style={{width: width * p, height: 6 * u, borderRadius: 6 * u, background: colors.accent, boxShadow: `0 0 ${30 * u}px ${8 * u}px ${alpha(colors.accent, 0.6)}`, opacity: interpolate(p, [0, 1], [0, 1])}} />;
  }
  const d = kind === 'underline' ? 'M2 14 C40 4 80 4 120 10 S180 16 198 6' : 'M2 2 V20 H198 V2';
  return (
    <svg width={width} height={width * (kind === 'underline' ? 0.1 : 0.12)} viewBox="0 0 200 24" preserveAspectRatio="none" style={{overflow: 'visible'}}>
      <path d={d} fill="none" stroke={colors.accent} strokeWidth={kind === 'underline' ? 5 : 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" {...evolvePath(p, d)} style={{filter: `drop-shadow(0 0 6px ${alpha(colors.accent, 0.6)})`}} />
    </svg>
  );
};
