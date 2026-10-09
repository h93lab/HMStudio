import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';
import type {BackgroundName} from '../design/packs';
import {alpha, useTheme, useUnit} from '../design/theme';

// Per-scene backgrounds. Each is pure CSS/noise (cheap to render) and reads only brand colors.
export const SceneBackground: React.FC<{name: BackgroundName; seed: number}> = ({name, seed}) => {
  switch (name) {
    case 'orbs': return <Orbs seed={seed} />;
    case 'grid': return <GridFloor />;
    case 'mesh': return <Mesh seed={seed} />;
    case 'aurora': return <Aurora seed={seed} />;
    case 'spotlight': return <Spotlight />;
    case 'minimal': return <Minimal />;
  }
};

const Blob: React.FC<{color: string; x: number; y: number; size: number; opacity: number; blur?: number}> = ({color, x, y, size, opacity, blur = 70}) => (
  <div style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%', background: `radial-gradient(circle, ${color} 0%, transparent 65%)`, opacity, filter: `blur(${blur}px)`}} />
);

const Orbs: React.FC<{seed: number}> = ({seed}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const u = useUnit();
  const {colors, glow} = useTheme();
  const size = Math.max(width, height) * 0.5;
  const nx = (k: number) => noise2D(`orb${seed}${k}`, frame / 220, 0) * 160 * u;
  const cell = 90 * u;
  return (
    <AbsoluteFill>
      <Blob color={colors.primary} x={width * 0.2 + nx(1)} y={height * 0.22 + nx(2)} size={size} opacity={glow} />
      <Blob color={colors.accent} x={width * 0.8 + nx(3)} y={height * 0.78 + nx(4)} size={size * 0.9} opacity={glow * 0.8} />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${alpha(colors.muted, 0.13)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(colors.muted, 0.13)} 1px, transparent 1px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `0 ${(frame * 0.3 * u) % cell}px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          opacity: 0.6,
        }}
      />
    </AbsoluteFill>
  );
};

// Perspective floor grid moving toward the viewer + glowing horizon: "cyber" depth with no 3D engine.
const GridFloor: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const u = useUnit();
  const {colors, glow} = useTheme();
  const cell = 110 * u;
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Blob color={colors.primary} x={width / 2} y={height * 0.66} size={width * 1.4} opacity={glow * 0.6} blur={90} />
      <div
        style={{
          position: 'absolute',
          left: -width,
          width: width * 3,
          top: height * 0.7,
          height: height,
          transform: `perspective(${700 * u}px) rotateX(68deg)`,
          transformOrigin: 'top center',
          backgroundImage: `linear-gradient(${alpha(colors.accent, 0.5)} 2px, transparent 2px), linear-gradient(90deg, ${alpha(colors.accent, 0.5)} 2px, transparent 2px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `0 ${(frame * 4 * u) % cell}px`,
          maskImage: 'linear-gradient(to bottom, transparent, black 25%, black 60%, transparent)',
        }}
      />
      <div style={{position: 'absolute', left: 0, right: 0, top: height * 0.7 - 2 * u, height: 3 * u, background: colors.accent, boxShadow: `0 0 ${60 * u}px ${20 * u}px ${alpha(colors.accent, 0.35)}`, opacity: 0.55}} />
    </AbsoluteFill>
  );
};

const Mesh: React.FC<{seed: number}> = ({seed}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {colors, glow} = useTheme();
  const size = Math.max(width, height) * 0.75;
  const p = (k: number, span: number) => noise2D(`mesh${seed}${k}`, frame / 260, k) * span;
  return (
    <AbsoluteFill>
      <Blob color={colors.primary} x={width * 0.25 + p(1, width * 0.2)} y={height * 0.3 + p(2, height * 0.12)} size={size} opacity={glow * 0.9} blur={100} />
      <Blob color={colors.accent} x={width * 0.75 + p(3, width * 0.2)} y={height * 0.45 + p(4, height * 0.12)} size={size * 0.8} opacity={glow * 0.7} blur={100} />
      <Blob color={colors.primary} x={width * 0.5 + p(5, width * 0.25)} y={height * 0.85 + p(6, height * 0.08)} size={size * 0.9} opacity={glow * 0.5} blur={110} />
    </AbsoluteFill>
  );
};

const Aurora: React.FC<{seed: number}> = ({seed}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {colors, glow} = useTheme();
  const band = (k: number, color: string) => {
    const r = noise2D(`aur${seed}${k}`, frame / 300, 0) * 18 - 25 + k * 12;
    return (
      <div
        key={k}
        style={{
          position: 'absolute',
          left: -width * 0.3,
          width: width * 1.6,
          top: height * (0.12 + k * 0.16),
          height: height * 0.22,
          background: `linear-gradient(90deg, transparent, ${alpha(color, 0.85)}, transparent)`,
          transform: `rotate(${r}deg) translateX(${noise2D(`aux${seed}${k}`, frame / 200, 1) * width * 0.1}px)`,
          filter: 'blur(60px)',
          opacity: glow * 0.85,
          mixBlendMode: 'screen',
        }}
      />
    );
  };
  return <AbsoluteFill style={{overflow: 'hidden'}}>{[band(0, colors.primary), band(1, colors.accent), band(2, colors.primary)]}</AbsoluteFill>;
};

// Stage light from above + soft floor pool: product-launch look.
const Spotlight: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {colors, glow} = useTheme();
  const sway = Math.sin(frame / 70) * 4;
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: width / 2 - width,
          top: -height * 0.1,
          width: width * 2,
          height: height * 1.1,
          background: `conic-gradient(from ${180 - 18 + sway}deg at 50% 0%, transparent 0deg, ${alpha(colors.text, 0.16)} 18deg, transparent 36deg)`,
          filter: 'blur(30px)',
        }}
      />
      <div style={{position: 'absolute', left: width * 0.1, right: width * 0.1, bottom: height * 0.12, height: height * 0.12, borderRadius: '50%', background: `radial-gradient(ellipse, ${alpha(colors.primary, 0.5 * glow)}, transparent 70%)`, filter: 'blur(30px)'}} />
    </AbsoluteFill>
  );
};

const Minimal: React.FC = () => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const {colors, glow} = useTheme();
  const shift = interpolate(frame, [0, 300], [0, height * 0.05], {extrapolateRight: 'extend'});
  return <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% ${30 + (shift / height) * 100}%, ${alpha(colors.primary, 0.28 * glow + 0.08)}, transparent 60%)`}} />;
};
