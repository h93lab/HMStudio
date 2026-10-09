import {LogOut, Play, Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {api} from '@/lib/api';
import {Link, navigate, useLocation} from '@/lib/router';
import {cn} from '@/lib/utils';

const NAV = [
  {href: '/', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/new') || p.startsWith('/edit') || p.startsWith('/compare')},
  {href: '/clients', label: 'Clients'},
  {href: '/assets', label: 'Assets'},
  {href: '/templates', label: 'Templates'},
  {href: '/styles', label: 'Styles'},
  {href: '/queue', label: 'Queue'},
  {href: '/settings', label: 'AI models'},
];

// Graphite frame + lime accent from the approved prototype. `actions` sits at the right of the header.
export const AppShell: React.FC<{children: React.ReactNode; actions?: React.ReactNode; full?: boolean}> = ({children, actions, full}) => {
  const {path} = useLocation();
  return (
    <div className="min-h-full p-3 sm:p-5">
      <div className={cn('mx-auto flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-[22px] border bg-field', !full && 'max-w-[1400px]')}>
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Play className="size-4 fill-current" />
            </span>
            <span className="font-title text-lg">Motion Studio</span>
          </Link>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 lg:order-none lg:ms-4 lg:w-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Main">
            {NAV.map((n) => {
              const active = n.match ? n.match(path) : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn('inline-flex h-8 shrink-0 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground', active && 'bg-muted text-foreground')}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          {actions ??
            (path.startsWith('/new') ? null : (
              <Button onClick={() => navigate('/new')} className="font-title" aria-label="New video">
                <Plus /> <span className="hidden sm:inline">New video</span>
              </Button>
            ))}
          <Button variant="ghost" size="icon" aria-label="Log out" title="Log out" onClick={() => void api.logout().finally(() => location.assign('/login'))}>
            <LogOut />
          </Button>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
};

// Page heading used by every list page.
export const PageTitle: React.FC<{title: string; hint?: React.ReactNode; children?: React.ReactNode}> = ({title, hint, children}) => (
  <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
    <h1 className="font-title text-2xl leading-none">{title}</h1>
    {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    <div className="flex-1" />
    {children}
  </div>
);
