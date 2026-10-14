// Max tests and working weights.
//
// Bodyweight exercises (hangs, pull-ups) are tested and prescribed on TOTAL load:
// a +30 kg max hang at 70 kg bodyweight is a 100 kg max, so 80% is 80 kg total,
// i.e. +10 kg added. Edge lifts and barbell lifts are simply % of the weight.
import { epley } from './metrics';
import type { Exercise, MaxTest, WorkoutItem } from './types';

export type TestKind = MaxTest['kind'];

/** Default hold for hang/edge-lift tests, in seconds. */
export const DEFAULT_HOLD_SEC = 5;
/** Rest between test attempts. */
export const TEST_REST_SEC = 180;

/** How an exercise is tested, or null if it can't be (no weight to measure). */
export function testKind(ex: Pick<Exercise, 'tracks' | 'category'>): TestKind | null {
  if (!ex.tracks.includes('weight')) return null;
  if (ex.tracks.includes('duration')) return 'hold';
  if (ex.tracks.includes('reps') && ex.category === 'strength') return 'reps';
  return null;
}

export interface Attempt {
  weightKg: number;
  success: boolean;
}

export interface TestResult {
  /** Best successful attempt. */
  weightKg: number;
  /** Max for working weights: the attempt (holds, 1 rep) or an Epley 1RM estimate. */
  maxKg: number;
}

/**
 * The result of a test from its attempts. Rep tests with more than one rep are
 * converted to an estimated 1RM on total load (bodyweight + added).
 */
export function testResult(
  attempts: Attempt[],
  kind: TestKind,
  reps: number,
  bodyweight: boolean,
  bodyweightKg: number | null,
): TestResult | null {
  const made = attempts.filter((a) => a.success).map((a) => a.weightKg);
  if (made.length === 0) return null;
  const weightKg = Math.max(...made);
  if (kind === 'hold' || reps <= 1) return { weightKg, maxKg: weightKg };
  const base = bodyweight ? (bodyweightKg ?? 0) : 0;
  return { weightKg, maxKg: roundKg(epley(weightKg + base, reps)! - base) };
}

/** Total load of a max (bodyweight + added for bodyweight exercises). */
export function maxTotalKg(max: Pick<MaxTest, 'maxKg' | 'bodyweightKg'>, bodyweight: boolean): number | null {
  if (!bodyweight) return max.maxKg;
  return max.bodyweightKg == null ? null : max.bodyweightKg + max.maxKg;
}

/** Round to the nearest 0.5 kg, a loadable increment. */
export function roundKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

/**
 * Working weight at `pct`% of a max, in the exercise's own convention (added
 * weight for bodyweight exercises, which may go negative = assisted). Uses the
 * current bodyweight when known, else the bodyweight recorded with the test.
 */
export function workingWeightKg(
  max: Pick<MaxTest, 'maxKg' | 'bodyweightKg'>,
  pct: number,
  bodyweight: boolean,
  currentBodyweightKg: number | null,
): number | null {
  const total = maxTotalKg(max, bodyweight);
  if (total == null) return null;
  const working = (total * pct) / 100;
  if (!bodyweight) return roundKg(working);
  return roundKg(working - (currentBodyweightKg ?? max.bodyweightKg!));
}

export interface ResolvedItem extends WorkoutItem {
  /** Set when pctOfMax is used but there's no max to compute from yet. */
  needsTest?: boolean;
}

/** Fill in weights for items prescribed as % of max. Items without a max keep their weight. */
export function applyMaxes(
  items: WorkoutItem[],
  exercises: Map<string, Pick<Exercise, 'bodyweight'>>,
  maxes: Map<string, MaxTest>,
  currentBodyweightKg: number | null,
): ResolvedItem[] {
  return items.map((item) => {
    if (item.pctOfMax == null) return item;
    const max = maxes.get(item.exerciseId);
    const ex = exercises.get(item.exerciseId);
    const kg = max && ex ? workingWeightKg(max, item.pctOfMax, ex.bodyweight, currentBodyweightKg) : null;
    return kg == null ? { ...item, needsTest: true } : { ...item, weightKg: kg };
  });
}
