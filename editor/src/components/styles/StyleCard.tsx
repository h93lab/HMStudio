import {Pencil, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Link} from '@/lib/router';
import type {Pack} from '../../../../src/design/packs';

const summary = (p: Pack) => `${p.camera.mode} camera · ${p.reveal} reveal · ${p.transitions.length} transitions`;

export const StyleCard: React.FC<{name: string; pack: Pack; prompt?: string; builtIn?: boolean; editHref: string; onDelete?: () => void}> = ({name, pack, prompt, builtIn, editHref, onDelete}) => (
  <article className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
    <div className="flex items-start gap-2">
      <h2 className="min-w-0 flex-1 truncate font-title text-base" dir="auto">
        {name}
      </h2>
      {builtIn && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Built-in</span>}
    </div>
    {prompt && (
      <p dir="auto" className="line-clamp-3 text-sm text-muted-foreground">
        {prompt}
      </p>
    )}
    <p className="text-xs text-muted-foreground">{summary(pack)}</p>
    <div className="mt-auto flex gap-2 pt-1">
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
  </article>
);
