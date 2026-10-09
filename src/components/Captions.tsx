import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {useMemo} from 'react';
import type {CaptionWord} from '../schema';
import {pageAt, toPages} from '../captions';
import {isArabic, localizeDigits, useTheme, useUnit} from '../design/theme';

// Burned-in captions (social style): one short page at a time, active word lit in the brand color.
export const Captions: React.FC<{words: CaptionWord[]}> = ({words}) => {
  const frame = useCurrentFrame();
  const {fps, height, width} = useVideoConfig();
  const u = useUnit();
  const {colors, fontFamily, numerals} = useTheme();
  const pages = useMemo(() => toPages(words), [words]);
  const ms = (frame / fps) * 1000;
  const page = pageAt(pages, ms);
  if (!page) return null;
  const text = page.words.map((w) => w.text).join(' ');
  const pop = interpolate(ms - page.startMs, [0, 120], [0.9, 1], {extrapolateRight: 'clamp'});
  const portrait = height > width;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height * (portrait ? 0.12 : 0.08), pointerEvents: 'none'}}>
      <div
        dir={isArabic(text) ? 'rtl' : 'ltr'}
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 62 * u,
          lineHeight: 1.35,
          textAlign: 'center',
          maxWidth: width * 0.84,
          padding: `${14 * u}px ${30 * u}px`,
          borderRadius: 24 * u,
          background: 'rgba(0,0,0,0.45)',
          transform: `scale(${pop})`,
          textShadow: '0 4px 18px rgba(0,0,0,0.6)',
        }}
      >
        {page.words.map((w, i) => {
          const active = ms >= w.startMs && ms < w.endMs + 80;
          return (
            <span key={i} style={{color: active ? colors.accent : colors.text, opacity: ms >= w.startMs ? 1 : 0.55}}>
              {localizeDigits(w.text, numerals)}{' '}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
