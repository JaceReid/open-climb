// Parses pasted plan JSON and resolves every reference against the user's
// library, producing a preview that can be shown before anything is saved.
import type { z } from 'zod';

import { mondayOf, weekdayOf } from '../dates';
import { newId } from '../id';
import { defaultTrainingType, type Exercise, type TrackField, type Weekday, type Workout, type WorkoutItem } from '../types';
import { importFileSchema, type ImportFile } from './schema';

export interface ImportContext {
  exercises: Exercise[];
  workouts: Workout[];
  /** Existing plans, so a file with a matching planId can update one in place. */
  plans?: { id: string; name: string }[];
}

export interface PreviewSession {
  week: number;
  day: Weekday;
  position: number;
  workoutId: string;
  notes: string;
}

export interface PreviewBlock {
  name: string;
  focus: string;
  notes: string;
  weeks: number;
  sessions: PreviewSession[];
}

export interface ImportPreview {
  plan: { name: string; description: string; goal: string; startDate: string | null } | null;
  newExercises: Exercise[];
  newWorkouts: Workout[];
  /** Workouts in the file whose id already exists: saved over the existing one. */
  updatedWorkouts: Workout[];
  blocks: PreviewBlock[];
  warnings: string[];
  /** The existing plan this file is an update of, if any. */
  updatePlan: { id: string; name: string } | null;
}

export type ImportResult = { ok: true; preview: ImportPreview } | { ok: false; errors: string[] };

/** Pull a JSON object out of whatever was pasted (code fences, chatter around it). */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object found. Copy the whole JSON block from Claude, including the { and }.');
  }
  t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error(`The JSON is not valid: ${(e as Error).message}`);
  }
}

/** Remove nulls so `"weightKg": null` behaves like an omitted field. */
function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (val !== null) out[k] = stripNulls(val);
    return out;
  }
  return v;
}

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((s, p) => (typeof p === 'number' ? `${s}[${p}]` : s ? `${s}.${String(p)}` : String(p)), '');
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const path = formatPath(i.path);
    return path ? `${path}: ${i.message}` : i.message;
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function guessTracks(item: { workSec?: number; weightKg?: number }): TrackField[] {
  const tracks: TrackField[] = [];
  if (item.weightKg != null) tracks.push('weight');
  tracks.push(item.workSec ? 'duration' : 'reps');
  return tracks;
}

export function parseImport(text: string, ctx: ImportContext): ImportResult {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const parsed = importFileSchema.safeParse(stripNulls(raw));
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };
  return resolveImport(parsed.data, ctx);
}

