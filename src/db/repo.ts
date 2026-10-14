// All database reads and writes. Writes call notifyChange() so screens refresh.
import type { SQLiteDatabase } from 'expo-sqlite';

import { libraryExercise, libraryWorkout, matchesLibraryExercise, matchesLibraryWorkout } from '@/data/library';
import type { SessionPoint, TypedSet } from '@/lib/analytics';
import { newId } from '@/lib/id';
import type { ImportPreview } from '@/lib/import/resolve';
import { sessionsInRange } from '@/lib/schedule';
import type { LoggedSet } from '@/lib/metrics';
import {
  DEFAULT_SETTINGS,
  TRAINING_TYPES,
  defaultTrainingType,
  type Exercise,
  type MaxTest,
  type Plan,
  type PlanBlock,
  type PlanSession,
  type SessionLog,
  type SetLog,
  type Settings,
  type TrainingType,
  type Weekday,
  type Workout,
} from '@/lib/types';

import { writeLibraryExercise, writeLibraryWorkout } from './migrations';
import { notifyChange } from './store';

const nowIso = () => new Date().toISOString();

/** Local wall-clock timestamp, so dates group by the user's day. */
export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// --- Row mapping -------------------------------------------------------------

interface ExerciseRow {
  id: string;
  name: string;
  category: Exercise['category'];
  training_type: string;
  description: string;
  instructions: string;
  equipment: string;
  tracks: string;
  bodyweight: number;
  defaults: string;
  built_in: number;
}

/** Stored type, else the library's (for edited built-ins saved before v2), else a guess from category. */
function resolveTrainingType(id: string, category: Exercise['category'] | null, stored: string | null): TrainingType {
  if (stored && (TRAINING_TYPES as readonly string[]).includes(stored)) return stored as TrainingType;
  return libraryExercise(id)?.type ?? (category ? defaultTrainingType(category) : 'other');
}

const toExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  category: r.category,
  type: resolveTrainingType(r.id, r.category, r.training_type),
  description: r.description,
  instructions: r.instructions,
  equipment: r.equipment,
  tracks: JSON.parse(r.tracks),
  bodyweight: !!r.bodyweight,
  defaults: JSON.parse(r.defaults),
  builtIn: !!r.built_in,
});

interface WorkoutRow {
  id: string;
  name: string;
  focus: string;
  description: string;
  items: string;
  built_in: number;
  is_test: number;
}

const toWorkout = (r: WorkoutRow): Workout => ({
  id: r.id,
  name: r.name,
  focus: r.focus,
  description: r.description,
  items: JSON.parse(r.items),
  builtIn: !!r.built_in,
  test: !!r.is_test,
});

interface PlanRow {
  id: string;
  name: string;
  description: string;
  goal: string;
  start_date: string | null;
  is_active: number;
}

const toPlan = (r: PlanRow): Plan => ({
  id: r.id,
  name: r.name,
  description: r.description,
  goal: r.goal,
  startDate: r.start_date,
  isActive: !!r.is_active,
});

interface BlockRow {
  id: string;
  plan_id: string;
  position: number;
  name: string;
  focus: string;
  notes: string;
  weeks: number;
}

const toBlock = (r: BlockRow): PlanBlock => ({
  id: r.id,
  planId: r.plan_id,
  position: r.position,
  name: r.name,
  focus: r.focus,
  notes: r.notes,
  weeks: r.weeks,
});

interface SessionRow {
  id: string;
  block_id: string;
  week: number;
  day: number;
  position: number;
  workout_id: string;
  notes: string;
}

const toSession = (r: SessionRow): PlanSession => ({
  id: r.id,
  blockId: r.block_id,
  week: r.week,
  day: r.day as Weekday,
  position: r.position,
  workoutId: r.workout_id,
  notes: r.notes,
});

interface SessionLogRow {
  id: string;
  workout_id: string | null;
  workout_name: string;
  plan_session_id: string | null;
  scheduled_date: string | null;
  started_at: string;
  completed_at: string;
  rpe: number | null;
  notes: string;
  bodyweight_kg: number | null;
  duration_sec: number | null;
}

