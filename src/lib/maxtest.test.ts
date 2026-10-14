import { describe, expect, it } from 'vitest';

import { BUILT_IN_EXERCISES } from '@/data/library';

import { applyMaxes, testKind, testResult, workingWeightKg } from './maxtest';
import type { MaxTest } from './types';

const ex = (id: string) => BUILT_IN_EXERCISES.find((e) => e.id === id)!;
const max = (maxKg: number, bodyweightKg: number | null): Pick<MaxTest, 'maxKg' | 'bodyweightKg'> => ({ maxKg, bodyweightKg });

describe('testKind', () => {
  it('tests hangs and edge lifts as holds and strength lifts as reps', () => {
    expect(testKind(ex('max-hangs'))).toBe('hold');
    expect(testKind(ex('block-lifts'))).toBe('hold');
    expect(testKind(ex('weighted-pullups'))).toBe('reps');
    expect(testKind(ex('deadlift'))).toBe('reps');
    // No weight, or reps that aren't a strength lift: nothing to test.
    expect(testKind(ex('arc'))).toBeNull();
    expect(testKind(ex('repeaters-7-3'))).toBeNull();
  });
});

describe('testResult', () => {
  const attempts = [
    { weightKg: 20, success: true },
    { weightKg: 25, success: true },
    { weightKg: 30, success: false },
  ];
  it('takes the heaviest successful hold', () => {
    expect(testResult(attempts, 'hold', 1, true, 70)).toEqual({ weightKg: 25, maxKg: 25 });
    expect(testResult([{ weightKg: 30, success: false }], 'hold', 1, true, 70)).toBeNull();
  });

  it('estimates a 1RM on total load for multi-rep tests', () => {
    // (70 + 25) * (1 + 3/30) = 104.5 total -> +34.5 added
    expect(testResult(attempts, 'reps', 3, true, 70)).toEqual({ weightKg: 25, maxKg: 34.5 });
    // Barbell: 100 kg x 5 -> 116.67 -> 116.5
    expect(testResult([{ weightKg: 100, success: true }], 'reps', 5, false, null)).toEqual({ weightKg: 100, maxKg: 116.5 });
  });
});

describe('workingWeightKg', () => {
  it('uses 80% of total load for bodyweight exercises', () => {
    // 70 + 30 = 100 total; 80% = 80 -> +10
    expect(workingWeightKg(max(30, 70), 80, true, 70)).toBe(10);
    // Lighter now (68 kg): same 80 kg total -> +12
    expect(workingWeightKg(max(30, 70), 80, true, 68)).toBe(12);
    // Can go negative (assisted)
    expect(workingWeightKg(max(-10, 70), 80, true, 70)).toBe(-22);
    // No bodyweight anywhere: can't compute
    expect(workingWeightKg(max(30, null), 80, true, null)).toBeNull();
  });

  it('uses a plain % for external loads, rounded to 0.5 kg', () => {
    expect(workingWeightKg(max(43, null), 80, false, 70)).toBe(34.5);
  });
});

describe('applyMaxes', () => {
  it('fills weights for % of max items and flags ones needing a test', () => {
    const exercises = new Map(BUILT_IN_EXERCISES.map((e) => [e.id, e]));
    const maxes = new Map([['max-hangs', { ...max(30, 70), id: 't', exerciseId: 'max-hangs' } as MaxTest]]);
    const items = applyMaxes(
      [
        { exerciseId: 'max-hangs', sets: 5, reps: 1, pctOfMax: 80, weightKg: 5 },
        { exerciseId: 'weighted-pullups', sets: 4, reps: 5, pctOfMax: 80, weightKg: 15 },
        { exerciseId: 'deadlift', sets: 3, reps: 5, weightKg: 100 },
      ],
      exercises,
      maxes,
      70,
    );
    expect(items[0].weightKg).toBe(10);
    expect(items[1]).toMatchObject({ weightKg: 15, needsTest: true });
    expect(items[2]).toEqual({ exerciseId: 'deadlift', sets: 3, reps: 5, weightKg: 100 });
  });
});
