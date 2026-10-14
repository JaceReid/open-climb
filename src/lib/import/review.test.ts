import { describe, expect, it } from 'vitest';

import { BUILT_IN_EXERCISES, BUILT_IN_WORKOUTS } from '@/data/library';

import type { MaxTest, PlanBlock, PlanSession, SessionLog, SetLog, Workout } from '../types';
import { EXAMPLE_PLAN } from './example';
import { parseImport } from './resolve';
import { buildReviewPrompt, planToFile, trainingLog, type PlanData } from './review';

const exercises = new Map(BUILT_IN_EXERCISES.map((e) => [e.id, e]));

/** The example plan as if imported and stored: real ids, blocks and sessions. */
function storedExamplePlan(): { data: PlanData; workouts: Workout[] } {
  const result = parseImport(JSON.stringify(EXAMPLE_PLAN), { exercises: BUILT_IN_EXERCISES, workouts: BUILT_IN_WORKOUTS });
  if (!result.ok) throw new Error(result.errors.join());
  const { preview } = result;
  const blocks: PlanBlock[] = preview.blocks.map((b, i) => ({ id: `b${i}`, planId: 'p1', position: i, name: b.name, focus: b.focus, notes: b.notes, weeks: b.weeks }));
  const sessions: PlanSession[] = preview.blocks.flatMap((b, i) =>
    b.sessions.map((s, j) => ({ id: `s${i}-${j}`, blockId: `b${i}`, ...s })),
  );
  return {
    data: { plan: { id: 'p1', name: preview.plan!.name, description: '', goal: preview.plan!.goal, startDate: '2026-10-05', isActive: true }, blocks, sessions },
    workouts: [...BUILT_IN_WORKOUTS, ...preview.newWorkouts],
  };
}

describe('planToFile', () => {
  it('round-trips an existing plan as an in-place update', () => {
    const { data, workouts } = storedExamplePlan();
    const file = planToFile(data, new Map(workouts.map((w) => [w.id, w])));
    expect(file.planId).toBe('p1');
    // Custom workouts are included (to be edited); library ones are referenced by id.
    expect(file.workouts.map((w) => w.name).sort()).toEqual(['Deload Hangs', 'Hangs + Pulls']);
    expect(file.blocks[0].weekOverrides?.map((o) => o.week)).toEqual([4]);

    const again = parseImport(JSON.stringify(file), {
      exercises: BUILT_IN_EXERCISES,
      workouts,
      plans: [{ id: 'p1', name: data.plan.name }],
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.preview.updatePlan).toEqual({ id: 'p1', name: data.plan.name });
    expect(again.preview.newWorkouts).toEqual([]);
    expect(again.preview.updatedWorkouts.map((w) => w.name).sort()).toEqual(['Deload Hangs', 'Hangs + Pulls']);
    const count = (blocks: { sessions: unknown[] }[]) => blocks.reduce((n, b) => n + b.sessions.length, 0);
    expect(count(again.preview.blocks)).toBe(data.sessions.length);
  });
});

describe('trainingLog', () => {
  const log = (id: string, date: string, extra: Partial<SessionLog> = {}): SessionLog => ({
    id,
    workoutId: null,
    workoutName: 'Hangs',
    planSessionId: null,
    scheduledDate: null,
    startedAt: `${date}T18:00:00`,
    completedAt: `${date}T18:00:00`,
    rpe: 8,
    notes: '',
    bodyweightKg: 70,
    durationSec: 2700,
    ...extra,
  });
  const set = (exerciseId: string, extra: Partial<SetLog>): SetLog => ({
    id: Math.random().toString(),
    sessionId: 's',
    exerciseId,
    exerciseName: exercises.get(exerciseId)!.name,
    itemIndex: 0,
    setIndex: 0,
    weightKg: null,
    reps: null,
    durationSec: null,
    grade: null,
    completed: true,
    notes: '',
    estSec: 60,
    location: null,
    discipline: null,
    ...extra,
  });

  it('summarises maxes, weekly totals, adherence and sets', () => {
    const { data, workouts } = storedExamplePlan();
    const monday = data.sessions.find((s) => s.week === 1 && s.day === 0)!;
    const max: MaxTest = {
      id: 'm', exerciseId: 'max-hangs', testedAt: '2026-10-01T17:00:00', kind: 'hold', holdSec: 5, reps: null,
      weightKg: 31, maxKg: 31, bodyweightKg: 70, sessionId: null,
    };
    const text = trainingLog({
      sessions: [
        {
          log: log('a', '2026-10-05', { planSessionId: monday.id, scheduledDate: '2026-10-05', notes: 'Felt strong' }),
          sets: [
            ...[0, 1, 2].map((i) => set('max-hangs', { setIndex: i, weightKg: 22, durationSec: 10, notes: i % 2 ? 'front three' : 'half crimp' })),
            set('max-hangs', { setIndex: 3, weightKg: 24, durationSec: 10, completed: false }),
          ],
        },
        {
          log: log('b', '2026-10-10', { workoutName: 'Climbing Session' }),
          sets: [set('open-climbing', { itemIndex: 0, location: 'outdoor', discipline: 'route', durationSec: 7200 })],
        },
      ],
      maxes: [max],
      exercises,
      unit: 'kg',
      bodyweightKg: 70,
      from: '2026-10-01',
      today: '2026-10-12',
      plan: { ...data, workouts: new Map(workouts.map((w) => [w.id, w])) },
    });
    expect(text).toContain('- Max Hangs [max-hangs]: +31 kg (5 s hold), tested 1 Oct 2026');
    expect(text).toContain('- Week of 5 Oct: 2 sessions, 1 h 30 min');
    expect(text).toMatch(/Done 1 of \d+ planned sessions/);
    expect(text).toContain('Missed: Wed 7 Oct Limit Bouldering');
    expect(text).toContain('- Max Hangs: 3/4 sets · half crimp: +22 kg 10s ×2, front three: +22 kg 10s · not done: +24 kg 10s');
    expect(text).toContain('- Open Climbing: 1/1 sets · Outdoor routes 120 min');
    expect(text).toContain('Notes: Felt strong');

    const prompt = buildReviewPrompt({ log: text, planFile: planToFile(data, new Map(workouts.map((w) => [w.id, w]))), exercises: BUILT_IN_EXERCISES, workouts });
    expect(prompt).toContain('Keep "planId" exactly as it is');
    expect(prompt).toContain('"planId": "p1"');
  });
});