const toSessionLog = (r: SessionLogRow): SessionLog => ({
  id: r.id,
  workoutId: r.workout_id,
  workoutName: r.workout_name,
  planSessionId: r.plan_session_id,
  scheduledDate: r.scheduled_date,
  startedAt: r.started_at,
  completedAt: r.completed_at,
  rpe: r.rpe,
  notes: r.notes,
  bodyweightKg: r.bodyweight_kg,
  durationSec: r.duration_sec,
});

interface SetLogRow {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  item_index: number;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  duration_sec: number | null;
  grade: string | null;
  completed: number;
  notes: string;
  est_sec: number | null;
  location: SetLog['location'];
  discipline: SetLog['discipline'];
}

const toSetLog = (r: SetLogRow): SetLog => ({
  id: r.id,
  sessionId: r.session_id,
  exerciseId: r.exercise_id,
  exerciseName: r.exercise_name,
  itemIndex: r.item_index,
  setIndex: r.set_index,
  weightKg: r.weight_kg,
  reps: r.reps,
  durationSec: r.duration_sec,
  grade: r.grade,
  completed: !!r.completed,
  notes: r.notes,
  estSec: r.est_sec,
  location: r.location,
  discipline: r.discipline,
});

// --- Exercises ---------------------------------------------------------------

export async function listExercises(db: SQLiteDatabase): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>('SELECT * FROM exercises ORDER BY name COLLATE NOCASE');
  return rows.map(toExercise);
}

export async function getExercise(db: SQLiteDatabase, id: string): Promise<Exercise | null> {
  const row = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [id]);
  return row ? toExercise(row) : null;
}

/** Saves any exercise, library ones included (they become "edited" unless unchanged). */
async function upsertExercise(db: SQLiteDatabase, e: Exercise): Promise<void> {
  await db.runAsync(
    `INSERT INTO exercises (id, name, category, training_type, description, instructions, equipment, tracks, bodyweight, defaults, built_in, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category,
       training_type = excluded.training_type, description = excluded.description,
       instructions = excluded.instructions, equipment = excluded.equipment, tracks = excluded.tracks,
       bodyweight = excluded.bodyweight, defaults = excluded.defaults, built_in = excluded.built_in,
       updated_at = excluded.updated_at`,
    [e.id, e.name, e.category, e.type, e.description, e.instructions, e.equipment, JSON.stringify(e.tracks), e.bodyweight ? 1 : 0, JSON.stringify(e.defaults), matchesLibraryExercise(e) ? 1 : 0, nowIso()],
  );
}

export async function saveExercise(db: SQLiteDatabase, e: Exercise): Promise<void> {
  await upsertExercise(db, e);
  notifyChange();
}

/** Workouts whose items use this exercise. */
export async function workoutsUsingExercise(db: SQLiteDatabase, exerciseId: string): Promise<Workout[]> {
  const rows = await db.getAllAsync<WorkoutRow>('SELECT * FROM workouts WHERE items LIKE ?', [
    `%"exerciseId":${JSON.stringify(exerciseId)}%`,
  ]);
  return rows.map(toWorkout).filter((w) => w.items.some((i) => i.exerciseId === exerciseId));
}

export async function deleteExercise(db: SQLiteDatabase, id: string): Promise<void> {
  // Library ids are referenced by Claude-written plans, so they're reset, never deleted.
  if (libraryExercise(id)) throw new Error('Library exercises can’t be deleted. Reset it instead.');
  await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
  notifyChange();
}

/** Restore an edited library exercise to the bundled version. */
export async function resetExercise(db: SQLiteDatabase, id: string): Promise<void> {
  const lib = libraryExercise(id);
  if (!lib) return;
  await writeLibraryExercise(db, lib, true);
  notifyChange();
}

// --- Workouts ----------------------------------------------------------------

export async function listWorkouts(db: SQLiteDatabase): Promise<Workout[]> {
  const rows = await db.getAllAsync<WorkoutRow>('SELECT * FROM workouts ORDER BY built_in, name COLLATE NOCASE');
  return rows.map(toWorkout);
}

export async function getWorkout(db: SQLiteDatabase, id: string): Promise<Workout | null> {
  const row = await db.getFirstAsync<WorkoutRow>('SELECT * FROM workouts WHERE id = ?', [id]);
  return row ? toWorkout(row) : null;
}

