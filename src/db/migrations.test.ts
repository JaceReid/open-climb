/// <reference types="node" />
// Runs the real migrations against Node's built-in SQLite (see test-db.ts).
import { describe, expect, it } from 'vitest';

import { BUILT_IN_EXERCISES, BUILT_IN_WORKOUTS } from '@/data/library';
import { estimateSetSec } from '@/lib/timer';

import { MIGRATIONS, migrate } from './migrations';
import { openDb } from './test-db';

describe('migrations', () => {
  it('creates and seeds a fresh database', async () => {
    const { raw, db } = openDb();
    await migrate(db);
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    expect(raw.prepare("SELECT training_type, built_in FROM exercises WHERE id = 'arc'").get()).toEqual({
      training_type: 'endurance',
      built_in: 1,
    });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM workouts').get()).toEqual({ n: BUILT_IN_WORKOUTS.length });
  });

  it('upgrades a v1 database and backfills training time', async () => {
    const { raw, db } = openDb();
    // A v1 install with an older library and one logged session.
    raw.exec(MIGRATIONS[0] as string);
    raw.exec('PRAGMA user_version = 1');
    const maxHangs = BUILT_IN_EXERCISES.find((e) => e.id === 'max-hangs')!;
    raw
      .prepare(
        `INSERT INTO exercises (id, name, category, tracks, defaults, built_in, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'x')`,
      )
      .run(maxHangs.id, maxHangs.name, maxHangs.category, '[]', JSON.stringify(maxHangs.defaults));
    const workout = BUILT_IN_WORKOUTS.find((w) => w.id === 'wo-max-hangs')!;
    raw
      .prepare(`INSERT INTO workouts (id, name, items, built_in, updated_at) VALUES (?, ?, ?, 1, 'x')`)
      .run(workout.id, workout.name, JSON.stringify(workout.items));
    // Logged without the timer: started and completed two minutes apart.
    raw
      .prepare(
        `INSERT INTO session_logs (id, workout_id, workout_name, started_at, completed_at) VALUES ('s1', ?, ?, '2026-10-12T10:00:00', '2026-10-12T10:02:00')`,
      )
      .run(workout.id, workout.name);
    const insertSet = raw.prepare(
      `INSERT INTO set_logs (id, session_id, exercise_id, exercise_name, item_index, set_index, completed) VALUES (?, 's1', 'max-hangs', 'Max Hangs', 1, ?, ?)`,
    );
    insertSet.run('a', 0, 1);
    insertSet.run('b', 1, 1);
    insertSet.run('c', 2, 0);

    await migrate(db);

    const perSet = estimateSetSec(workout.items[1]);
    expect(raw.prepare("SELECT est_sec FROM set_logs WHERE id = 'a'").get()).toEqual({ est_sec: perSet });
    // Two completed sets estimate more than the two minutes spent logging.
    expect(raw.prepare("SELECT duration_sec FROM session_logs WHERE id = 's1'").get()).toEqual({ duration_sec: perSet * 2 });
    // Re-seeding filled in the training type of untouched library rows.
    expect(raw.prepare("SELECT training_type FROM exercises WHERE id = 'max-hangs'").get()).toEqual({
      training_type: 'finger-strength',
    });
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    // v3: test workouts are flagged when the library is seeded.
    expect(raw.prepare("SELECT is_test FROM workouts WHERE id = 'wo-test-max-hang'").get()).toEqual({ is_test: 1 });
  });
});
