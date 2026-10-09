import {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, isHtmlInCanvasSupported, staticFile, type CalculateMetadataFunction} from 'remotion';
import {TransitionSeries, linearTiming, type TransitionPresentation} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {wipe} from '@remotion/transitions/wipe';
import {iris} from '@remotion/transitions/iris';
import {clockWipe} from '@remotion/transitions/clock-wipe';
import {pushCut} from '@remotion/transitions/push-cut';
import {zoomBlur} from '@remotion/transitions/zoom-blur';
import {crossZoom} from '@remotion/transitions/cross-zoom';
import {linearBlur} from '@remotion/transitions/linear-blur';
import {filmBurn} from '@remotion/transitions/film-burn';
import {FPS, TRANSITION, formats, sceneStarts, totalDuration, type VideoProps} from '../schema';
import {packs, type Pack, type TransitionName} from '../design/packs';
import {PackProvider, ThemeProvider, displayFontName} from '../design/theme';
import {loadBrandFont} from '../design/fonts';
import {SceneBackground} from '../components/Backgrounds';
import {Camera} from '../components/Camera';
import {Finish} from '../components/Finish';
import {CaptionSpace} from '../components/Frame';
import {Captions} from '../components/Captions';
import {BeatProvider, SceneStart} from '../components/Beat';
import {SceneView} from '../scenes/scenes';

export {videoSchema} from '../schema';

export const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({props}) => ({
  durationInFrames: Math.max(1, totalDuration(props.scenes)),
  fps: FPS,
  ...formats[props.format],
});

// Text fitting measures glyphs, so nothing renders until the brand + title fonts are really loaded.
const FontGate: React.FC<{fonts: Parameters<typeof loadBrandFont>[0][]; children: React.ReactNode}> = ({fonts, children}) => {
  const [ready, setReady] = useState(false);
  const key = fonts.join('|');
  const [handle] = useState(() => delayRender(`fonts ${key}`));
  useEffect(() => {
    Promise.all(fonts.map((f) => loadBrandFont(f).waitUntilDone()))
      .catch((e) => console.warn(`font ${key} failed to load, using fallback`, e))
      .finally(() => {
        setReady(true);
        continueRender(handle);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handle]);
  return ready ? <>{children}</> : null;
};

type Presentation = TransitionPresentation<Record<string, unknown>>;
const SHADER: TransitionName[] = ['zoomBlur', 'crossZoom', 'linearBlur', 'filmBurn'];

const presentation = (name: TransitionName, ctx: {accent: string; enterFrom: 'from-left' | 'from-right'; width: number; height: number; seed: number}): Presentation => {
  // Shader transitions need HTML-in-canvas (on in Remotion's render browser); preview browsers without it get a fade.
  if (SHADER.includes(name) && typeof document !== 'undefined' && !isHtmlInCanvasSupported()) return fade() as unknown as Presentation;
  switch (name) {
    case 'pushCut': return pushCut({flashColor: ctx.accent, flashOpacity: 0.25}) as unknown as Presentation;
    case 'slide': return slide({direction: ctx.enterFrom}) as unknown as Presentation;
    case 'wipe': return wipe({direction: ctx.enterFrom}) as unknown as Presentation;
    case 'fade': return fade() as unknown as Presentation;
    case 'iris': return iris({width: ctx.width, height: ctx.height}) as unknown as Presentation;
    case 'clockWipe': return clockWipe({width: ctx.width, height: ctx.height}) as unknown as Presentation;
    case 'zoomBlur': return zoomBlur({}) as unknown as Presentation;
    case 'crossZoom': return crossZoom({}) as unknown as Presentation;
    case 'linearBlur': return linearBlur({}) as unknown as Presentation;
    case 'filmBurn': return filmBurn({seed: ctx.seed}) as unknown as Presentation;
  }
};

// Data in, video out: scenes with per-scene background + virtual camera, pack transitions, voice, captions, music, SFX and a film finish.
export const SceneEngine: React.FC<VideoProps> = ({theme, style, scenes, showCaptions, music, musicVolume, sfx, format, beats}) => {
  const pack: Pack = packs[style] ?? packs['premium-tech'];
  const {width, height} = formats[format];
  const timing = linearTiming({durationInFrames: TRANSITION});
  const enterFrom = theme.direction === 'rtl' ? 'from-left' : 'from-right';
  const starts = sceneStarts(scenes);
  const hasVoice = scenes.some((s) => s.audio);
  const captionsOn = showCaptions && scenes.some((s) => s.captions?.length);
  const total = totalDuration(scenes);
  const bed = hasVoice ? musicVolume * 0.45 : musicVolume; // duck music under narration
  const musicVolumeAt = (f: number) => bed * interpolate(f, [0, 15, Math.max(16, total - 45), Math.max(17, total)], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fonts = [...new Set([theme.font, displayFontName(theme, pack)])] as Parameters<typeof loadBrandFont>[0][];
  return (
    <ThemeProvider value={theme}>
      <PackProvider value={pack}>
        <FontGate fonts={fonts}>
          <CaptionSpace.Provider value={captionsOn}>
            <BeatProvider beats={beats ?? []}>
              <AbsoluteFill style={{background: theme.colors.background}}>
                <TransitionSeries>
                  {scenes.flatMap((scene, i) => [
                    ...(i > 0
                      ? [<TransitionSeries.Transition key={`t${i}`} timing={timing} presentation={presentation(pack.transitions[(i - 1) % pack.transitions.length], {accent: theme.colors.accent, enterFrom, width, height, seed: i})} />]
                      : []),
                    <TransitionSeries.Sequence key={`s${i}`} durationInFrames={scene.duration}>
                      <SceneStart.Provider value={starts[i]}>
                      <AbsoluteFill style={{background: theme.colors.background, overflow: 'hidden'}}>
                        {scene.type === 'image' || scene.type === 'video' ? null : (
                          <Camera mode={scene.camera ?? pack.camera.mode} intensity={pack.camera.intensity} depth={0.45} seed={i + 7}>
                            <SceneBackground name={scene.background ?? pack.backgrounds[i % pack.backgrounds.length]} seed={i} />
                          </Camera>
                        )}
                        <Camera mode={scene.camera ?? pack.camera.mode} intensity={pack.camera.intensity} seed={i}>
                          <SceneView scene={scene} />
                        </Camera>
                      </AbsoluteFill>
                      </SceneStart.Provider>
                    </TransitionSeries.Sequence>,
                  ])}
                </TransitionSeries>
                <Finish />
                {/* Voice and captions sit outside the transition series so scene motion never affects them. */}
                {scenes.map((scene, i) => (
                  <Sequence key={`a${i}`} from={starts[i]} durationInFrames={scene.duration} layout="none">
                    {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
                    {captionsOn && scene.captions?.length ? <Captions words={scene.captions} /> : null}
                  </Sequence>
                ))}
                {sfx
                  ? starts.slice(1).map((at, i) => (
                      <Sequence key={`x${i}`} from={Math.max(0, at - 4)} durationInFrames={30} layout="none">
                        <Audio src={staticFile('sfx/whoosh.wav')} volume={0.35} />
                      </Sequence>
                    ))
                  : null}
                {music ? <Audio src={staticFile(music)} loop volume={musicVolumeAt} /> : null}
              </AbsoluteFill>
            </BeatProvider>
          </CaptionSpace.Provider>
        </FontGate>
      </PackProvider>
    </ThemeProvider>
  );
};
