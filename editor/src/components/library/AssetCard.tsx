import {Copy, Music, Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import type {Asset, AssetKind} from '@/lib/api';
import {formatBytes, formatDate} from './common';

export const KIND_LABEL: Record<AssetKind, string> = {logo: 'Logo', screenshot: 'Screenshot', image: 'Image', clip: 'Clip', music: 'Music'};
const KIND_COLOR: Record<AssetKind, string> = {logo: '#6c5cff', screenshot: '#4f9dff', image: '#22d3ee', clip: '#fb7185', music: '#dcff2a'};

const Thumb: React.FC<{asset: Asset}> = ({asset}) => {
  if (asset.kind === 'clip') return <video src={asset.url} muted playsInline preload="metadata" className="size-full object-cover" aria-label={asset.name} />;
  if (asset.kind === 'music') return <Music aria-hidden className="size-8 text-primary" />;
  return <img src={asset.url} alt={asset.name} loading="lazy" className={asset.kind === 'logo' ? 'size-full object-contain p-4' : 'size-full object-cover'} />;
};

export const AssetCard: React.FC<{asset: Asset; showClient: boolean; onDelete: (a: Asset) => void}> = ({asset, showClient, onDelete}) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(asset.url, location.origin).href);
      toast.success('URL copied');
    } catch {
      toast.error('Could not copy the URL');
    }
  };
  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <div className="relative grid h-32 place-items-center bg-[#0d0d0e]">
        <Thumb asset={asset} />
        <span className="absolute start-2 top-2 rounded-full bg-[#141415cc] px-2 py-0.5 text-[11px]" style={{color: KIND_COLOR[asset.kind]}}>
          {KIND_LABEL[asset.kind]}
        </span>
      </div>
      <div className="flex items-start gap-1 p-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" dir="auto" title={asset.name}>
            {asset.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {formatBytes(asset.bytes)} · {formatDate(asset.addedAt)}
            {showClient && <span dir="auto"> · {asset.client}</span>}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Copy URL of ${asset.name}`} onClick={copy}>
          <Copy />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${asset.name}`} onClick={() => onDelete(asset)}>
          <Trash2 />
        </Button>
      </div>
    </article>
  );
};
