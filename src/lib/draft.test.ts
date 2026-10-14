import { describe, expect, it } from 'vitest';

import { BUILT_IN_EXERCISES, BUILT_IN_WORKOUTS } from '@/data/library';

import { addDraftExercise, buildDraft, draftToSetLogs, singleExerciseWorkout } from './draft';

const exercises = new Map(BUILT_IN_EXERCISES.map((e) => [e.id, e]));
const ex = (id: string) => exercises.get(id)!;

describe('draft', () => {
  it('prefills sets from the prescription and timer completion', () => {
    const workout = BUILT_IN_WORKOUTS.find((w) => w.id === 'wo-pull-strength')!;
    const draft = buildDraft(workout, exercises, new Set(['0:0', '0:1']));
    expect(draft[0].sets.map((s) => s.completed)).toEqual([true, true, false, false]);
    // Weighted pull-ups: bodyweight exercise without a prescribed load starts at +0.
    expect(draft[0].sets[0]).toMatchObject({ weightKg: 0, reps: 5, durationSec: null });
  });

  it('adds a swapped-in exercise after the existing ones, all sets done', () => {
    const workout = BUILT_IN_WORKOUTS.find((w) => w.id === 'wo-max-hangs')!;
    const draft = addDraftExercise(buildDraft(workout, exercises, 'all'), ex('density-hangs'));
    const added = draft[draft.length - 1];
    expect(added).toMatchObject({ itemIndex: 2, exerciseId: 'density-hangs' });
    expect(added.sets).toHaveLength(4);
    expect(added.sets.every((s) => s.completed && s.durationSec === 30)).toBe(true);
  });

  it('logs a single exercise as its own session', () => {
    const workout = singleExerciseWorkout(ex('limit-bouldering'));
    expect(workout).toMatchObject({ id: '', name: 'Limit Bouldering' });
    const sets = draftToSetLogs(buildDraft(workout, exercises, 'all'));
    expect(sets).toHaveLength(5);
    expect(sets[0]).toMatchObject({ exerciseId: 'limit-bouldering', itemIndex: 0, grade: null, completed: true });
  });
});
