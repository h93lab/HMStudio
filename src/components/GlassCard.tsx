import {interpolate} from 'remotion';
import {alpha, useEnter, useTheme, useUnit} from '../design/theme';

// Frosted card that slides in from the reading-start side (right in RTL, left in LTR).
export const GlassCard: React.FC<{delay?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({delay = 0, children, style}) => {
  const {colors, radius, isRtl} = useTheme();
  const u = useUnit();
  const p = useEnter(delay);
  const from = (isRtl ? 160 : -160) * u;
  return (
    <div
      style={{
        background: colors.surface,
        border: `${Math.max(1, 2 * u)}px solid ${alpha(colors.muted, 0.2)}`,
        borderRadius: radius * u,
        boxShadow: `0 ${30 * u}px ${80 * u}px -${30 * u}px ${alpha(colors.primary, 0.4)}, inset 0 1px 0 ${alpha(colors.text, 0.08)}`,
        padding: 36 * u,
        opacity: p,
        transform: `translateX(${interpolate(p, [0, 1], [from, 0])}px) scale(${interpolate(p, [0, 1], [0.94, 1])})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