/** Saves any workout, library ones included (they become "edited" unless unchanged). */
async function upsertWorkout(db: SQLiteDatabase, w: Workout): Promise<void> {
  await db.runAsync(
    `INSERT INTO workouts (id, name, focus, description, items, is_test, built_in, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, focus = excluded.focus,
       description = excluded.description, items = excluded.items, is_test = excluded.is_test,
       built_in = excluded.built_in, updated_at = excluded.updated_at`,
    [w.id, w.name, w.focus, w.description, JSON.stringify(w.items), w.test ? 1 : 0, matchesLibraryWorkout(w) ? 1 : 0, nowIso()],
  );
}

export async function saveWorkout(db: SQLiteDatabase, w: Workout): Promise<void> {
  await upsertWorkout(db, w);
  notifyChange();
}

export async function countPlanSessionsForWorkout(db: SQLiteDatabase, workoutId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM plan_sessions WHERE workout_id = ?', [workoutId]);
  return row?.n ?? 0;
}

export async function deleteWorkout(db: SQLiteDatabase, id: string): Promise<void> {
  if (libraryWorkout(id)) throw new Error('Library workouts can’t be deleted. Reset it instead.');
  await db.runAsync('DELETE FROM workouts WHERE id = ?', [id]);
  notifyChange();
}

/** Restore an edited library workout to the bundled version. */
export async function resetWorkout(db: SQLiteDatabase, id: string): Promise<void> {
  const lib = libraryWorkout(id);
  if (!lib) return;
  await writeLibraryWorkout(db, lib, true);
  notifyChange();
}

// --- Plans -------------------------------------------------------------------

export async function listPlans(db: SQLiteDatabase): Promise<(Plan & { weeks: number; sessions: number })[]> {
  const rows = await db.getAllAsync<PlanRow & { weeks: number | null; sessions: number }>(
    `SELECT p.*,
       (SELECT SUM(weeks) FROM plan_blocks b WHERE b.plan_id = p.id) AS weeks,
       (SELECT COUNT(*) FROM plan_sessions s JOIN plan_blocks b ON b.id = s.block_id WHERE b.plan_id = p.id) AS sessions
     FROM plans p ORDER BY p.is_active DESC, p.created_at DESC`,
  );
  return rows.map((r) => ({ ...toPlan(r), weeks: r.weeks ?? 0, sessions: r.sessions }));
}

export async function getPlan(db: SQLiteDatabase, id: string): Promise<Plan | null> {
  const row = await db.getFirstAsync<PlanRow>('SELECT * FROM plans WHERE id = ?', [id]);
  return row ? toPlan(row) : null;
}

export async function createPlan(db: SQLiteDatabase, name: string): Promise<string> {
  const id = newId('pl-');
  await db.runAsync('INSERT INTO plans (id, name, created_at) VALUES (?, ?, ?)', [id, name, nowIso()]);
  notifyChange();
  return id;
}

export async function updatePlan(db: SQLiteDatabase, p: Pick<Plan, 'id' | 'name' | 'description' | 'goal'>): Promise<void> {
  await db.runAsync('UPDATE plans SET name = ?, description = ?, goal = ? WHERE id = ?', [p.name, p.description, p.goal, p.id]);
  notifyChange();
}

export async function deletePlan(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM plans WHERE id = ?', [id]);
  notifyChange();
}

/** Make this the only active plan, starting on the given Monday. */
export async function activatePlan(db: SQLiteDatabase, id: string, startDate: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE plans SET is_active = 0 WHERE id != ?', [id]);
    await db.runAsync('UPDATE plans SET is_active = 1, start_date = ? WHERE id = ?', [startDate, id]);
  });
  notifyChange();
}

export async function deactivatePlan(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE plans SET is_active = 0 WHERE id = ?', [id]);
  notifyChange();
}

export interface PlanBundle {
  plan: Plan;
  blocks: PlanBlock[];
  sessions: PlanSession[];
}

export async function getPlanBundle(db: SQLiteDatabase, planId: string): Promise<PlanBundle | null> {
  const plan = await getPlan(db, planId);
  if (!plan) return null;
  const blocks = (
    await db.getAllAsync<BlockRow>('SELECT * FROM plan_blocks WHERE plan_id = ? ORDER BY position', [planId])
  ).map(toBlock);
  const sessions = (
    await db.getAllAsync<SessionRow>(
      `SELECT s.* FROM plan_sessions s JOIN plan_blocks b ON b.id = s.block_id
       WHERE b.plan_id = ? ORDER BY s.week, s.day, s.position`,
      [planId],
    )
  ).map(toSession);
  return { plan, blocks, sessions };
}

