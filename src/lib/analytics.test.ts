import { describe, expect, it } from 'vitest';

import {
  activityBuckets,
  exerciseSummaries,
  foldSlices,
  inPeriod,
  timeByType,
  workoutSummaries,
  type SessionPoint,
  type TypedSet,
} from './analytics';
import { formatHours } from './format';

const today = '2026-10-14'; // Wednesday

describe('timeByType', () => {
  it('splits each session’s real duration by the estimated time of its sets', () => {
    const sessions: SessionPoint[] = [
      { id: 'a', date: today, durationSec: 3600 },
      { id: 'b', date: today, durationSec: 1200 },
    ];
    const sets: TypedSet[] = [
      // Session a: estimates 300 + 900 -> 1:3 split of its 60 minutes.
      { sessionId: 'a', type: 'finger-strength', estSec: 300 },
      { sessionId: 'a', type: 'endurance', estSec: 900 },
      { sessionId: 'b', type: 'endurance', estSec: 100 },
      // Sets from sessions outside the period are ignored.
      { sessionId: 'zz', type: 'power', estSec: 500 },
    ];
    expect(timeByType(sessions, sets)).toEqual([
      { type: 'finger-strength', sec: 900 },
      { type: 'endurance', sec: 2700 + 1200 },
    ]);
  });
});

describe('foldSlices', () => {
  it('keeps the biggest types and folds the rest into Other, in a stable order', () => {
    const slices = foldSlices(
      [
        { type: 'finger-strength', sec: 50 },
        { type: 'strength', sec: 40 },
        { type: 'power', sec: 5 },
        { type: 'power-endurance', sec: 30 },
        { type: 'endurance', sec: 60 },
        { type: 'technique', sec: 20 },
        { type: 'prehab', sec: 10 },
        { type: 'other', sec: 5 },
      ],
      6,
    );
    expect(slices.map((s) => s.key)).toEqual(['finger-strength', 'strength', 'power-endurance', 'endurance', 'technique', 'other']);
    expect(slices[5].types).toEqual(['power', 'prehab', 'other']);
    expect(slices.reduce((n, s) => n + s.fraction, 0)).toBeCloseTo(1);
  });

  it('does not fold when everything fits', () => {
    expect(foldSlices([{ type: 'strength', sec: 1 }, { type: 'other', sec: 1 }]).map((s) => s.key)).toEqual(['strength', 'other']);
    expect(foldSlices([])).toEqual([]);
  });
});

describe('activityBuckets', () => {
  const sessions: SessionPoint[] = [
    { id: '1', date: '2026-10-14', durationSec: 3600 },
    { id: '2', date: '2026-10-14', durationSec: 1800 },
    { id: '3', date: '2026-10-09', durationSec: 600 },
    { id: '4', date: '2026-08-01', durationSec: 900 },
  ];

  it('has one bar per day for 7 days, labelled by weekday', () => {
    const b = activityBuckets(sessions, '7d', today, 'sessions');
    expect(b).toHaveLength(7);
    expect(b[0]).toMatchObject({ start: '2026-10-08', label: 'T' });
    expect(b.map((x) => x.value)).toEqual([0, 1, 0, 0, 0, 0, 2]);
    expect(activityBuckets(sessions, '7d', today, 'time').at(-1)!.value).toBe(5400);
  });

  it('groups 90 days by Monday-start week and all time by month', () => {
    const weeks = activityBuckets(sessions, '90d', today, 'sessions');
    expect(weeks[0].start).toBe('2026-07-13');
    expect(weeks.at(-1)).toMatchObject({ start: '2026-10-12', value: 2 });
    const months = activityBuckets(sessions, 'all', today, 'time');
    expect(months.map((m) => m.label)).toEqual(['Aug', 'Sep', 'Oct']);
    expect(months.map((m) => m.value)).toEqual([900, 0, 6000]);
  });

  it('filters items to a period', () => {
    expect(inPeriod(sessions, '7d', today).map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(inPeriod(sessions, 'all', today)).toHaveLength(4);
  });
});

describe('formatHours', () => {
  it('formats totals', () => {
    expect(formatHours(45 * 60)).toBe('45 min');
    expect(formatHours(6 * 3600)).toBe('6 h');
    expect(formatHours(6 * 3600 + 20 * 60)).toBe('6 h 20 min');
  });
});

describe('summaries', () => {
  it('totals time and sessions per exercise and per workout', () => {
    const sessions = [
      { id: 'a', date: '2026-10-10', durationSec: 1000, workoutId: 'w1', workoutName: 'Hangs' },
      { id: 'b', date: '2026-10-12', durationSec: 600, workoutId: 'w1', workoutName: 'Hangs' },
      { id: 'c', date: '2026-10-13', durationSec: 300, workoutId: null, workoutName: 'Pull-ups' },
    ];
    const set = (sessionId: string, exerciseId: string, estSec: number) => ({
      sessionId,
      exerciseId,
      exerciseName: exerciseId,
      type: 'finger-strength' as const,
      estSec,
    });
    const ex = exerciseSummaries(sessions, [set('a', 'max-hangs', 1), set('a', 'warmup', 1), set('b', 'max-hangs', 2), set('c', 'pullups', 5)]);
    expect(ex[0]).toMatchObject({ exerciseId: 'max-hangs', sec: 500 + 600, sessions: 2, lastDate: '2026-10-12' });
    expect(ex.map((e) => e.exerciseId)).toEqual(['max-hangs', 'warmup', 'pullups']);

    const wo = workoutSummaries(sessions);
    expect(wo).toEqual([
      { workoutId: 'w1', name: 'Hangs', sec: 1600, sessions: 2, lastDate: '2026-10-12' },
      { workoutId: null, name: 'Pull-ups', sec: 300, sessions: 1, lastDate: '2026-10-13' },
    ]);
  });
});
