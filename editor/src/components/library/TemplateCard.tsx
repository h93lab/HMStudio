import {Trash2} from 'lucide-react';
import {Panel} from '@/components/kit';
import {Button} from '@/components/ui/button';
import type {Template} from '@/lib/api';
import {sceneColor} from '@/lib/sceneColors';
import {Link} from '@/lib/router';

export const totalSeconds = (t: Template) => t.scenes.reduce((s, x) => s + x.seconds, 0);

export const Timeline: React.FC<{scenes: Template['scenes']}> = ({scenes}) => (
  <div className="flex h-12 gap-1" role="img" aria-label={`Scenes: ${scenes.map((s) => s.type).join(', ')}`}>
    {scenes.map((s, i) => {
      const c = sceneColor(s.type);
      return (
        <div key={i} className="flex min-w-0 items-end overflow-hidden rounded-md p-1 text-[11px]" style={{flex: Math.max(s.seconds, 1), background: `${c}22`, borderTop: `3px solid ${c}`}}>
          <span className="truncate">{s.type}</span>
        </div>
      );
    })}
  </div>
);

export const TemplateCard: React.FC<{template: Template; onDelete: (t: Template) => void}> = ({template: t, onDelete}) => (
  <Panel as="article" title={<span className="block truncate" dir="auto" title={t.name}>{t.name}</span>} meta={`~${totalSeconds(t)}s`} actions={
    <Button variant="ghost" size="icon-sm" aria-label={`Delete template ${t.name}`} onClick={() => onDelete(t)}>
      <Trash2 />
    </Button>
  }>
    <Timeline scenes={t.scenes} />
    <p className="flex-1 text-sm text-muted-foreground" dir="auto">
      {t.description || 'No description'}
    </p>
    <footer className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {t.uses === 0 ? 'Not used yet' : `Used ${t.uses} ${t.uses === 1 ? 'time' : 'times'}`} · {t.category}
        {t.style ? ` · ${t.style}` : ''}
      </span>
      <Button asChild variant="outline" size="sm">
        <Link href={`/new?template=${encodeURIComponent(t.id)}`}>Use template</Link>
      </Button>
    </footer>
  </Panel>
);