export async function getActivePlanBundle(db: SQLiteDatabase): Promise<PlanBundle | null> {
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM plans WHERE is_active = 1 AND start_date IS NOT NULL LIMIT 1');
  return row ? getPlanBundle(db, row.id) : null;
}

// --- Blocks & sessions -------------------------------------------------------

export async function getBlock(db: SQLiteDatabase, id: string): Promise<PlanBlock | null> {
  const row = await db.getFirstAsync<BlockRow>('SELECT * FROM plan_blocks WHERE id = ?', [id]);
  return row ? toBlock(row) : null;
}

export async function listBlockSessions(db: SQLiteDatabase, blockId: string): Promise<PlanSession[]> {
  const rows = await db.getAllAsync<SessionRow>(
    'SELECT * FROM plan_sessions WHERE block_id = ? ORDER BY week, day, position',
    [blockId],
  );
  return rows.map(toSession);
}

export async function addBlock(db: SQLiteDatabase, planId: string, name: string, weeks: number): Promise<string> {
  const id = newId('bl-');
  const row = await db.getFirstAsync<{ n: number | null }>('SELECT MAX(position) AS n FROM plan_blocks WHERE plan_id = ?', [planId]);
  await db.runAsync('INSERT INTO plan_blocks (id, plan_id, position, name, weeks) VALUES (?, ?, ?, ?, ?)', [
    id,
    planId,
    (row?.n ?? -1) + 1,
    name,
    weeks,
  ]);
  notifyChange();
  return id;
}

export async function updateBlock(db: SQLiteDatabase, b: Pick<PlanBlock, 'id' | 'name' | 'focus' | 'notes' | 'weeks'>): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE plan_blocks SET name = ?, focus = ?, notes = ?, weeks = ? WHERE id = ?', [b.name, b.focus, b.notes, b.weeks, b.id]);
    // Shrinking a block drops sessions in the removed weeks.
    await db.runAsync('DELETE FROM plan_sessions WHERE block_id = ? AND week > ?', [b.id, b.weeks]);
  });
  notifyChange();
}

export async function deleteBlock(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM plan_blocks WHERE id = ?', [id]);
  notifyChange();
}

/** Swap a block with its neighbour. */
export async function moveBlock(db: SQLiteDatabase, planId: string, blockId: string, dir: -1 | 1): Promise<void> {
  const blocks = (
    await db.getAllAsync<BlockRow>('SELECT * FROM plan_blocks WHERE plan_id = ? ORDER BY position', [planId])
  ).map(toBlock);
  const i = blocks.findIndex((b) => b.id === blockId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  await db.withTransactionAsync(async () => {
    for (let k = 0; k < blocks.length; k++) {
      await db.runAsync('UPDATE plan_blocks SET position = ? WHERE id = ?', [k, blocks[k].id]);
    }
  });
  notifyChange();
}

export async function addPlanSession(
  db: SQLiteDatabase,
  blockId: string,
  week: number,
  day: Weekday,
  workoutId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{ n: number | null }>(
    'SELECT MAX(position) AS n FROM plan_sessions WHERE block_id = ? AND week = ? AND day = ?',
    [blockId, week, day],
  );
  await db.runAsync(
    'INSERT INTO plan_sessions (id, block_id, week, day, position, workout_id) VALUES (?, ?, ?, ?, ?, ?)',
    [newId('ps-'), blockId, week, day, (row?.n ?? -1) + 1, workoutId],
  );
  notifyChange();
}

export async function deletePlanSession(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM plan_sessions WHERE id = ?', [id]);
  notifyChange();
}

/** Replace every other week of the block with a copy of `week`. */
export async function copyWeekToAll(db: SQLiteDatabase, blockId: string, week: number): Promise<void> {
  const block = await getBlock(db, blockId);
  if (!block) return;
  const source = (await listBlockSessions(db, blockId)).filter((s) => s.week === week);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM plan_sessions WHERE block_id = ? AND week != ?', [blockId, week]);
    for (let w = 1; w <= block.weeks; w++) {
      if (w === week) continue;
      for (const s of source) {
        await db.runAsync(
          'INSERT INTO plan_sessions (id, block_id, week, day, position, workout_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newId('ps-'), blockId, w, s.day, s.position, s.workoutId, s.notes],
        );
      }
    }
  });
  notifyChange();
}

