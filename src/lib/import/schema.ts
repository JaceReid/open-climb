// The "open-climb-plan" JSON format that Claude (or a human) writes and the app
// imports. Keep this backwards compatible: plans saved by users must keep
// importing. Documented in docs/plan-format.md.
import { z } from 'zod';

import { isDateString } from '../dates';
import { CATEGORIES, TRACK_FIELDS, TRAINING_TYPES, type Weekday } from '../types';

const WEEKDAYS: Record<string, Weekday> = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};

const weekday = z.union([z.string(), z.number()]).transform((v, ctx): Weekday => {
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 1 && v <= 7) return (v - 1) as Weekday;
    ctx.addIssue({ code: 'custom', message: 'day number must be 1 (Mon) to 7 (Sun)' });
    return z.NEVER;
  }
  const d = WEEKDAYS[v.trim().toLowerCase()];
  if (d === undefined) {
    ctx.addIssue({ code: 'custom', message: `unknown day "${v}" (use mon, tue, wed, thu, fri, sat, sun)` });
    return z.NEVER;
  }
  return d;
});

const seconds = z.number().min(0).max(36_000);

export const prescriptionShape = {
  sets: z.number().int().min(1).max(100).default(1),
  reps: z.number().int().min(1).max(1000).default(1),
  workSec: seconds.optional(),
  restSec: seconds.optional(),
  setRestSec: seconds.optional(),
  weightKg: z.number().min(-500).max(1000).optional(),
  pctOfMax: z.number().positive().max(150).optional(),
  intensity: z.string().optional(),
  edgeMm: z.number().positive().max(200).optional(),
  grip: z.string().optional(),
  notes: z.string().optional(),
  setLabels: z.array(z.string()).optional(),
};

export const importExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(CATEGORIES).catch('other'),
  // Optional for backwards compatibility; unknown values fall back to the category's default.
  type: z.enum(TRAINING_TYPES).optional().catch(undefined),
  description: z.string().default(''),
  instructions: z.string().default(''),
  equipment: z.string().default(''),
  tracks: z.array(z.enum(TRACK_FIELDS)).default([]),
  bodyweight: z.boolean().default(false),
});

export const importItemSchema = z.object({
  exercise: z.string().min(1),
  ...prescriptionShape,
});

export const importWorkoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  focus: z.string().default(''),
  description: z.string().default(''),
  items: z.array(importItemSchema).min(1),
  test: z.boolean().default(false),
});

export const importDaySchema = z.preprocess(
  // Accept { "workout": "x" } as shorthand for { "workouts": ["x"] }.
  (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (o.workouts === undefined && typeof o.workout === 'string') {
        return { ...o, workouts: [o.workout] };
      }
    }
    return v;
  },
  z.object({
    day: weekday,
    workouts: z.array(z.string().min(1)).min(1),
    notes: z.string().default(''),
  }),
);

export const importBlockSchema = z
  .object({
    name: z.string().min(1),
    focus: z.string().default(''),
    notes: z.string().default(''),
    weeks: z.number().int().min(1).max(52),
    schedule: z.array(importDaySchema).default([]),
    weekOverrides: z
      .array(z.object({ week: z.number().int().min(1), schedule: z.array(importDaySchema) }))
      .default([]),
  })
  .superRefine((b, ctx) => {
    b.weekOverrides.forEach((o, i) => {
      if (o.week > b.weeks) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekOverrides', i, 'week'],
          message: `week ${o.week} is past the end of this ${b.weeks}-week block`,
        });
      }
    });
  });

export const importFileSchema = z
  .object({
    format: z.literal('open-climb-plan').optional(),
    version: z.number().optional(),
    // Set when Claude returns an updated version of an existing plan.
    planId: z.string().optional(),
    plan: z
      .object({
        name: z.string().min(1),
        description: z.string().default(''),
        goal: z.string().default(''),
        startDate: z.string().refine(isDateString, 'must be a date like 2026-10-12').optional(),
      })
      .optional(),
    exercises: z.array(importExerciseSchema).default([]),
    workouts: z.array(importWorkoutSchema).default([]),
    blocks: z.array(importBlockSchema).default([]),
  })
  .superRefine((f, ctx) => {
    if (f.blocks.length > 0 && !f.plan) {
      ctx.addIssue({ code: 'custom', path: ['plan'], message: 'a "plan" object is required when "blocks" are given' });
    }
    if (f.blocks.length === 0 && f.workouts.length === 0 && f.exercises.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'nothing to import: add "blocks", "workouts" or "exercises"' });
    }
  });

export type ImportFile = z.infer<typeof importFileSchema>;
