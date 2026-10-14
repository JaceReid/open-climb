// Tiny change bus: repository writes call notifyChange(), and every useQuery()
// re-runs. The data set is small and local, so refetching is cheap and keeps
// screens trivially consistent.
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState, useSyncExternalStore, type DependencyList } from 'react';

let version = 0;
const listeners = new Set<() => void>();

export function notifyChange(): void {
  version++;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;

export interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

export function useQuery<T>(fn: (db: SQLiteDatabase) => Promise<T>, deps: DependencyList = []): QueryState<T> {
  const db = useSQLiteContext();
  const v = useSyncExternalStore(subscribe, getVersion);
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    fn(db).then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error: Error) => {
        console.error(error);
        if (!cancelled) setState((s) => ({ ...s, error, loading: false }));
      },
    );
    return () => {
      cancelled = true;
    };
    // `fn` is a fresh closure every render; the caller lists what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, v, ...deps]);

  return state;
}
