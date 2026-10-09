import {useEffect} from 'react';

// Warns on tab close and on in-app link clicks while `dirty` (the tiny router has no navigation hook).
export const useUnsavedGuard = (dirty: boolean) => {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (a && !a.getAttribute('target') && !confirm('Discard unsaved changes?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
};
