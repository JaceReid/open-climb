import { useMemo } from 'react';

import { getSettings, latestMaxes, listExercises, listWorkouts } from '@/db/repo';
import { useQuery } from '@/db/store';
import { DEFAULT_SETTINGS, type Exercise, type MaxTest, type Settings, type Workout } from '@/lib/types';

export function useSettings(): Settings {
  return useQuery(getSettings).data ?? DEFAULT_SETTINGS;
}

export function useExercises(): { exercises: Exercise[]; byId: Map<string, Exercise>; loading: boolean } {
  const { data, loading } = useQuery(listExercises);
  const byId = useMemo(() => new Map((data ?? []).map((e) => [e.id, e])), [data]);
  return { exercises: data ?? [], byId, loading };
}

export function useWorkouts(): { workouts: Workout[]; byId: Map<string, Workout>; loading: boolean } {
  const { data, loading } = useQuery(listWorkouts);
  const byId = useMemo(() => new Map((data ?? []).map((w) => [w.id, w])), [data]);
  return { workouts: data ?? [], byId, loading };
}

/** Latest tested max per exercise id. */
export function useMaxes(): Map<string, MaxTest> {
  const { data } = useQuery(latestMaxes);
  return useMemo(() => data ?? new Map<string, MaxTest>(), [data]);
}
