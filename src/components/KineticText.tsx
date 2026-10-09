import {interpolate} from 'remotion';
import {fitTextOnNLines} from '@remotion/layout-utils';
import {alpha, isArabic, localizeDigits, useEnter, usePack, useTheme} from '../design/theme';
import {useLayout} from './Frame';
import {useBeatPulse} from './Beat';
import {qaWarn} from '../qa';

type Props = {
  text: string;
  size: number; // max font size at 1080 unit; shrinks to fit `maxLines`
  maxLines?: number;
  width?: number;
  delay?: number;
  weight?: 400 | 700;
  color?: string;
  gradient?: boolean;
  emphasis?: string;
  align?: 'start' | 'center';
};

// Titles (big, bold) use the display font and the pack's hero treatments; body copy stays in the brand font.
const isTitle = (size: number, weight: number) => size >= 80 && weight === 700;

// Word-by-word reveal. Splits on words, never letters: per-letter spans break Arabic glyph joining.
export const KineticText: React.FC<Props> = ({text: raw, size, maxLines = 3, width, delay = 0, weight = 700, color, gradient, emphasis, align = 'start'}) => {
  const theme = useTheme();
  const pack = usePack();
  const text = localizeDigits(raw, theme.numerals);
  const {u, contentWidth} = useLayout();
  const title = isTitle(size, weight);
  const fontFamily = title ? theme.displayFamily : theme.fontFamily;
  const arabic = isArabic(text);
  const tracking = title && !arabic ? pack.tracking : 0; // letter-spacing breaks Arabic joining
  const boxWidth = (width ?? contentWidth) * 0.96;
  const {fontSize} = fitTextOnNLines({text, maxLines, maxBoxWidth: boxWidth, fontFamily, fontWeight: weight, maxFontSize: size * u, letterSpacing: `${tracking}em`});
  if (fontSize < size * u * 0.55) qaWarn(`text shrunk to ${Math.round(fontSize / u)}px (designed ${size}px) to fit: "${text.slice(0, 40)}" (shorten it)`);
  const words = text.split(/\s+/).filter(Boolean);
  const rawWords = raw.split(/\s+/).filter(Boolean); // digit localization keeps word positions, so emphasis matches on the originals
  const clean = (w: string) => w.replace(/[.,!?؟،:]/g, '');
  const hot = new Set((emphasis ?? '').split(/\s+/).map(clean).filter(Boolean));
  const chroma = title ? pack.finish.chroma * 3 * u : 0;
  return (
    // Word order follows the text's own script, so Arabic copy stays correct inside an LTR brand (and vice versa).
    <div
      dir={arabic ? 'rtl' : 'ltr'}
      style={{fontFamily, fontSize, fontWeight: weight, lineHeight: 1.3, letterSpacing: `${tracking}em`, color: color ?? theme.colors.text, textAlign: align, width: width ?? '100%'}}
    >
      {words.map((word, i) => (
        <span key={i}>
          <Word word={word} delay={delay + i * pack.stagger.each} gradient={gradient} hot={!gradient && hot.has(clean(rawWords[i] ?? word))} chroma={chroma} rtl={arabic} />{' '}
        </span>
      ))}
    </div>
  );
};

// `hot` = emphasis: one solid accent so a highlighted phrase reads as one unit; it also pulses on music beats.
const Word: React.FC<{word: string; delay: number; gradient?: boolean; hot?: boolean; chroma: number; rtl: boolean}> = ({word, delay, gradient, hot, chroma, rtl}) => {
  const {colors} = useTheme();
  const {reveal} = usePack();
  const p = useEnter(delay);
  const beat = useBeatPulse();
  const q = Math.min(1, Math.max(0, p));
  const motion: React.CSSProperties =
    reveal === 'rise'
      ? {transform: `translateY(${interpolate(q, [0, 1], [0.7, 0])}em)`, opacity: q}
      : reveal === 'wipe'
        ? {clipPath: rtl ? `inset(-0.2em 0 -0.2em ${(1 - q) * 100}%)` : `inset(-0.2em ${(1 - q) * 100}% -0.2em 0)`, opacity: q > 0 ? 1 : 0}
        : reveal === 'scale'
          ? {transform: `scale(${interpolate(p, [0, 1], [0.55, 1])})`, opacity: q}
          : {transform: `translateY(${interpolate(q, [0, 1], [0.4, 0])}em)`, filter: `blur(${interpolate(q, [0, 1], [10, 0])}px)`, opacity: q};
  const shadows = [
    ...(chroma > 0 ? [`${chroma}px 0 rgba(255,40,120,0.45)`, `${-chroma}px 0 rgba(0,220,255,0.45)`] : []),
    ...(hot ? [`0 0 ${40 + beat * 30}px ${alpha(colors.accent, 0.4 + beat * 0.3)}`] : []),
  ];
  return (
    <span
      style={{
        display: 'inline-block',
        ...motion,
        ...(shadows.length && !gradient ? {textShadow: shadows.join(', ')} : {}),
        ...(hot && {color: colors.accent}),
        ...(gradient && {
          // Vertical gradient: every word gets the same look (a horizontal one restarts per word).
          backgroundImage: `linear-gradient(180deg, ${colors.accent} 0%, ${colors.primary} 100%)`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          ...(chroma > 0 ? {filter: `drop-shadow(${chroma}px 0 rgba(255,40,120,0.45)) drop-shadow(${-chroma}px 0 rgba(0,220,255,0.45))`} : {}),
        }),
      }}
    >
      {word}
    </span>
  );
};
