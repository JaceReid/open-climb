// Repository tests against Node's SQLite (see test-db.ts).
import { describe, expect, it, vi } from 'vitest';

import { EXAMPLE_PLAN } from '@/lib/import/example';
import { parseImport } from '@/lib/import/resolve';
import { planToFile } from '@/lib/import/review';

import { migrate } from './migrations';
import {
  activatePlan,
  applyImport,
  applyPlanUpdate,
  completedPlanSessions,
  getPlanBundle,
  getWorkout,
  listExercises,
  listWorkouts,
  saveSessionLog,
} from './repo';
import { openDb } from './test-db';

// The change bus pulls in React; repository writes only need it to be callable.
vi.mock('./store', () => ({ notifyChange: () => {} }));

describe('applyPlanUpdate', () => {
  it('updates a plan in place and keeps logged sessions ticked off', async () => {
    const { db } = openDb();
    await migrate(db);

    // Import and start the example plan, then log its first Monday.
    const imported = parseImport(JSON.stringify(EXAMPLE_PLAN), {
      exercises: await listExercises(db),
      workouts: await listWorkouts(db),
    });
    if (!imported.ok) throw new Error(imported.errors.join());
    const planId = (await applyImport(db, imported.preview))!;
    await activatePlan(db, planId, '2026-10-05');
    const before = (await getPlanBundle(db, planId))!;
    const monday = before.sessions.find((s) => s.blockId === before.blocks[0].id && s.week === 1 && s.day === 0)!;
    await saveSessionLog(
      db,
      {
        workoutId: monday.workoutId,
        workoutName: 'Hangs + Pulls',
        planSessionId: monday.id,
        scheduledDate: '2026-10-05',
        startedAt: '2026-10-05T18:00:00',
        completedAt: '2026-10-05T19:00:00',
        rpe: 8,
        notes: '',
        bodyweightKg: 70,
        durationSec: 3600,
      },
      [],
    );

    // What Claude would send back: the exported plan with an extra ARC day and a heavier hang.
    const workoutsById = new Map((await listWorkouts(db)).map((w) => [w.id, w]));
    const file = planToFile(before, workoutsById);
    file.blocks[0].schedule.push({ day: 'thu', workouts: ['wo-arc'] });
    const hangs = file.workouts.find((w) => w.name === 'Hangs + Pulls')!;
    hangs.items[1] = { ...hangs.items[1], weightKg: 12 };

    const update = parseImport(JSON.stringify(file), {
      exercises: await listExercises(db),
      workouts: await listWorkouts(db),
      plans: [{ id: planId, name: before.plan.name }],
    });
    if (!update.ok) throw new Error(update.errors.join());
    expect(update.preview.updatePlan?.id).toBe(planId);
    const workoutCount = (await listWorkouts(db)).length;

    await applyPlanUpdate(db, planId, update.preview);

    const after = (await getPlanBundle(db, planId))!;
    expect(after.plan).toMatchObject({ startDate: '2026-10-05', isActive: true });
    // Weeks 1-3 gained a Thursday ARC session (week 4 has its own schedule).
    expect(after.sessions).toHaveLength(before.sessions.length + 3);
    // The custom workout was updated in place, not duplicated.
    expect((await listWorkouts(db)).length).toBe(workoutCount);
    expect((await getWorkout(db, hangs.id))!.items[1].weightKg).toBe(12);
    // Monday's log now points at the new Monday session, so it still shows as done.
    const newMonday = after.sessions.find((s) => s.blockId === after.blocks[0].id && s.week === 1 && s.day === 0)!;
    expect(newMonday.id).not.toBe(monday.id);
    expect(await completedPlanSessions(db, '2026-10-05', '2026-10-11')).toEqual(new Set([`${newMonday.id}@2026-10-05`]));
  });
});
