import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';
import type {CameraMode} from '../design/packs';
import {useUnit} from '../design/theme';

// Virtual camera per scene. `depth` < 1 moves a layer less (background parallax), so 2D scenes read as having depth.
export const Camera: React.FC<{mode: CameraMode; intensity: number; depth?: number; seed: number; children: React.ReactNode}> = ({mode, intensity, depth = 1, seed, children}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const u = useUnit();
  const k = intensity * depth;
  const t = frame / Math.max(1, durationInFrames);
  let scale = 1;
  let x = 0;
  let y = 0;
  let rot = 0;
  if (mode === 'drift') {
    scale = 1 + 0.045 * k * t;
    x = noise2D(`cx${seed}`, frame / 120, 0) * 14 * u * k;
    y = noise2D(`cy${seed}`, frame / 140, 1) * 10 * u * k;
    rot = noise2D(`cr${seed}`, frame / 200, 2) * 0.35 * k;
  } else if (mode === 'push') {
    scale = 1 + 0.09 * k * Easing.inOut(Easing.cubic)(t);
  } else if (mode === 'float') {
    y = Math.sin(frame / 22 + seed) * 12 * u * k;
    rot = Math.sin(frame / 45 + seed) * 0.6 * k;
    scale = 1 + 0.03 * k;
  }
  // Zoom-through on the way out hands the motion into the next transition.
  if (mode !== 'static') scale *= interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 1 + 0.06 * k], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`}}>{children}</AbsoluteFill>;
};
