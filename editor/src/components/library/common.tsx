import {useCallback, useEffect, useState} from 'react';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Loads once (and on reload()); a stale response never overwrites a newer one.
export const useLoad = <T,>(fn: () => Promise<T>, deps: unknown[]) => {
  const [state, setState] = useState<{data?: T; error?: string; loading: boolean}>({loading: true});
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let live = true;
    setState((s) => ({...s, error: undefined, loading: true}));
    run().then(
      (data) => live && setState({data, loading: false}),
      (e) => live && setState({error: errMsg(e), loading: false}),
    );
    return () => void (live = false);
  }, [run, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {...state, reload};
};

export const formatBytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
};
