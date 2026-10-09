import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {fitText} from '@remotion/layout-utils';
import {formatNumber, useTheme} from '../design/theme';
import {useLayout} from './Frame';

export const Counter: React.FC<{value: number; prefix: string; suffix: string; delay?: number; duration?: number}> = ({value, prefix, suffix, delay = 0, duration = 45}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const {u, contentWidth} = useLayout();
  const n = interpolate(frame - delay, [0, duration / theme.motion.speed], [0, value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  // Size for the final number so the counter never grows past the frame while counting.
  const finalText = `${prefix}${formatNumber(value, theme)}${suffix}`;
  const fit = fitText({text: finalText, withinWidth: contentWidth * 0.95, fontFamily: theme.fontFamily, fontWeight: 700, fontVariantNumeric: 'tabular-nums'}).fontSize;
  return (
    <div
      dir={theme.direction}
      style={{
        fontFamily: theme.fontFamily,
        fontSize: Math.min(260 * u, fit),
        fontWeight: 700,
        lineHeight: 1.1,
        backgroundImage: `linear-gradient(135deg, ${theme.colors.text}, ${theme.colors.primary})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {prefix}
      {formatNumber(n, theme)}
      {suffix}
    </div>
  );
};
