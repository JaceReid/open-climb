// The editable log of a session before it is saved: one row per prescribed set,
// prefilled from the workout so logging is mostly ticking boxes.
import { setLabel } from './format';
import { estimateSetSec } from './timer';
import type { Discipline, Exercise, Location, SetLog, TrackField, Workout, WorkoutItem } from './types';

export interface DraftSet {
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  grade: string | null;
  completed: boolean;
  /** Per-set label from the prescription (e.g. a grip). */
  label: string | null;
  location: Location | null;
  discipline: Discipline | null;
}

export interface DraftItem {
  itemIndex: number;
  exerciseId: string;
  exerciseName: string;
  tracks: TrackField[];
  bodyweight: boolean;
  /** Estimated seconds per set (rests included), from the prescription. */
  estSetSec: number;
  /** Long efforts (climbing sessions, ARC) are entered in minutes. */
  durationUnit: 'sec' | 'min';
  sets: DraftSet[];
}

/** One exercise's rows, prefilled from its prescription. */
export function draftItem(
  ex: Exercise | undefined,
  item: WorkoutItem,
  itemIndex: number,
  isCompleted: (setIndex: number) => boolean,
): DraftItem {
  const tracks = ex?.tracks ?? ['reps'];
  const bodyweight = ex?.bodyweight ?? false;
  const set = (setIndex: number): DraftSet => ({
    weightKg: tracks.includes('weight') ? (item.weightKg ?? (bodyweight ? 0 : null)) : null,
    reps: tracks.includes('reps') ? item.reps : null,
    durationSec: tracks.includes('duration') ? (item.workSec ?? null) : null,
    grade: null,
    completed: isCompleted(setIndex),
    label: setLabel(item, setIndex),
    location: tracks.includes('location') ? 'indoor' : null,
    discipline: tracks.includes('discipline') ? 'boulder' : null,
  });
  return {
    itemIndex,
    exerciseId: item.exerciseId,
    exerciseName: ex?.name ?? 'Unknown exercise',
    tracks,
    bodyweight,
    estSetSec: estimateSetSec(item),
    durationUnit: (item.workSec ?? 0) >= 300 ? 'min' : 'sec',
    sets: Array.from({ length: Math.max(1, item.sets) }, (_, i) => set(i)),
  };
}

/**
 * @param completed which sets were done: 'all', or a set of "itemIndex:setIndex"
 * keys from the timer.
 */
export function buildDraft(
  workout: Workout,
  exercises: Map<string, Exercise>,
  completed: 'all' | Set<string>,
): DraftItem[] {
  return workout.items.map((item, itemIndex) =>
    draftItem(exercises.get(item.exerciseId), item, itemIndex, (s) => completed === 'all' || completed.has(`${itemIndex}:${s}`)),
  );
}

/** Append an exercise to a draft (e.g. swapped in on the day), all sets marked done. */
export function addDraftExercise(draft: DraftItem[], ex: Exercise): DraftItem[] {
  const itemIndex = draft.reduce((max, i) => Math.max(max, i.itemIndex), -1) + 1;
  return [...draft, draftItem(ex, { exerciseId: ex.id, ...ex.defaults }, itemIndex, () => true)];
}

/** A one-exercise workout for logging or timing an exercise on its own. Not saved. */
export function singleExerciseWorkout(ex: Exercise): Workout {
  return {
    id: '',
    name: ex.name,
    focus: '',
    description: '',
    items: [{ exerciseId: ex.id, ...ex.defaults }],
    builtIn: false,
    test: false,
  };
}

export function draftToSetLogs(draft: DraftItem[]): Omit<SetLog, 'id' | 'sessionId'>[] {
  return draft.flatMap((item) =>
    item.sets.map((s, setIndex) => ({
      exerciseId: item.exerciseId,
      exerciseName: item.exerciseName,
      itemIndex: item.itemIndex,
      setIndex,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSec: s.durationSec,
      grade: s.grade,
      completed: s.completed,
      notes: s.label ?? '',
      estSec: item.estSetSec,
      location: s.location,
      discipline: s.discipline,
    })),
  );
}

/** Estimated training time for the sets marked done. */
export function draftEstimateSec(draft: DraftItem[]): number {
  return draft.reduce((sum, item) => sum + item.estSetSec * item.sets.filter((s) => s.completed).length, 0);
}
