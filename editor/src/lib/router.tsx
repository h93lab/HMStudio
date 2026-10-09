import {useEffect, useState, type AnchorHTMLAttributes} from 'react';

// Tiny history router: the studio has a dozen flat routes, no nesting, so a library would be pure weight.
const listeners = new Set<() => void>();
export const navigate = (to: string, replace = false) => {
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
};
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export const useLocation = () => {
  const [loc, setLoc] = useState(() => ({path: location.pathname, query: new URLSearchParams(location.search)}));
  useEffect(() => {
    const on = () => setLoc({path: location.pathname, query: new URLSearchParams(location.search)});
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return loc;
};

// Match "/edit/:id" against a path; returns params or null.
export const match = (pattern: string, path: string): Record<string, string> | null => {
  const p = pattern.replace(/\/+$/, '').split('/');
  const s = path.replace(/\/+$/, '').split('/');
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
};

export const Link: React.FC<AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}> = ({href, onClick, ...rest}) => (
  <a
    href={href}
    onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || rest.target) return;
      e.preventDefault();
      navigate(href);
    }}
    {...rest}
  />
);