// --- Import ------------------------------------------------------------------

/** Writes a resolved import. Returns the new plan id, if the file had a plan. */
/** Insert a preview's blocks and sessions into a plan. Returns what was stored. */
async function insertBlocks(
  db: SQLiteDatabase,
  planId: string,
  previewBlocks: ImportPreview['blocks'],
): Promise<{ blocks: PlanBlock[]; sessions: PlanSession[] }> {
  const blocks: PlanBlock[] = [];
  const sessions: PlanSession[] = [];
  for (let i = 0; i < previewBlocks.length; i++) {
    const b = previewBlocks[i];
    const block: PlanBlock = { id: newId('bl-'), planId, position: i, name: b.name, focus: b.focus, notes: b.notes, weeks: b.weeks };
    await db.runAsync(
      'INSERT INTO plan_blocks (id, plan_id, position, name, focus, notes, weeks) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [block.id, planId, i, b.name, b.focus, b.notes, b.weeks],
    );
    blocks.push(block);
    for (const s of b.sessions) {
      const session: PlanSession = { id: newId('ps-'), blockId: block.id, ...s };
      await db.runAsync(
        'INSERT INTO plan_sessions (id, block_id, week, day, position, workout_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [session.id, block.id, s.week, s.day, s.position, s.workoutId, s.notes],
      );
      sessions.push(session);
    }
  }
  return { blocks, sessions };
}

/** Writes a resolved import as a new plan. Returns the new plan id, if the file had a plan. */
export async function applyImport(db: SQLiteDatabase, preview: ImportPreview): Promise<string | null> {
  let planId: string | null = null;
  await db.withTransactionAsync(async () => {
    for (const e of preview.newExercises) await upsertExercise(db, e);
    for (const w of [...preview.newWorkouts, ...preview.updatedWorkouts]) await upsertWorkout(db, w);
    if (!preview.plan) return;
    planId = newId('pl-');
    await db.runAsync(
      'INSERT INTO plans (id, name, description, goal, start_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [planId, preview.plan.name, preview.plan.description, preview.plan.goal, preview.plan.startDate, nowIso()],
    );
    await insertBlocks(db, planId, preview.blocks);
  });
  notifyChange();
  return planId;
}

/**
 * Replace an existing plan's blocks with an updated version (e.g. from Claude),
 * keeping its id, start date and active state. Sessions already logged against
 * the plan stay ticked off when the new schedule has the same workout that day.
 */
export async function applyPlanUpdate(db: SQLiteDatabase, planId: string, preview: ImportPreview): Promise<void> {
  const plan = await getPlan(db, planId);
  if (!plan) throw new Error('Plan not found');
  const linked = await db.getAllAsync<{ id: string; scheduled_date: string | null; workout_id: string | null }>(
    `SELECT l.id, l.scheduled_date, l.workout_id FROM session_logs l
     JOIN plan_sessions s ON s.id = l.plan_session_id
     JOIN plan_blocks b ON b.id = s.block_id
     WHERE b.plan_id = ?`,
    [planId],
  );
  await db.withTransactionAsync(async () => {
    for (const e of preview.newExercises) await upsertExercise(db, e);
    for (const w of [...preview.newWorkouts, ...preview.updatedWorkouts]) await upsertWorkout(db, w);
    if (preview.plan) {
      await db.runAsync('UPDATE plans SET name = ?, description = ?, goal = ? WHERE id = ?', [
        preview.plan.name,
        preview.plan.description,
        preview.plan.goal,
        planId,
      ]);
    }
    // Deleting blocks cascades to their sessions and unlinks logs (SET NULL).
    await db.runAsync('DELETE FROM plan_blocks WHERE plan_id = ?', [planId]);
    const { blocks, sessions } = await insertBlocks(db, planId, preview.blocks);
    if (!plan.startDate) return;
    const dated = sessionsInRange(plan.startDate, blocks, sessions, '0000-01-01', '9999-12-31');
    for (const l of linked) {
      const match = dated.find((d) => d.date === l.scheduled_date && d.session.workoutId === l.workout_id);
      if (match) await db.runAsync('UPDATE session_logs SET plan_session_id = ? WHERE id = ?', [match.session.id, l.id]);
    }
  });
  notifyChange();
}

