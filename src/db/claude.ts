// Builds the "Review with Claude" prompt from the database: recent sessions,
// maxes, plan adherence and the plan itself (so Claude can send back an update).
import type { SQLiteDatabase } from 'expo-sqlite';

import { addDays, today } from '@/lib/dates';
import { buildReviewPrompt, planToFile, trainingLog } from '@/lib/import/review';

import {
  getActivePlanBundle,
  getPlanBundle,
  getSettings,
  latestMaxes,
  listExercises,
  listWorkouts,
  sessionLogsWithSets,
} from './repo';

/**
 * @param planId the plan to adjust; defaults to the active plan, if any.
 * @param weeks how many weeks of history to include.
 */
export async function reviewPrompt(db: SQLiteDatabase, opts: { planId?: string; weeks: number }): Promise<string> {
  const t = today();
  const from = addDays(t, -7 * opts.weeks + 1);
  const [exercises, workouts, settings, maxes, sessions, bundle] = await Promise.all([
    listExercises(db),
    listWorkouts(db),
    getSettings(db),
    latestMaxes(db),
    sessionLogsWithSets(db, from),
    opts.planId ? getPlanBundle(db, opts.planId) : getActivePlanBundle(db),
  ]);
  const workoutsById = new Map(workouts.map((w) => [w.id, w]));
  const log = trainingLog({
    sessions,
    maxes: [...maxes.values()],
    exercises: new Map(exercises.map((e) => [e.id, e])),
    unit: settings.unit,
    bodyweightKg: settings.bodyweightKg,
    from,
    today: t,
    plan: bundle ? { ...bundle, workouts: workoutsById } : undefined,
  });
  return buildReviewPrompt({
    log,
    planFile: bundle ? planToFile(bundle, workoutsById) : undefined,
    exercises,
    workouts,
  });
}
