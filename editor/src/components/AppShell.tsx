import {Play, Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Link, navigate, useLocation} from '@/lib/router';
import {cn} from '@/lib/utils';

const NAV = [
  {href: '/', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/new') || p.startsWith('/edit') || p.startsWith('/compare')},
  {href: '/clients', label: 'Clients'},
  {href: '/assets', label: 'Assets'},
  {href: '/templates', label: 'Templates'},
  {href: '/queue', label: 'Queue'},
  {href: '/settings', label: 'AI models'},
];

// Graphite frame + lime accent from the approved prototype. `actions` sits at the right of the header.
export const AppShell: React.FC<{children: React.ReactNode; actions?: React.ReactNode; full?: boolean}> = ({children, actions, full}) => {
  const {path} = useLocation();
  return (
    <div className="min-h-full p-3 sm:p-5">
      <div className={cn('mx-auto flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-[22px] border bg-[#141415]', !full && 'max-w-[1400px]')}>
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#252528] px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-[9px] bg-primary text-primary-foreground">
              <Play className="size-4 fill-current" />
            </span>
            <span className="font-title text-lg">Motion Studio</span>
          </Link>
          <nav className="flex flex-wrap gap-1 sm:ms-4" aria-label="Main">
            {NAV.map((n) => {
              const active = n.match ? n.match(path) : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn('rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground', active && 'bg-[#232326] text-foreground')}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          {actions ?? (
            <Button onClick={() => navigate('/new')} className="font-title">
              <Plus /> New video
            </Button>
          )}
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
};

// Page heading used by every list page.
export const PageTitle: React.FC<{title: string; hint?: React.ReactNode; children?: React.ReactNode}> = ({title, hint, children}) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
    <h1 className="font-title text-2xl">{title}</h1>
    {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    <div className="flex-1" />
    {children}
  </div>
);
