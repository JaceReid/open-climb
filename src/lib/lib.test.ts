import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_EXERCISES,
  BUILT_IN_WORKOUTS,
  exerciseOrigin,
  matchesLibraryExercise,
  matchesLibraryWorkout,
} from '@/data/library';

import { addDays, daysBetween, mondayOf, weekdayOf } from './dates';
import { displayWeight, formatClock, formatDetails, formatDuration, formatSetsReps, unitToKg } from './format';
import { maxGrade } from './grades';
import { epley, sessionSeries, weightTrend, type LoggedSet } from './metrics';
import { planPosition, sessionsInRange } from './schedule';
import { buildSteps, estimateWorkoutSec } from './timer';
import type { PlanBlock, PlanSession } from './types';

describe('dates', () => {
  it('handles weekdays and Mondays', () => {
    expect(weekdayOf('2026-10-12')).toBe(0); // Monday
    expect(weekdayOf('2026-10-18')).toBe(6); // Sunday
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-03-23', '2026-04-06')).toBe(14); // across a DST change
  });
});

describe('timer steps', () => {
  it('builds repeaters with prep, rep rests and set rests', () => {
    const steps = buildSteps([{ exerciseId: 'x', sets: 2, reps: 3, workSec: 7, restSec: 3, setRestSec: 180 }], 5);
    expect(steps.map((s) => s.kind)).toEqual([
      'ready', 'prep',
      'work', 'rest', 'work', 'rest', 'work',
      'setRest',
      'work', 'rest', 'work', 'rest', 'work',
    ]);
    expect(steps.filter((s) => s.endsSet).map((s) => s.setIndex)).toEqual([0, 1]);
  });

  it('uses manual steps for untimed sets', () => {
    const steps = buildSteps([{ exerciseId: 'x', sets: 3, reps: 5, setRestSec: 120 }], 5);
    expect(steps.map((s) => s.kind)).toEqual(['ready', 'manual', 'setRest', 'manual', 'setRest', 'manual']);
  });

  it('every built-in workout produces steps and a plausible estimate', () => {
    for (const w of BUILT_IN_WORKOUTS) {
      expect(buildSteps(w.items, 5).length).toBeGreaterThan(1);
      const min = estimateWorkoutSec(w.items) / 60;
      expect(min).toBeGreaterThan(3);
      expect(min).toBeLessThan(120);
    }
  });
});

