import { describe, expect, it } from 'vitest';

import { BUILT_IN_EXERCISES, BUILT_IN_WORKOUTS } from '@/data/library';

import { EXAMPLE_PLAN } from './example';
import { buildClaudePrompt } from './prompt';
import { extractJson, parseImport } from './resolve';

const ctx = { exercises: BUILT_IN_EXERCISES, workouts: BUILT_IN_WORKOUTS };

describe('extractJson', () => {
  it('reads JSON wrapped in a code fence with chatter around it', () => {
    const text = 'Here is your plan:\n```json\n{"a": 1}\n```\nGood luck!';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('gives a friendly error when there is no JSON', () => {
    expect(() => extractJson('no json here')).toThrow(/No JSON object found/);
  });
});

describe('parseImport', () => {
  it('imports the example plan', () => {
    const result = parseImport(JSON.stringify(EXAMPLE_PLAN), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { preview } = result;
    expect(preview.plan?.name).toBe('Autumn Finger Strength');
    expect(preview.newExercises.map((e) => e.name)).toEqual(['Pinch Block Lifts']);
    expect(preview.newExercises[0].type).toBe('finger-strength');
    expect(preview.newWorkouts).toHaveLength(2);
    expect(preview.warnings).toEqual([]);

    const [strength, deload] = preview.blocks;
    // Weeks 1-3: 5 sessions (Fri has two workouts). Week 4 override: 2 sessions.
    expect(strength.sessions).toHaveLength(5 * 3 + 2);
    expect(strength.sessions.filter((s) => s.week === 4).map((s) => s.day)).toEqual([0, 3]);
    const fri = strength.sessions.filter((s) => s.week === 1 && s.day === 4);
    expect(fri.map((s) => s.position)).toEqual([0, 1]);
    expect(fri[1].workoutId).toBe('wo-antagonist');
    expect(deload.sessions).toHaveLength(2);

    // Library exercises are referenced, not duplicated.
    const hangs = preview.newWorkouts[0].items[1];
    expect(hangs.exerciseId).toBe('max-hangs');
    expect(hangs.weightKg).toBe(10);
  });

  it('matches exercises by name and creates placeholders for unknown ones', () => {
    const file = {
      workouts: [
        {
          id: 'w',
          name: 'W',
          items: [
            { exercise: 'Weighted pull-ups', sets: 3, reps: 5 },
            { exercise: 'Sloper hangs', sets: 3, reps: 1, workSec: 10 },
          ],
        },
      ],
    };
    const result = parseImport(JSON.stringify(file), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.newWorkouts[0].items[0].exerciseId).toBe('weighted-pullups');
    expect(result.preview.newExercises).toHaveLength(1);
    expect(result.preview.newExercises[0].tracks).toEqual(['duration']);
    expect(result.preview.newExercises[0].type).toBe('other');
    expect(result.preview.warnings[0]).toMatch(/Sloper hangs/);
    expect(result.preview.plan).toBeNull();
  });

  it('reports readable paths for invalid fields', () => {
    const file = {
      plan: { name: 'P' },
      blocks: [{ name: 'B', weeks: 2, schedule: [{ day: 'funday', workouts: ['wo-arc'] }] }],
    };
    const result = parseImport(JSON.stringify(file), ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/^blocks\[0\]\.schedule\[0\]\.day: unknown day "funday"/);
  });

  it('errors on unknown workout references', () => {
    const file = { plan: { name: 'P' }, blocks: [{ name: 'B', weeks: 1, schedule: [{ day: 'mon', workouts: ['nope'] }] }] };
    const result = parseImport(JSON.stringify(file), ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/unknown workout "nope"/);
  });

  it('accepts nulls, full day names, the single "workout" shorthand and snaps start date to Monday', () => {
    const file = {
      plan: { name: 'P', startDate: '2026-10-15', description: null },
      blocks: [{ name: 'B', weeks: 1, schedule: [{ day: 'Thursday', workout: 'ARC Session' }] }],
    };
    const result = parseImport(JSON.stringify(file), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.plan?.startDate).toBe('2026-10-12');
    expect(result.preview.blocks[0].sessions[0]).toMatchObject({ day: 3, workoutId: 'wo-arc' });
    expect(result.preview.warnings[0]).toMatch(/moved from 2026-10-15 to 2026-10-12/);
  });

  it('requires a plan when blocks are given', () => {
    const file = { blocks: [{ name: 'B', weeks: 1, schedule: [] }] };
    const result = parseImport(JSON.stringify(file), ctx);
    expect(result.ok).toBe(false);
  });
});

describe('buildClaudePrompt', () => {
  it('lists library ids and embeds a valid example', () => {
    const prompt = buildClaudePrompt(BUILT_IN_EXERCISES, BUILT_IN_WORKOUTS);
    expect(prompt).toContain('- max-hangs: Max Hangs (fingerboard, finger-strength; logs weight, duration)');
    expect(prompt).toContain('- wo-arc: ARC Session (Aerobic capacity)');
    const example = prompt.slice(prompt.lastIndexOf('```json'));
    expect(parseImport(example, ctx).ok).toBe(true);
  });
});
