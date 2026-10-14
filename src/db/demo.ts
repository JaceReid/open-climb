// Development-only demo data (Settings → Developer, shown when __DEV__): the
// example plan plus ~8 weeks of progressing sessions and max tests, so every
// screen has something to show. Used for README screenshots.
import type { SQLiteDatabase } from 'expo-sqlite';

import { addDays, mondayOf, today } from '@/lib/dates';
import { buildDraft, draftEstimateSec, draftToSetLogs, type DraftItem } from '@/lib/draft';
import { EXAMPLE_PLAN } from '@/lib/import/example';
import { parseImport } from '@/lib/import/resolve';
import { sessionsInRange } from '@/lib/schedule';

import {
  activatePlan,
  applyImport,
  getPlanBundle,
  listExercises,
  listWorkouts,
  saveSessionLog,
  saveTestSession,
  setSetting,
} from './repo';

const BODYWEIGHT = 70;

export async function loadDemoData(db: SQLiteDatabase): Promise<void> {
  await setSetting(db, 'bodyweightKg', BODYWEIGHT);
  const exercises = new Map((await listExercises(db)).map((e) => [e.id, e]));
  const workouts = new Map((await listWorkouts(db)).map((w) => [w.id, w]));
  const t = today();
  const thisMonday = mondayOf(t);

  const log = async (
    workoutId: string,
    date: string,
    tweak: (draft: DraftItem[]) => void = () => {},
    plan: { planSessionId: string; date: string } | null = null,
  ) => {
    const workout = workouts.get(workoutId);
    if (!workout || date > t) return;
    const draft = buildDraft(workout, exercises, 'all');
    tweak(draft);
    await saveSessionLog(
      db,
      {
        workoutId: workout.id,
        workoutName: workout.name,
        planSessionId: plan?.planSessionId ?? null,
        scheduledDate: plan?.date ?? null,
        startedAt: `${date}T18:00:00`,
        completedAt: `${date}T18:00:00`,
        rpe: 7 + (date.charCodeAt(9) % 3), // 7-9, varied by date
        notes: '',
        bodyweightKg: BODYWEIGHT,
        durationSec: draftEstimateSec(draft),
      },
      draftToSetLogs(draft),
    );
  };
  const weight = (exerciseId: string, kg: number) => (draft: DraftItem[]) =>
    draft.filter((i) => i.exerciseId === exerciseId).forEach((i) => i.sets.forEach((s) => (s.weightKg = kg)));
  const grades = (list: string[]) => (draft: DraftItem[]) =>
    draft
      .filter((i) => i.exerciseId === 'limit-bouldering')
      .forEach((i) => i.sets.forEach((s, k) => (s.grade = list[k % list.length])));

  // Eight weeks of steady progress.
  const GRADES = [
    ['6C', '6C+', '7A', '6C+', '6C'],
    ['6C+', '7A', '6C+', '7A', '6C'],
    ['7A', '6C+', '7A', '7A+', '6C+'],
    ['7A', '7A+', '7A', '6C+', '7A'],
  ];
  for (let week = 8; week >= 1; week--) {
    const monday = addDays(thisMonday, -7 * week);
    const step = 8 - week;
    await log('wo-max-hangs', monday, weight('max-hangs', 8 + step * 2));
    await log('wo-limit-bouldering', addDays(monday, 2), grades(GRADES[Math.floor(step / 2)]));
    await log('wo-pull-strength', addDays(monday, 3), weight('weighted-pullups', 10 + step * 1.5));
    await log(week % 2 ? 'wo-4x4' : 'wo-arc', addDays(monday, 5));
    if (week % 2 === 0) await log('wo-antagonist', addDays(monday, 6));
    else
      await log('wo-full-body', addDays(monday, 6), (d) => {
        weight('deadlift', 90 + step * 2.5)(d);
        weight('overhead-press', 40 + step)(d);
        weight('weighted-pullups', 10 + step * 1.5)(d);
      });
  }

  // Max tests: a baseline before the block and a retest midway.
  const test = async (date: string, exerciseId: string, attempts: number[], made: number, kind: 'hold' | 'reps', reps = 1) => {
    const ex = exercises.get(exerciseId)!;
    const best = attempts[made - 1];
    const maxKg = kind === 'reps' && reps > 1 ? Math.round(((BODYWEIGHT + best) * (1 + reps / 30) - BODYWEIGHT) * 2) / 2 : best;
    await saveTestSession(
      db,
      {
        workoutId: null,
        workoutName: `Max test: ${ex.name}`,
        planSessionId: null,
        scheduledDate: null,
        startedAt: `${date}T17:00:00`,
        completedAt: `${date}T17:00:00`,
        rpe: 9,
        notes: '',
        bodyweightKg: BODYWEIGHT,
        durationSec: attempts.length * 200,
      },
      attempts.map((kg, setIndex) => ({
        exerciseId,
        exerciseName: ex.name,
        itemIndex: 0,
        setIndex,
        weightKg: kg,
        reps: kind === 'reps' ? reps : null,
        durationSec: kind === 'hold' ? 5 : null,
        grade: null,
        completed: setIndex < made,
        notes: '',
        estSec: 200,
        location: null,
        discipline: null,
      })),
      [{ exerciseId, kind, holdSec: kind === 'hold' ? 5 : null, reps: kind === 'reps' ? reps : null, weightKg: best, maxKg, bodyweightKg: BODYWEIGHT }],
    );
  };
  await test(addDays(thisMonday, -60), 'max-hangs', [20, 24, 27, 30], 3, 'hold');
  await test(addDays(thisMonday, -25), 'max-hangs', [24, 28, 31, 33], 3, 'hold');
  await test(addDays(thisMonday, -24), 'weighted-pullups', [15, 20, 25], 3, 'reps', 3);

  // The example plan, started last Monday, with this week's sessions done so far.
  const parsed = parseImport(JSON.stringify(EXAMPLE_PLAN), {
    exercises: [...exercises.values()],
    workouts: [...workouts.values()],
  });
  if (!parsed.ok) return;
  const planId = await applyImport(db, parsed.preview);
  if (!planId) return;
  const start = addDays(thisMonday, -7);
  await activatePlan(db, planId, start);
  const bundle = await getPlanBundle(db, planId);
  if (!bundle) return;
  // The plan brought its own workouts.
  for (const w of await listWorkouts(db)) workouts.set(w.id, w);
  for (const s of sessionsInRange(start, bundle.blocks, bundle.sessions, start, addDays(t, -1))) {
    await log(s.session.workoutId, s.date, weight('max-hangs', 22), { planSessionId: s.session.id, date: s.date });
  }
}
