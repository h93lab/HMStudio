import {Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Template} from '@/lib/api';
import {Link} from '@/lib/router';

const SCENE_COLOR: Record<string, string> = {
  intro: '#6c5cff', stat: '#dcff2a', features: '#4f9dff', device: '#22d3ee', quote: '#fb7185', steps: '#f59e0b',
  comparison: '#a78bfa', outro: '#8d8d93', logo: '#10b981', chart: '#e4f222', statement: '#f472b6', image: '#38bdf8', video: '#fb923c',
};

export const totalSeconds = (t: Template) => t.scenes.reduce((s, x) => s + x.seconds, 0);

export const Timeline: React.FC<{scenes: Template['scenes']}> = ({scenes}) => (
  <div className="flex h-12 gap-1" role="img" aria-label={`Scenes: ${scenes.map((s) => s.type).join(', ')}`}>
    {scenes.map((s, i) => {
      const c = SCENE_COLOR[s.type] ?? '#8d8d93';
      return (
        <div key={i} className="flex min-w-0 items-end overflow-hidden rounded-md p-1 text-[10px]" style={{flex: Math.max(s.seconds, 1), background: `${c}22`, borderTop: `3px solid ${c}`}}>
          <span className="truncate">{s.type}</span>
        </div>
      );
    })}
  </div>
);

export const TemplateCard: React.FC<{template: Template; onDelete: (t: Template) => void}> = ({template: t, onDelete}) => (
  <article className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
    <div className="flex items-start gap-2">
      <h2 className="min-w-0 flex-1 truncate font-bold" dir="auto" title={t.name}>
        {t.name}
      </h2>
      <span className="shrink-0 text-xs text-muted-foreground">~{totalSeconds(t)}s</span>
      <Button variant="ghost" size="icon-xs" aria-label={`Delete template ${t.name}`} onClick={() => onDelete(t)}>
        <Trash2 />
      </Button>
    </div>
    <Timeline scenes={t.scenes} />
    <p className="flex-1 text-sm text-muted-foreground" dir="auto">
      {t.description || 'No description'}
    </p>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">
        {t.uses === 0 ? 'Not used yet' : `Used ${t.uses} ${t.uses === 1 ? 'time' : 'times'}`} · {t.category}
        {t.style ? ` · ${t.style}` : ''}
      </span>
      <Link href={`/new?template=${encodeURIComponent(t.id)}`} className="font-title shrink-0 rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
        Use template
      </Link>
    </div>
  </article>
);
