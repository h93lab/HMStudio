import {useMemo} from 'react';
import {Player} from '@remotion/player';
import {SceneEngine} from '../../../../src/engine/SceneEngine';
import {FPS, formats, totalDuration} from '../../../../src/schema';
import type {Pack} from '../../../../src/design/packs';
import type {Theme} from '@/lib/api';
import {sampleVideo} from './sample';

export const StylePreview: React.FC<{pack: Pack; theme?: Theme}> = ({pack, theme}) => {
  const props = useMemo(() => sampleVideo(theme, pack), [theme, pack]);
  const {width, height} = formats['9:16'];
  return (
    <div dir="ltr" className="mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl border bg-black">
      <Player component={SceneEngine} inputProps={props} durationInFrames={Math.max(1, totalDuration(props.scenes))} fps={FPS} compositionWidth={width} compositionHeight={height} style={{width: '100%', height: '100%'}} controls loop acknowledgeRemotionLicense />
    </div>
  );
};
