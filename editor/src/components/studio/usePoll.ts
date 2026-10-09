import {useCallback, useEffect, useRef, useState} from 'react';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Loads once, then every `ms` (null = no polling). `deps` re-fetches when they change.
export const usePoll = <T,>(fn: () => Promise<T>, ms: number | null, deps: unknown[] = []) => {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0); // only the newest request may write state (deps can change mid-flight)
  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const d = await fnRef.current();
      if (n !== seq.current) return;
      setData(d);
      setError(undefined);
    } catch (e) {
      if (n === seq.current) setError(errMsg(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLoading(true);
    void reload();
    if (ms == null) return;
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, reload, ...deps]);
  return {data, error, loading, reload};
};