// --- Logs --------------------------------------------------------------------

export type NewSetLog = Omit<SetLog, 'id' | 'sessionId'>;

export async function saveSessionLog(
  db: SQLiteDatabase,
  log: Omit<SessionLog, 'id'>,
  sets: NewSetLog[],
): Promise<string> {
  const id = newId('log-');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO session_logs (id, workout_id, workout_name, plan_session_id, scheduled_date, started_at, completed_at, rpe, notes, bodyweight_kg, duration_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, log.workoutId, log.workoutName, log.planSessionId, log.scheduledDate, log.startedAt, log.completedAt, log.rpe, log.notes, log.bodyweightKg, log.durationSec],
    );
    for (const s of sets) {
      await db.runAsync(
        `INSERT INTO set_logs (id, session_id, exercise_id, exercise_name, item_index, set_index, weight_kg, reps, duration_sec, grade, completed, notes, est_sec, location, discipline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId('set-'), id, s.exerciseId, s.exerciseName, s.itemIndex, s.setIndex, s.weightKg, s.reps, s.durationSec, s.grade, s.completed ? 1 : 0, s.notes, s.estSec, s.location, s.discipline],
      );
    }
  });
  notifyChange();
  return id;
}

export async function listSessionLogs(db: SQLiteDatabase, limit = 100): Promise<(SessionLog & { setCount: number })[]> {
  const rows = await db.getAllAsync<SessionLogRow & { set_count: number }>(
    `SELECT l.*, (SELECT COUNT(*) FROM set_logs s WHERE s.session_id = l.id AND s.completed = 1) AS set_count
     FROM session_logs l ORDER BY completed_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ ...toSessionLog(r), setCount: r.set_count }));
}

export async function getSessionLog(db: SQLiteDatabase, id: string): Promise<{ log: SessionLog; sets: SetLog[] } | null> {
  const row = await db.getFirstAsync<SessionLogRow>('SELECT * FROM session_logs WHERE id = ?', [id]);
  if (!row) return null;
  const sets = await db.getAllAsync<SetLogRow>('SELECT * FROM set_logs WHERE session_id = ? ORDER BY item_index, set_index', [id]);
  return { log: toSessionLog(row), sets: sets.map(toSetLog) };
}

export async function deleteSessionLog(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM session_logs WHERE id = ?', [id]);
  notifyChange();
}

/** Plan-session ids already logged for each scheduled date in a range. */
export async function completedPlanSessions(db: SQLiteDatabase, from: string, to: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ plan_session_id: string; scheduled_date: string }>(
    `SELECT plan_session_id, scheduled_date FROM session_logs
     WHERE plan_session_id IS NOT NULL AND scheduled_date BETWEEN ? AND ?`,
    [from, to],
  );
  return new Set(rows.map((r) => `${r.plan_session_id}@${r.scheduled_date}`));
}

/**
 * Sessions that were max tests. Their attempts (short maximal holds/singles) are
 * kept out of working-weight trends; the max itself lives in max_tests.
 */
const TEST_SESSIONS = 'SELECT session_id FROM max_tests WHERE session_id IS NOT NULL';

export async function loggedSetsForExercise(db: SQLiteDatabase, exerciseId: string): Promise<LoggedSet[]> {
  const rows = await db.getAllAsync<{
    session_id: string;
    weight_kg: number | null;
    reps: number | null;
    duration_sec: number | null;
    grade: string | null;
    completed: number;
    completed_at: string;
    bodyweight_kg: number | null;
  }>(
    `SELECT s.session_id, s.weight_kg, s.reps, s.duration_sec, s.grade, s.completed, l.completed_at, l.bodyweight_kg
     FROM set_logs s JOIN session_logs l ON l.id = s.session_id
     WHERE s.exercise_id = ? AND l.id NOT IN (${TEST_SESSIONS})
     ORDER BY l.completed_at`,
    [exerciseId],
  );
  return rows.map((r) => ({
    sessionId: r.session_id,
    weightKg: r.weight_kg,
    reps: r.reps,
    durationSec: r.duration_sec,
    grade: r.grade,
    completed: !!r.completed,
    completedAt: r.completed_at,
    bodyweightKg: r.bodyweight_kg,
  }));
}

