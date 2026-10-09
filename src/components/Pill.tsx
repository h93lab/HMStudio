import {alpha, isArabic, localizeDigits, useEnter, useTheme, useUnit} from '../design/theme';

export const Pill: React.FC<{text: string; delay?: number}> = ({text, delay = 0}) => {
  const {colors, fontFamily, numerals} = useTheme();
  const u = useUnit();
  const p = useEnter(delay);
  return (
    <div
      dir={isArabic(text) ? 'rtl' : 'ltr'}
      style={{
        alignSelf: 'flex-start',
        fontFamily,
        fontSize: 34 * u,
        fontWeight: 700,
        color: colors.accent,
        padding: `${14 * u}px ${34 * u}px`,
        borderRadius: 999,
        border: `${2 * u}px solid ${alpha(colors.accent, 0.4)}`,
        background: `${alpha(colors.accent, 0.08)}`,
        opacity: p,
        transform: `scale(${0.8 + p * 0.2})`,
      }}
    >
      {localizeDigits(text, numerals)}
    </div>
  );
};
