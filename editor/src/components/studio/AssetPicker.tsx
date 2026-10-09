import {Film} from 'lucide-react';
import type {Asset} from '@/lib/api';
import {cn} from '@/lib/utils';

// Multi- or single-select grid of library assets; selection is a list of asset URLs.
export const AssetPicker: React.FC<{label: string; assets: Asset[]; selected: string[]; onChange: (urls: string[]) => void; single?: boolean}> = ({label, assets, selected, onChange, single}) => {
  if (assets.length === 0) return <p className="text-xs text-muted-foreground">No {label.toLowerCase()} in this client's library.</p>;
  const toggle = (url: string) => onChange(selected.includes(url) ? selected.filter((u) => u !== url) : single ? [url] : [...selected, url]);
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label={label}>
      {assets.map((a) => {
        const on = selected.includes(a.url);
        return (
          <li key={a.url}>
            <button type="button" aria-pressed={on} aria-label={`${on ? 'Unselect' : 'Select'} ${a.name}`} onClick={() => toggle(a.url)} className={cn('relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg border bg-panel outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', on && 'border-primary ring-1 ring-primary')}>
              {a.kind === 'clip' ? <Film className="size-5 text-muted-foreground" /> : <img src={a.url} alt="" loading="lazy" className="size-full object-cover" />}
              <span dir="auto" className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px]">
                {a.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
