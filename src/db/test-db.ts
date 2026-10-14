/// <reference types="node" />
// Test-only: Node's built-in SQLite behind the few expo-sqlite methods the app
// uses, so migrations and repository code can run under vitest. Never import
// this from app code.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

export function openDb() {
  const raw = new DatabaseSync(':memory:');
  const args = (params: unknown[]) => (Array.isArray(params[0]) ? params[0] : params) as SQLInputValue[];
  const db = {
    execAsync: async (sql: string) => void raw.exec(sql),
    runAsync: async (sql: string, ...params: unknown[]) => raw.prepare(sql).run(...args(params)),
    getAllAsync: async (sql: string, ...params: unknown[]) => raw.prepare(sql).all(...args(params)),
    getFirstAsync: async (sql: string, ...params: unknown[]) => raw.prepare(sql).get(...args(params)) ?? null,
    withTransactionAsync: async (task: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { raw, db: db as unknown as SQLiteDatabase };
}
