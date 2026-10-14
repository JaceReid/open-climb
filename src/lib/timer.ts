// Turns a workout into a flat list of timer steps the player walks through.
import type { Prescription, WorkoutItem } from './types';

export type StepKind =
  /** Wait for the user before starting an exercise. */
  | 'ready'
  /** Short countdown before the first timed rep. */
  | 'prep'
  /** Timed effort (hang, hold, climbing interval). */
  | 'work'
  /** Rest between reps inside a set. */
  | 'rest'
  /** Rest between sets. */
  | 'setRest'
  /** Untimed set (pull-ups, a boulder attempt): wait for "Done". */
  | 'manual';

export interface TimerStep {
  kind: StepKind;
  /** Seconds, or null when the step waits for the user. */
  durationSec: number | null;
  itemIndex: number;
  setIndex: number;
  repIndex: number;
  /** Completing this step completes a set. */
  endsSet: boolean;
}

export function isTimed(item: Pick<WorkoutItem, 'workSec'>): boolean {
  return (item.workSec ?? 0) > 0;
}

export function buildSteps(items: WorkoutItem[], prepSec: number): TimerStep[] {
  const steps: TimerStep[] = [];
  items.forEach((item, itemIndex) => {
    const sets = Math.max(1, item.sets);
    const reps = Math.max(1, item.reps);
    const base = { itemIndex, repIndex: 0, endsSet: false };
    steps.push({ ...base, kind: 'ready', durationSec: null, setIndex: 0 });

    for (let setIndex = 0; setIndex < sets; setIndex++) {
      if (isTimed(item)) {
        if (setIndex === 0 && prepSec > 0) {
          steps.push({ ...base, kind: 'prep', durationSec: prepSec, setIndex });
        }
        for (let repIndex = 0; repIndex < reps; repIndex++) {
          const lastRep = repIndex === reps - 1;
          steps.push({
            kind: 'work',
            durationSec: item.workSec!,
            itemIndex,
            setIndex,
            repIndex,
            endsSet: lastRep,
          });
          if (!lastRep && (item.restSec ?? 0) > 0) {
            steps.push({ kind: 'rest', durationSec: item.restSec!, itemIndex, setIndex, repIndex, endsSet: false });
          }
        }
      } else {
        steps.push({ ...base, kind: 'manual', durationSec: null, setIndex, endsSet: true });
      }
      if (setIndex < sets - 1 && (item.setRestSec ?? 0) > 0) {
        steps.push({ ...base, kind: 'setRest', durationSec: item.setRestSec!, setIndex });
      }
    }
  });
  return steps;
}

/** Rough seconds an untimed set takes, for duration estimates. */
const UNTIMED_SET_SEC = 45;
/** Rough changeover time between exercises. */
const CHANGEOVER_SEC = 60;

export function estimateItemSec(item: Prescription): number {
  const sets = Math.max(1, item.sets);
  const reps = Math.max(1, item.reps);
  const perSet = isTimed(item)
    ? item.workSec! * reps + (item.restSec ?? 0) * (reps - 1)
    : UNTIMED_SET_SEC;
  return perSet * sets + (item.setRestSec ?? 0) * (sets - 1);
}

/** One set's share of an exercise's time, rests included. Used to weight training time. */
export function estimateSetSec(item: Prescription): number {
  return estimateItemSec(item) / Math.max(1, item.sets);
}

export function estimateWorkoutSec(items: WorkoutItem[]): number {
  if (items.length === 0) return 0;
  return items.reduce((sum, i) => sum + estimateItemSec(i), 0) + CHANGEOVER_SEC * (items.length - 1);
}
