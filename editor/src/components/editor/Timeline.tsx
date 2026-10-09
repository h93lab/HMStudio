import {Lock} from 'lucide-react';
import type {Scene} from '../../../../src/schema';
import {FPS} from '../../../../src/schema';
import {cn} from '@/lib/utils';
import {sceneLabel} from './model';

type Props = {
  scenes: Scene[];
  starts: number[]; // start frame of each scene in the real (overlapping) video
  sel: number;
  frame: number;
  stills: string[];
  locks: string[];
  music: boolean;
  onSelect: (i: number) => void;
  onSeek: (frame: number) => void;
  onResizeStart: (i: number, e: React.PointerEvent) => void;
};

// Deterministic pseudo-waveform: decoration only, the real audio is in the preview.
const wave = (seed: number, n: number) => Array.from({length: n}, (_, i) => 4 + Math.round(Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6 + seed * 2)) * 16));

// Blocks are sized by full scene durations (transitions overlap in the real video), so map frames both ways.
export const Timeline: React.FC<Props> = ({scenes, starts, sel, frame, stills, locks, music, onSelect, onSeek, onResizeStart}) => {
  const full = scenes.reduce((a, s) => a + s.duration, 0) || 1;
  const before = scenes.map((_, i) => scenes.slice(0, i).reduce((a, s) => a + s.duration, 0));
  let at = scenes.length - 1;
  while (at > 0 && frame < starts[at]) at--;
  const playhead = Math.min(1, (before[at] + Math.min(scenes[at]?.duration ?? 0, frame - (starts[at] ?? 0))) / full);
  const seekAt = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * full;
    const i = Math.max(0, before.findLastIndex((b) => b <= x));
    onSeek(Math.round(starts[i] + Math.min(scenes[i].duration - 1, x - before[i])));
  };
  const seconds = Math.ceil(full / FPS);
  const step = seconds > 60 ? 10 : 5;
  const row = 'grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2';
  const label = 'text-[11px] text-muted-foreground';

  return (
    <div className="grid gap-1.5 rounded-xl border bg-panel p-3" dir="ltr">
      <div className={row}>
        <span className="font-mono text-[11px] text-primary">{(frame / FPS).toFixed(1)}s</span>
        <div className="relative flex h-5 cursor-pointer justify-between text-[10px] text-muted-foreground" onClick={seekAt} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={Math.round(frame / FPS)} tabIndex={-1}>
          {Array.from({length: Math.floor(seconds / step) + 1}, (_, k) => (
            <span key={k}>{k * step}s</span>
          ))}
        </div>
      </div>
      <div className="relative grid gap-1.5">
        <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-primary" style={{left: `calc(72px + (100% - 72px) * ${playhead})`}} aria-hidden />
        <div className={row}>
          <span className={label}>Video</span>
          <div className="flex gap-1">
            {scenes.map((s, i) => (
              <div key={i} style={{flex: `${s.duration} 1 0`}} onClick={() => onSelect(i)} className={cn('relative h-11 min-w-0 cursor-pointer overflow-hidden rounded-md border-2 bg-card', i === sel ? 'border-primary' : 'border-transparent')}>
                {stills[i] ? <img src={stills[i]} alt="" className="size-full object-cover" /> : null}
                <span className="absolute left-1 top-0.5 rounded bg-black/60 px-1 text-[10px]">{i + 1}</span>
                {locks.includes(`/scenes/${i}/duration`) ? <Lock className="absolute right-2 top-1 size-3 text-primary" aria-label="Duration locked" /> : null}
                <div onPointerDown={(e) => onResizeStart(i, e)} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-primary/0 hover:bg-primary/60" title="Drag to change duration" aria-label={`Resize scene ${i + 1}`} role="separator" />
              </div>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className={label}>Text</span>
          <div className="flex gap-1">
            {scenes.map((s, i) => (
              <div key={i} style={{flex: `${s.duration} 1 0`}} onClick={() => onSelect(i)} className={cn('hatch flex h-7 min-w-0 cursor-pointer items-center justify-between gap-1 overflow-hidden rounded-md border px-1.5 text-[10px]', i === sel && 'border-primary')}>
                <span dir="auto" className="truncate">
                  {sceneLabel(s)}
                </span>
                <span className="shrink-0 text-muted-foreground">{(s.duration / FPS).toFixed(1)}s</span>
              </div>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className={label}>Voice</span>
          <div className="flex gap-1" aria-hidden>
            {scenes.map((s, i) => (
              <div key={i} style={{flex: `${s.duration} 1 0`}} className="flex h-7 min-w-0 items-center gap-0.5 overflow-hidden rounded-md border bg-track px-1">
                {s.voiceover ? wave(i + 1, 40).map((h, k) => <span key={k} className="w-0.5 shrink-0 rounded-sm bg-[#9aa0b3]" style={{height: h}} />) : null}
              </div>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className={label}>Music</span>
          <div className="flex h-7 items-center gap-0.5 overflow-hidden rounded-md border bg-[#1f2410] px-1" aria-hidden>
            {music ? wave(9, 200).map((h, k) => <span key={k} className="w-0.5 shrink-0 rounded-sm bg-[#8fa31d]" style={{height: h}} />) : <span className="text-[10px] text-muted-foreground">No music</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
