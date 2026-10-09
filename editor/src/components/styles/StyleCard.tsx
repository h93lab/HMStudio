import {Pencil, Trash2} from 'lucide-react';
import {Panel} from '@/components/kit';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Link} from '@/lib/router';
import type {Pack} from '../../../../src/design/packs';

const chips = (p: Pack) => [`${p.camera.mode} camera`, `${p.reveal} reveal`, `${p.transitions.length} transitions`];

export const StyleCard: React.FC<{name: string; pack: Pack; prompt?: string; builtIn?: boolean; editHref: string; onDelete?: () => void}> = ({name, pack, prompt, builtIn, editHref, onDelete}) => (
  <Panel as="article" title={<span className="block truncate" dir="auto">{name}</span>} actions={builtIn ? <Badge variant="outline">Built-in</Badge> : undefined}>
    {prompt && (
      <p dir="auto" className="line-clamp-2 text-sm text-muted-foreground">
        {prompt}
      </p>
    )}
    <div className="flex flex-wrap gap-2">
      {chips(pack).map((c) => (
        <span key={c} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {c}
        </span>
      ))}
    </div>
    <div className="mt-auto flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={editHref} aria-label={builtIn ? `Customize ${name}` : `Edit ${name}`}>
          <Pencil /> {builtIn ? 'Customize' : 'Edit'}
        </Link>
      </Button>
      {onDelete && (
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} onClick={onDelete}>
          <Trash2 />
        </Button>
      )}
    </div>
  </Panel>
);
