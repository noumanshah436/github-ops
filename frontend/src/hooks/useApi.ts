import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * GET `path` (skipped when null). With `pollMs`, refetch on that interval while
 * `shouldPoll(data)` is true, e.g. while an Actions run is still in progress.
 */
export function useApi<T>(
  path: string | null,
  options: { pollMs?: number; shouldPoll?: (data: T) => boolean } = {},
): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let timer: number | undefined;
    const load = async (background: boolean) => {
      if (!background) setLoading(true);
      try {
        const result = await api.get<T>(path);
        if (cancelled) return;
        setData(result);
        setError(null);
        const { pollMs, shouldPoll } = optionsRef.current;
        if (pollMs && (!shouldPoll || shouldPoll(result))) {
          timer = window.setTimeout(() => void load(true), pollMs);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled && !background) setLoading(false);
      }
    };
    void load(false);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [path, tick]);

  return { data, error, loading, reload };
}
