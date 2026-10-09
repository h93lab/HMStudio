import {createContext, useContext, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {useTheme, useUnit} from '../design/theme';
import {qaWarn} from '../qa';

// True when burned-in captions are on: scenes keep the bottom band free for them.
export const CaptionSpace = createContext(false);

export const useLayout = () => {
  const {width, height} = useVideoConfig();
  const u = useUnit();
  const captions = useContext(CaptionSpace);
  const portrait = height > width;
  const padX = (portrait ? 90 : 140) * u;
  const padTop = height * (portrait ? 0.12 : 0.1);
  const padBottom = height * (captions ? (portrait ? 0.27 : 0.24) : portrait ? 0.12 : 0.1);
  return {u, width, height, padX, padTop, padBottom, contentWidth: width - padX * 2, contentHeight: height - padTop - padBottom};
};

// Standard scene canvas: safe-area padding, reading direction, vertical rhythm.
// If the content is taller than the safe area (long copy, square/wide formats, captions band), it scales down to fit.
export const Frame: React.FC<{children: React.ReactNode; center?: boolean; bottom?: boolean; gap?: number}> = ({children, center, bottom, gap = 44}) => {
  const {direction} = useTheme();
  const {u, padX, padTop, padBottom, contentHeight} = useLayout();
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const h = inner.current?.offsetHeight ?? 0; // layout height: ignores entrance-animation transforms
    const next = h > contentHeight ? contentHeight / h : 1;
    if (Math.abs(next - fit) > 0.005) setFit(next);
    if (next < 0.85) qaWarn(`content is too tall: scaled to ${Math.round(next * 100)}% to fit the safe area (shorten copy or remove an item)`);
  });
  return (
    <AbsoluteFill dir={direction} style={{padding: `${padTop}px ${padX}px ${padBottom}px`, justifyContent: bottom ? 'flex-end' : 'center'}}>
      <div
        ref={inner}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: center ? 'center' : 'stretch',
          textAlign: center ? 'center' : 'start',
          gap: gap * u,
          transform: fit < 1 ? `scale(${fit})` : undefined,
          transformOrigin: bottom ? 'center bottom' : 'center center',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