/** Exercises that have at least one completed, logged set, most used first. */
export async function loggedExercises(db: SQLiteDatabase): Promise<(Exercise & { sessions: number })[]> {
  const rows = await db.getAllAsync<ExerciseRow & { sessions: number }>(
    `SELECT e.*, COUNT(DISTINCT s.session_id) AS sessions
     FROM set_logs s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.completed = 1
     GROUP BY e.id ORDER BY sessions DESC, e.name`,
  );
  return rows.map((r) => ({ ...toExercise(r), sessions: r.sessions }));
}

// --- Settings ----------------------------------------------------------------

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key in DEFAULT_SETTINGS) (settings as unknown as Record<string, unknown>)[key] = JSON.parse(value);
  }
  return settings;
}

export async function setSetting<K extends keyof Settings>(db: SQLiteDatabase, key: K, value: Settings[K]): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
  notifyChange();
}

// --- Progress ----------------------------------------------------------------

export interface ProgressSession extends SessionPoint {
  workoutId: string | null;
  workoutName: string;
}

export interface ProgressSet extends TypedSet {
  exerciseId: string;
  exerciseName: string;
}

/** Every session with its training time, and every completed set with its type. */
export async function progressData(db: SQLiteDatabase): Promise<{ sessions: ProgressSession[]; sets: ProgressSet[] }> {
  const sessions = await db.getAllAsync<{
    id: string;
    completed_at: string;
    duration_sec: number | null;
    workout_id: string | null;
    workout_name: string;
  }>('SELECT id, completed_at, duration_sec, workout_id, workout_name FROM session_logs ORDER BY completed_at');
  const sets = await db.getAllAsync<{
    session_id: string;
    exercise_id: string;
    exercise_name: string;
    est_sec: number | null;
    category: Exercise['category'] | null;
    training_type: string | null;
  }>(
    `SELECT s.session_id, s.exercise_id, s.exercise_name, s.est_sec, e.category, e.training_type
     FROM set_logs s LEFT JOIN exercises e ON e.id = s.exercise_id
     WHERE s.completed = 1`,
  );
  return {
    sessions: sessions.map((r) => ({
      id: r.id,
      date: r.completed_at.slice(0, 10),
      durationSec: r.duration_sec ?? 0,
      workoutId: r.workout_id,
      workoutName: r.workout_name,
    })),
    sets: sets.map((r) => ({
      sessionId: r.session_id,
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name,
      estSec: r.est_sec ?? 45,
      type: resolveTrainingType(r.exercise_id, r.category, r.training_type),
    })),
  };
}

/** Most recent sessions of one workout. */
export async function sessionLogsForWorkout(db: SQLiteDatabase, workoutId: string): Promise<{ total: number; recent: SessionLog[] }> {
  const total = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM session_logs WHERE workout_id = ?', [workoutId]);
  const rows = await db.getAllAsync<SessionLogRow>(
    'SELECT * FROM session_logs WHERE workout_id = ? ORDER BY completed_at DESC LIMIT 5',
    [workoutId],
  );
  return { total: total?.n ?? 0, recent: rows.map(toSessionLog) };
}

/** Completed sets with a logged weight, for every exercise (Performance view). */
export async function weightedSets(db: SQLiteDatabase): Promise<(LoggedSet & { exerciseId: string })[]> {
  const rows = await db.getAllAsync<{
    exercise_id: string;
    session_id: string;
    weight_kg: number | null;
    reps: number | null;
    duration_sec: number | null;
    grade: string | null;
    completed_at: string;
    bodyweight_kg: number | null;
  }>(
    `SELECT s.exercise_id, s.session_id, s.weight_kg, s.reps, s.duration_sec, s.grade, l.completed_at, l.bodyweight_kg
     FROM set_logs s JOIN session_logs l ON l.id = s.session_id
     WHERE s.completed = 1 AND s.weight_kg IS NOT NULL AND l.id NOT IN (${TEST_SESSIONS})
     ORDER BY l.completed_at`,
  );
  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    sessionId: r.session_id,
    weightKg: r.weight_kg,
    reps: r.reps,
    durationSec: r.duration_sec,
    grade: r.grade,
    completed: true,
    completedAt: r.completed_at,
    bodyweightKg: r.bodyweight_kg,
  }));
}

