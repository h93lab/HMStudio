import {Slider} from '@/components/ui/slider';
import {Pick} from '@/components/library/common';
import {cn} from '@/lib/utils';
import {backgroundNames, cameraModes, transitionNames, type Pack} from '../../../../src/design/packs';
import {displayFonts} from '../../../../src/schema';

const Row: React.FC<{label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void}> = ({label, value, min, max, step, onChange}) => (
  <div className="flex flex-col gap-2">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span>{+value.toFixed(3)}</span>
    </div>
    <Slider aria-label={label} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
  </div>
);

// Multi-select chips that never let the last one go.
const Toggles: React.FC<{label: string; all: readonly string[]; value: string[]; onChange: (v: string[]) => void}> = ({label, all, value, onChange}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs text-muted-foreground">{label} (at least one)</span>
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {all.map((n) => {
        const on = value.includes(n);
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? (value.length > 1 ? value.filter((x) => x !== n) : value) : all.filter((x) => x === n || value.includes(x)))}
            className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', on ? 'border-primary bg-primary font-bold text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
          >
            {n}
          </button>
        );
      })}
    </div>
  </div>
);

const opts = (xs: readonly string[]) => xs.map((x) => ({value: x, label: x}));

export const PackForm: React.FC<{pack: Pack; onChange: (p: Pack) => void}> = ({pack, onChange}) => {
  const set = (patch: Partial<Pack>) => onChange({...pack, ...patch});
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Row label="Entrance frames" min={6} max={60} step={1} value={pack.enterFrames} onChange={(enterFrames) => set({enterFrames})} />
        <Row label="Overshoot" min={0} max={0.6} step={0.01} value={pack.overshoot} onChange={(overshoot) => set({overshoot})} />
        <Row label="Stagger (frames)" min={0} max={10} step={1} value={pack.stagger.each} onChange={(each) => set({stagger: {...pack.stagger, each}})} />
        <Row label="Camera intensity" min={0} max={1} step={0.05} value={pack.camera.intensity} onChange={(intensity) => set({camera: {...pack.camera, intensity}})} />
        <Row label="Transition frames" min={8} max={40} step={1} value={pack.transitionFrames} onChange={(transitionFrames) => set({transitionFrames})} />
        <Row label="Title tracking (em)" min={-0.05} max={0.15} step={0.005} value={pack.tracking} onChange={(tracking) => set({tracking})} />
        <Row label="Film grain" min={0} max={1} step={0.01} value={pack.finish.grain} onChange={(grain) => set({finish: {...pack.finish, grain}})} />
        <Row label="Vignette" min={0} max={1} step={0.01} value={pack.finish.vignette} onChange={(vignette) => set({finish: {...pack.finish, vignette}})} />
        <Row label="Light leaks" min={0} max={1} step={0.01} value={pack.finish.leaks} onChange={(leaks) => set({finish: {...pack.finish, leaks}})} />
        <Row label="Chromatic aberration" min={0} max={1} step={0.01} value={pack.finish.chroma} onChange={(chroma) => set({finish: {...pack.finish, chroma}})} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Pick id="p-reveal" label="Text reveal" value={pack.reveal} onChange={(v) => set({reveal: v as Pack['reveal']})} options={opts(['blur', 'rise', 'wipe', 'scale'])} />
        <Pick id="p-accent" label="Accent" value={pack.accent} onChange={(v) => set({accent: v as Pack['accent']})} options={opts(['underline', 'bracket', 'glow'])} />
        <Pick id="p-camera" label="Camera" value={pack.camera.mode} onChange={(v) => set({camera: {...pack.camera, mode: v as Pack['camera']['mode']}})} options={opts(cameraModes)} />
        <Pick id="p-stagger" label="Stagger from" value={pack.stagger.from} onChange={(v) => set({stagger: {...pack.stagger, from: v as Pack['stagger']['from']}})} options={opts(['start', 'center', 'end'])} />
        <Pick id="p-font" label="Title font" value={pack.displayFont} onChange={(v) => set({displayFont: v as Pack['displayFont']})} options={displayFonts.map((f) => ({value: f, label: f === 'none' ? 'Brand font' : f}))} />
      </div>
      <Toggles label="Transitions" all={transitionNames} value={pack.transitions} onChange={(transitions) => set({transitions: transitions as Pack['transitions']})} />
      <Toggles label="Backgrounds" all={backgroundNames} value={pack.backgrounds} onChange={(backgrounds) => set({backgrounds: backgrounds as Pack['backgrounds']})} />
    </div>
  );
};
