import {createContext, useContext} from 'react';
import {useCurrentFrame} from 'remotion';

// Music beat frames (absolute timeline) for beat-synced accents; empty = no pulse.
const BeatContext = createContext<number[]>([]);
export const BeatProvider: React.FC<{beats: number[]; children: React.ReactNode}> = ({beats, children}) => <BeatContext.Provider value={beats}>{children}</BeatContext.Provider>;

// Absolute start frame of the current scene, so scene-local frames can be matched to music beats.
export const SceneStart = createContext(0);

// 1 on a beat, decaying to 0 over `decay` frames.
export const beatPulse = (beats: number[], absFrame: number, decay = 8) => {
  let best = 0;
  for (const b of beats) {
    const d = absFrame - b;
    if (d >= 0 && d < decay) best = Math.max(best, 1 - d / decay);
  }
  return best;
};

export const useBeatPulse = (decay = 8) => beatPulse(useContext(BeatContext), useCurrentFrame() + useContext(SceneStart), decay);