// --- Max tests -----------------------------------------------------------------

interface MaxTestRow {
  id: string;
  exercise_id: string;
  tested_at: string;
  kind: MaxTest['kind'];
  hold_sec: number | null;
  reps: number | null;
  weight_kg: number;
  max_kg: number;
  bodyweight_kg: number | null;
  session_id: string | null;
}

const toMaxTest = (r: MaxTestRow): MaxTest => ({
  id: r.id,
  exerciseId: r.exercise_id,
  testedAt: r.tested_at,
  kind: r.kind,
  holdSec: r.hold_sec,
  reps: r.reps,
  weightKg: r.weight_kg,
  maxKg: r.max_kg,
  bodyweightKg: r.bodyweight_kg,
  sessionId: r.session_id,
});

/** The latest test per exercise: the current max used for working weights. */
export async function latestMaxes(db: SQLiteDatabase): Promise<Map<string, MaxTest>> {
  const rows = await db.getAllAsync<MaxTestRow>(
    `SELECT * FROM max_tests t
     WHERE tested_at = (SELECT MAX(tested_at) FROM max_tests WHERE exercise_id = t.exercise_id)`,
  );
  return new Map(rows.map((r) => [r.exercise_id, toMaxTest(r)]));
}

export async function maxTestsFor(db: SQLiteDatabase, exerciseId: string): Promise<MaxTest[]> {
  const rows = await db.getAllAsync<MaxTestRow>(
    'SELECT * FROM max_tests WHERE exercise_id = ? ORDER BY tested_at DESC',
    [exerciseId],
  );
  return rows.map(toMaxTest);
}

export async function deleteMaxTest(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM max_tests WHERE id = ?', [id]);
  notifyChange();
}

/** Save a test session: its attempts as a session log, plus one max per tested exercise. */
export async function saveTestSession(
  db: SQLiteDatabase,
  log: Omit<SessionLog, 'id'>,
  sets: NewSetLog[],
  tests: Omit<MaxTest, 'id' | 'sessionId' | 'testedAt'>[],
): Promise<string> {
  const sessionId = newId('log-');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO session_logs (id, workout_id, workout_name, plan_session_id, scheduled_date, started_at, completed_at, rpe, notes, bodyweight_kg, duration_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, log.workoutId, log.workoutName, log.planSessionId, log.scheduledDate, log.startedAt, log.completedAt, log.rpe, log.notes, log.bodyweightKg, log.durationSec],
    );
    for (const s of sets) {
      await db.runAsync(
        `INSERT INTO set_logs (id, session_id, exercise_id, exercise_name, item_index, set_index, weight_kg, reps, duration_sec, grade, completed, notes, est_sec, location, discipline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId('set-'), sessionId, s.exerciseId, s.exerciseName, s.itemIndex, s.setIndex, s.weightKg, s.reps, s.durationSec, s.grade, s.completed ? 1 : 0, s.notes, s.estSec, s.location, s.discipline],
      );
    }
    for (const t of tests) {
      await db.runAsync(
        `INSERT INTO max_tests (id, exercise_id, tested_at, kind, hold_sec, reps, weight_kg, max_kg, bodyweight_kg, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId('max-'), t.exerciseId, log.completedAt, t.kind, t.holdSec, t.reps, t.weightKg, t.maxKg, t.bodyweightKg, sessionId],
      );
    }
  });
  notifyChange();
  return sessionId;
}

/** Sessions completed on or after `from`, with their sets (for the Claude review). */
export async function sessionLogsWithSets(db: SQLiteDatabase, from: string): Promise<{ log: SessionLog; sets: SetLog[] }[]> {
  const logs = await db.getAllAsync<SessionLogRow>('SELECT * FROM session_logs WHERE completed_at >= ? ORDER BY completed_at', [from]);
  const sets = await db.getAllAsync<SetLogRow>(
    `SELECT s.* FROM set_logs s JOIN session_logs l ON l.id = s.session_id
     WHERE l.completed_at >= ? ORDER BY s.item_index, s.set_index`,
    [from],
  );
  const bySession = new Map<string, SetLog[]>();
  for (const r of sets) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), toSetLog(r)]);
  return logs.map((r) => ({ log: toSessionLog(r), sets: bySession.get(r.id) ?? [] }));
}
