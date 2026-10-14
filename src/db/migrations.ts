import type { SQLiteDatabase } from 'expo-sqlite';

import { BUILT_IN_EXERCISES, BUILT_IN_WORKOUTS } from '@/data/library';
import { estimateSetSec } from '@/lib/timer';
import type { Exercise, Prescription, Workout, WorkoutItem } from '@/lib/types';

export const DB_NAME = 'open-climb.db';

// Append new migrations to the end; never edit one that has shipped. A migration
// is SQL, or a function for steps that need JavaScript (e.g. data backfills).
type Migration = string | ((db: SQLiteDatabase) => Promise<void>);

/** Exported for tests. */
export const MIGRATIONS: Migration[] = [
  `
  CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    equipment TEXT NOT NULL DEFAULT '',
    tracks TEXT NOT NULL DEFAULT '[]',
    bodyweight INTEGER NOT NULL DEFAULT 0,
    defaults TEXT NOT NULL DEFAULT '{}',
    built_in INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    focus TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    built_in INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE plans (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    start_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE plan_blocks (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    focus TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    weeks INTEGER NOT NULL
  );
  CREATE INDEX plan_blocks_plan ON plan_blocks(plan_id);

  CREATE TABLE plan_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    block_id TEXT NOT NULL REFERENCES plan_blocks(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    day INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX plan_sessions_block ON plan_sessions(block_id);

  CREATE TABLE session_logs (
    id TEXT PRIMARY KEY NOT NULL,
    workout_id TEXT REFERENCES workouts(id) ON DELETE SET NULL,
    workout_name TEXT NOT NULL,
    plan_session_id TEXT REFERENCES plan_sessions(id) ON DELETE SET NULL,
    scheduled_date TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    rpe INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    bodyweight_kg REAL
  );
  CREATE INDEX session_logs_completed ON session_logs(completed_at);

  CREATE TABLE set_logs (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES session_logs(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    item_index INTEGER NOT NULL,
    set_index INTEGER NOT NULL,
    weight_kg REAL,
    reps INTEGER,
    duration_sec REAL,
    grade TEXT,
    completed INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX set_logs_session ON set_logs(session_id);
  CREATE INDEX set_logs_exercise ON set_logs(exercise_id);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v2: training type per exercise, training time per session and per set.
  async (db) => {
    await db.execAsync(`
      ALTER TABLE exercises ADD COLUMN training_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE session_logs ADD COLUMN duration_sec REAL;
      ALTER TABLE set_logs ADD COLUMN est_sec REAL;
    `);
    await backfillTrainingTime(db);
  },
  // v3: max tests, and test workouts.
  `
  ALTER TABLE workouts ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE max_tests (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL,
    tested_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    hold_sec REAL,
    reps INTEGER,
    weight_kg REAL NOT NULL,
    max_kg REAL NOT NULL,
    bodyweight_kg REAL,
    session_id TEXT REFERENCES session_logs(id) ON DELETE SET NULL
  );
  CREATE INDEX max_tests_exercise ON max_tests(exercise_id, tested_at);
  `,
  // v4: where and what was climbed (open climbing).
  `
  ALTER TABLE set_logs ADD COLUMN location TEXT;
  ALTER TABLE set_logs ADD COLUMN discipline TEXT;
  `,
];

/**
 * Estimate time for sessions logged before v2: each set from the prescription it
 * was most likely done with, and the session from the timer's elapsed time or
 * the sum of its sets, whichever is longer (logging alone takes a few minutes).
 */
async function backfillTrainingTime(db: SQLiteDatabase): Promise<void> {
  const exercises = new Map(
    (await db.getAllAsync<{ id: string; defaults: string }>('SELECT id, defaults FROM exercises')).map((r) => [
      r.id,
      JSON.parse(r.defaults) as Prescription,
    ]),
  );
  const workouts = new Map(
    (await db.getAllAsync<{ id: string; items: string }>('SELECT id, items FROM workouts')).map((r) => [
      r.id,
      JSON.parse(r.items) as WorkoutItem[],
    ]),
  );
  const sessions = await db.getAllAsync<{ id: string; workout_id: string | null; started_at: string; completed_at: string }>(
    'SELECT id, workout_id, started_at, completed_at FROM session_logs',
  );
  for (const s of sessions) {
    const sets = await db.getAllAsync<{ id: string; exercise_id: string; item_index: number; completed: number }>(
      'SELECT id, exercise_id, item_index, completed FROM set_logs WHERE session_id = ?',
      [s.id],
    );
    const items = (s.workout_id && workouts.get(s.workout_id)) || [];
    let estimated = 0;
    for (const set of sets) {
      const fromWorkout = items[set.item_index];
      const item = fromWorkout?.exerciseId === set.exercise_id ? fromWorkout : exercises.get(set.exercise_id);
      const sec = item ? estimateSetSec(item) : 45;
      await db.runAsync('UPDATE set_logs SET est_sec = ? WHERE id = ?', [sec, set.id]);
      if (set.completed) estimated += sec;
    }
    const elapsed = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000;
    await db.runAsync('UPDATE session_logs SET duration_sec = ? WHERE id = ?', [Math.max(elapsed || 0, estimated), s.id]);
  }
}

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    const migration = MIGRATIONS[v];
    await db.withTransactionAsync(async () => {
      if (typeof migration === 'string') await db.execAsync(migration);
      else await migration(db);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  await seedLibrary(db);
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Write a library exercise. With overwriteEdits false (seeding) an exercise the
 * user edited is left alone; with true (reset) it is restored to the original.
 */
export async function writeLibraryExercise(db: SQLiteDatabase, e: Exercise, overwriteEdits: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO exercises (id, name, category, training_type, description, instructions, equipment, tracks, bodyweight, defaults, built_in, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category,
       training_type = excluded.training_type, description = excluded.description,
       instructions = excluded.instructions, equipment = excluded.equipment, tracks = excluded.tracks,
       bodyweight = excluded.bodyweight, defaults = excluded.defaults, built_in = 1, updated_at = excluded.updated_at
     ${overwriteEdits ? '' : 'WHERE built_in = 1'}`,
    [e.id, e.name, e.category, e.type, e.description, e.instructions, e.equipment, JSON.stringify(e.tracks), e.bodyweight ? 1 : 0, JSON.stringify(e.defaults), new Date().toISOString()],
  );
}

export async function writeLibraryWorkout(db: SQLiteDatabase, w: Workout, overwriteEdits: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO workouts (id, name, focus, description, items, is_test, built_in, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, focus = excluded.focus,
       description = excluded.description, items = excluded.items, is_test = excluded.is_test,
       built_in = 1, updated_at = excluded.updated_at
     ${overwriteEdits ? '' : 'WHERE built_in = 1'}`,
    [w.id, w.name, w.focus, w.description, JSON.stringify(w.items), w.test ? 1 : 0, new Date().toISOString()],
  );
}

/** Upsert built-in exercises/workouts whenever the bundled library changes. */
async function seedLibrary(db: SQLiteDatabase): Promise<void> {
  const version = hash(JSON.stringify([BUILT_IN_EXERCISES, BUILT_IN_WORKOUTS]));
  const current = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'libraryVersion'",
  );
  if (current?.value === version) return;

  await db.withTransactionAsync(async () => {
    for (const e of BUILT_IN_EXERCISES) await writeLibraryExercise(db, e, false);
    for (const w of BUILT_IN_WORKOUTS) await writeLibraryWorkout(db, w, false);
    await db.runAsync(
      "INSERT INTO settings (key, value) VALUES ('libraryVersion', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [version],
    );
  });
}
