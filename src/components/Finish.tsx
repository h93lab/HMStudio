import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';
import {alpha, usePack, useTheme} from '../design/theme';

// Final "film" layer over everything: grain, vignette and drifting light leaks remove the too-clean CG look.
export const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {finish} = usePack();
  const {colors} = useTheme();
  const leakX = noise2D('leak-x', frame / 180, 0);
  const leakY = noise2D('leak-y', frame / 200, 0);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {finish.leaks > 0 ? (
        <AbsoluteFill style={{mixBlendMode: 'screen', opacity: finish.leaks}}>
          <div style={{position: 'absolute', left: width * (0.75 + leakX * 0.2) - width * 0.4, top: height * (0.05 + leakY * 0.1) - height * 0.2, width: width * 0.8, height: height * 0.45, borderRadius: '50%', background: `radial-gradient(ellipse, ${alpha('#ffb37a', 0.55)}, ${alpha(colors.accent, 0.2)} 45%, transparent 70%)`, filter: 'blur(60px)'}} />
        </AbsoluteFill>
      ) : null}
      {finish.vignette > 0 ? <AbsoluteFill style={{background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${0.75 * finish.vignette}) 100%)`}} /> : null}
      {finish.grain > 0 ? (
        <AbsoluteFill style={{opacity: finish.grain, mixBlendMode: 'overlay'}}>
          {/* Seed changes every 2 frames so grain dances like film, deterministically per frame. */}
          <svg width="100%" height="100%">
            <filter id="grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(frame / 2)} stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#grain)" />
          </svg>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