export function resolveImport(file: ImportFile, ctx: ImportContext): ImportResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const existingById = new Map(ctx.exercises.map((e) => [e.id, e]));
  const existingByName = new Map(ctx.exercises.map((e) => [norm(e.name), e]));

  // Exercises declared in the file: reuse an existing one with the same name.
  const newExercises: Exercise[] = [];
  const fileExerciseIds = new Map<string, string>(); // file id -> db id
  for (const fe of file.exercises) {
    const match = existingById.get(fe.id) ?? existingByName.get(norm(fe.name));
    if (match) {
      fileExerciseIds.set(fe.id, match.id);
      continue;
    }
    const created: Exercise = {
      id: newId('ex-'),
      name: fe.name,
      category: fe.category,
      type: fe.type ?? defaultTrainingType(fe.category),
      description: fe.description,
      instructions: fe.instructions,
      equipment: fe.equipment,
      tracks: fe.tracks,
      bodyweight: fe.bodyweight,
      defaults: { sets: 1, reps: 1 },
      builtIn: false,
    };
    newExercises.push(created);
    fileExerciseIds.set(fe.id, created.id);
    existingByName.set(norm(created.name), created);
  }

  const resolveExercise = (ref: string, item: { workSec?: number; weightKg?: number }, where: string) => {
    const id = fileExerciseIds.get(ref) ?? existingById.get(ref)?.id ?? existingByName.get(norm(ref))?.id;
    if (id) return id;
    // Unknown exercise: create a placeholder rather than failing the import.
    const created: Exercise = {
      id: newId('ex-'),
      name: ref,
      category: 'other',
      type: 'other',
      description: '',
      instructions: '',
      equipment: '',
      tracks: guessTracks(item),
      bodyweight: false,
      defaults: { sets: 1, reps: 1 },
      builtIn: false,
    };
    newExercises.push(created);
    fileExerciseIds.set(ref, created.id);
    existingByName.set(norm(ref), created);
    warnings.push(`${where}: "${ref}" isn't in your library, so a new exercise was created for it.`);
    return created.id;
  };

  // A workout whose id already exists (e.g. exported with a plan for Claude to
  // edit) updates that workout; anything else is new.
  const existingWorkoutById = new Map(ctx.workouts.map((w) => [w.id, w]));
  const resolvedWorkouts: Workout[] = file.workouts.map((fw) => ({
    id: existingWorkoutById.has(fw.id) ? fw.id : newId('wo-'),
    name: fw.name,
    focus: fw.focus,
    description: fw.description,
    builtIn: false,
    test: fw.test,
    items: fw.items.map(({ exercise, ...rest }): WorkoutItem => ({
      ...rest,
      exerciseId: resolveExercise(exercise, rest, `Workout "${fw.name}"`),
    })),
  }));

  const newWorkouts = resolvedWorkouts.filter((w) => !existingWorkoutById.has(w.id));
  const updatedWorkouts = resolvedWorkouts.filter((w) => existingWorkoutById.has(w.id));

  const fileWorkoutIds = new Map<string, string>();
  file.workouts.forEach((fw, i) => {
    fileWorkoutIds.set(fw.id, resolvedWorkouts[i].id);
    if (!fileWorkoutIds.has(fw.name)) fileWorkoutIds.set(fw.name, resolvedWorkouts[i].id);
  });
  const workoutsByNorm = new Map<string, string>();
  for (const w of ctx.workouts) workoutsByNorm.set(norm(w.name), w.id);
  for (const w of resolvedWorkouts) workoutsByNorm.set(norm(w.name), w.id);
  const existingWorkoutIds = new Set(ctx.workouts.map((w) => w.id));

  const resolveWorkout = (ref: string): string | undefined =>
    fileWorkoutIds.get(ref) ??
    (existingWorkoutIds.has(ref) ? ref : undefined) ??
    workoutsByNorm.get(norm(ref));

  const blocks: PreviewBlock[] = file.blocks.map((fb, bi) => {
    const label = `Block ${bi + 1} "${fb.name}"`;
    const overrides = new Map(fb.weekOverrides.map((o) => [o.week, o.schedule]));
    const sessions: PreviewSession[] = [];
    for (let week = 1; week <= fb.weeks; week++) {
      const days = overrides.get(week) ?? fb.schedule;
      const positionByDay = new Map<Weekday, number>();
      for (const d of days) {
        for (const ref of d.workouts) {
          const workoutId = resolveWorkout(ref);
          if (!workoutId) {
            const msg = `${label}: unknown workout "${ref}". Define it in "workouts" or use a library workout id.`;
            if (!errors.includes(msg)) errors.push(msg);
            continue;
          }
          const position = positionByDay.get(d.day) ?? 0;
          positionByDay.set(d.day, position + 1);
          sessions.push({ week, day: d.day, position, workoutId, notes: d.notes });
        }
      }
    }
    if (sessions.length === 0 && errors.length === 0) {
      warnings.push(`${label} has no scheduled sessions.`);
    }
    return { name: fb.name, focus: fb.focus, notes: fb.notes, weeks: fb.weeks, sessions };
  });

  if (errors.length) return { ok: false, errors };

  let plan: ImportPreview['plan'] = null;
  if (file.plan) {
    let startDate = file.plan.startDate ?? null;
    if (startDate && weekdayOf(startDate) !== 0) {
      const monday = mondayOf(startDate);
      warnings.push(`Plans start on a Monday, so the start date moved from ${startDate} to ${monday}.`);
      startDate = monday;
    }
    plan = { name: file.plan.name, description: file.plan.description, goal: file.plan.goal, startDate };
  }

  const updatePlan = (file.planId && ctx.plans?.find((p) => p.id === file.planId)) || null;
  if (file.planId && !updatePlan) {
    warnings.push('This file updates a plan that isn’t on this device, so it will be imported as a new plan.');
  }

  return { ok: true, preview: { plan, newExercises, newWorkouts, updatedWorkouts, blocks, warnings, updatePlan } };
}