describe('library', () => {
  it('has unique ids', () => {
    const ids = [...BUILT_IN_EXERCISES.map((e) => e.id), ...BUILT_IN_WORKOUTS.map((w) => w.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('format', () => {
  it('formats durations and prescriptions', () => {
    expect(formatDuration(10)).toBe('10s');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(1200)).toBe('20 min');
    expect(formatClock(6.2)).toBe('0:07');
    expect(formatSetsReps({ sets: 4, reps: 6, workSec: 7, restSec: 3 })).toBe('4 sets × 6 × 7s on / 3s off');
    expect(formatSetsReps({ sets: 5, reps: 1, workSec: 10 })).toBe('5 sets × 10s');
    expect(formatSetsReps({ sets: 3, reps: 5 })).toBe('3 sets × 5 reps');
  });

  it('converts units', () => {
    expect(displayWeight(unitToKg(45, 'lb'), 'lb')).toBe(45);
    expect(displayWeight(10, 'lb')).toBe(22);
  });
});

describe('metrics', () => {
  it('estimates 1RM', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 5)).toBeCloseTo(116.67, 1);
    expect(epley(100, 20)).toBeNull();
  });

  it('builds session points with bodyweight-relative load', () => {
    const base = { durationSec: null, grade: null, completed: true, bodyweightKg: 70 };
    const sets: LoggedSet[] = [
      { ...base, sessionId: 'a', completedAt: '2026-10-01T10:00:00', weightKg: 10, reps: 5 },
      { ...base, sessionId: 'a', completedAt: '2026-10-01T10:00:00', weightKg: 15, reps: 3 },
      { ...base, sessionId: 'b', completedAt: '2026-10-08T10:00:00', weightKg: 20, reps: 1, completed: false },
    ];
    const pullups = BUILT_IN_EXERCISES.find((e) => e.id === 'weighted-pullups')!;
    const points = sessionSeries(sets, pullups, null);
    expect(points).toHaveLength(1);
    expect(points[0].topWeightKg).toBe(15);
    expect(points[0].pctBodyweight).toBeCloseTo((85 / 70) * 100);
    // (70+15) * 1.1 - 70 = 23.5 beats (70+10) * 1.1667 - 70 = 23.33
    expect(points[0].e1rmKg).toBeCloseTo(23.5);
  });

  it('finds the max Font grade', () => {
    expect(maxGrade(['6C+', '7A', null, 'junk', '6a+'])).toBe('7A');
  });
});

describe('schedule', () => {
  const blocks: PlanBlock[] = [
    { id: 'b2', planId: 'p', position: 1, name: 'Deload', focus: '', notes: '', weeks: 1 },
    { id: 'b1', planId: 'p', position: 0, name: 'Strength', focus: '', notes: '', weeks: 3 },
  ];
  const sessions: PlanSession[] = [
    { id: 's1', blockId: 'b1', week: 1, day: 0, position: 0, workoutId: 'w', notes: '' },
    { id: 's2', blockId: 'b1', week: 3, day: 4, position: 0, workoutId: 'w', notes: '' },
    { id: 's3', blockId: 'b2', week: 1, day: 1, position: 0, workoutId: 'w', notes: '' },
  ];

  it('places sessions on dates', () => {
    const all = sessionsInRange('2026-10-12', blocks, sessions, '2026-01-01', '2027-01-01');
    expect(all.map((s) => [s.session.id, s.date])).toEqual([
      ['s1', '2026-10-12'],
      ['s2', '2026-10-30'],
      ['s3', '2026-11-03'],
    ]);
  });

  it('finds the current block and week', () => {
    expect(planPosition('2026-10-12', blocks, '2026-10-11')).toBeNull();
    expect(planPosition('2026-10-12', blocks, '2026-10-20')).toMatchObject({ blockIndex: 0, week: 2, planWeek: 2 });
    expect(planPosition('2026-10-12', blocks, '2026-11-08')).toMatchObject({ blockIndex: 1, week: 1, planWeek: 4 });
    expect(planPosition('2026-10-12', blocks, '2026-11-09')).toBeNull();
  });
});

describe('library origin', () => {
  it('tells library, edited and custom items apart', () => {
    const maxHangs = BUILT_IN_EXERCISES.find((e) => e.id === 'max-hangs')!;
    expect(exerciseOrigin(maxHangs)).toBe('library');
    expect(exerciseOrigin({ ...maxHangs, builtIn: false })).toBe('edited');
    expect(exerciseOrigin({ id: 'ex-123', builtIn: false })).toBe('custom');

    // Same content in a different key order (or with undefined fields) still matches.
    const reordered = { ...maxHangs, defaults: { workSec: 10, ...maxHangs.defaults, notes: undefined } };
    expect(matchesLibraryExercise(reordered)).toBe(true);
    expect(matchesLibraryExercise({ ...maxHangs, defaults: { ...maxHangs.defaults, sets: 6 } })).toBe(false);

    const workout = BUILT_IN_WORKOUTS[0];
    expect(matchesLibraryWorkout({ ...workout })).toBe(true);
    expect(matchesLibraryWorkout({ ...workout, name: 'Mine' })).toBe(false);
  });
});

describe('weightTrend', () => {
  it('compares the first and latest weighted session in the window', () => {
    const p = (date: string, topWeightKg: number | null) => ({
      sessionId: date,
      date,
      topWeightKg,
      e1rmKg: null,
      pctBodyweight: null,
      maxGrade: null,
      totalReps: 0,
      maxDurationSec: null,
    });
    const series = [p('2026-08-01', 5), p('2026-09-20', 8), p('2026-10-01', null), p('2026-10-10', 12), p('2026-10-12', 10)];
    expect(weightTrend(series, null)).toMatchObject({ bestKg: 12, changeKg: 5, latest: { date: '2026-10-12' } });
    expect(weightTrend(series, '2026-09-15')).toMatchObject({ bestKg: 12, changeKg: 2 });
    expect(weightTrend(series, '2026-10-11')).toMatchObject({ changeKg: null });
    expect(weightTrend(series, '2026-11-01')).toBeNull();
  });
});

describe('formatDetails with % of max', () => {
  it('shows the computed weight with its percentage, or that a test is needed', () => {
    const hangs = { bodyweight: true };
    expect(formatDetails({ sets: 5, reps: 1, pctOfMax: 80, weightKg: 10 }, hangs, 'kg')).toBe('+10 kg (80% max)');
    expect(formatDetails({ sets: 5, reps: 1, pctOfMax: 80, needsTest: true }, hangs, 'kg')).toBe('80% of max (test needed)');
    expect(formatDetails({ sets: 1, reps: 1, weightKg: 0 }, hangs, 'kg')).toBe('');
  });
});
