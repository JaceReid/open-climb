// Aggregations for the Progress overview: training mix by type and activity per
// day/week/month. Pure, so the numbers are unit-tested.
import { addDays, mondayOf, parseDate, toDateString } from './dates';
import { TRAINING_TYPES, type TrainingType } from './types';

export type Period = '7d' | '30d' | '90d' | 'all';
export const PERIODS: Period[] = ['7d', '30d', '90d', 'all'];
export const PERIOD_LABELS: Record<Period, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days', all: 'All time' };

export interface SessionPoint {
  id: string;
  /** Local YYYY-MM-DD the session was completed. */
  date: string;
  durationSec: number;
}

/** A completed set with the training type of its exercise. */
export interface TypedSet {
  sessionId: string;
  type: TrainingType;
  estSec: number;
}

/** First day inside the period (inclusive), or null for all time. */
export function periodStart(period: Period, today: string): string | null {
  switch (period) {
    case '7d':
      return addDays(today, -6);
    case '30d':
      return addDays(today, -29);
    case '90d':
      return addDays(today, -89);
    case 'all':
      return null;
  }
}

export function inPeriod<T extends { date: string }>(items: T[], period: Period, today: string): T[] {
  const start = periodStart(period, today);
  return items.filter((i) => (!start || i.date >= start) && i.date <= today);
}

export interface TypeTime {
  type: TrainingType;
  sec: number;
}

/**
 * Training time per type. Within a session, sets are weighted by their estimated
 * time and scaled so they add up to the session's recorded duration, so real
 * timer time (or the user's correction) is what gets split.
 */
export function timeByType(sessions: SessionPoint[], sets: TypedSet[]): TypeTime[] {
  const duration = new Map(sessions.map((s) => [s.id, s.durationSec]));
  const estTotal = new Map<string, number>();
  for (const s of sets) {
    if (!duration.has(s.sessionId)) continue;
    estTotal.set(s.sessionId, (estTotal.get(s.sessionId) ?? 0) + s.estSec);
  }
  const byType = new Map<TrainingType, number>();
  for (const s of sets) {
    const total = estTotal.get(s.sessionId);
    if (!total) continue;
    const share = (duration.get(s.sessionId)! * s.estSec) / total;
    byType.set(s.type, (byType.get(s.type) ?? 0) + share);
  }
  return TRAINING_TYPES.filter((t) => (byType.get(t) ?? 0) > 0).map((type) => ({ type, sec: byType.get(type)! }));
}

export interface Slice {
  /** A training type, or 'other' for the folded remainder. */
  key: TrainingType;
  /** Types inside this slice (several for a folded "Other"). */
  types: TrainingType[];
  sec: number;
  fraction: number;
}

/**
 * At most `max` slices for a pie: the biggest types keep their own slice and the
 * rest (plus the 'other' type) fold into "Other". Slices stay in TRAINING_TYPES
 * order so each type keeps its colour and position.
 */
export function foldSlices(byType: TypeTime[], max = 6): Slice[] {
  const total = byType.reduce((n, t) => n + t.sec, 0);
  if (total <= 0) return [];
  const named = byType.filter((t) => t.type !== 'other');
  const hasOther = named.length < byType.length;
  const fits = named.length + (hasOther ? 1 : 0) <= max;
  const kept = fits ? named : [...named].sort((a, b) => b.sec - a.sec).slice(0, max - 1);
  const keep = new Set(kept.map((t) => t.type));
  const slices: Slice[] = byType
    .filter((t) => keep.has(t.type))
    .map((t) => ({ key: t.type, types: [t.type], sec: t.sec, fraction: t.sec / total }));
  const rest = byType.filter((t) => !keep.has(t.type));
  if (rest.length) {
    const sec = rest.reduce((n, t) => n + t.sec, 0);
    slices.push({ key: 'other', types: rest.map((t) => t.type), sec, fraction: sec / total });
  }
  return slices;
}

export type Metric = 'sessions' | 'time';

export interface Bucket {
  /** First day of the bucket (YYYY-MM-DD). */
  start: string;
  label: string;
  value: number;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Bucket size per period: days for 7d/30d, weeks for 90d, months for all time. */
export function bucketUnit(period: Period): 'day' | 'week' | 'month' {
  return period === '90d' ? 'week' : period === 'all' ? 'month' : 'day';
}

/**
 * Activity per bucket: number of sessions, or training seconds. All-time shows
 * at most the last 24 months.
 */
export function activityBuckets(sessions: SessionPoint[], period: Period, today: string, metric: Metric): Bucket[] {
  const unit = bucketUnit(period);
  const keyOf = (date: string) =>
    unit === 'day' ? date : unit === 'week' ? mondayOf(date) : `${date.slice(0, 7)}-01`;

  const starts: string[] = [];
  if (unit === 'day') {
    for (let d = periodStart(period, today)!; d <= today; d = addDays(d, 1)) starts.push(d);
  } else if (unit === 'week') {
    for (let d = mondayOf(periodStart(period, today)!); d <= today; d = addDays(d, 7)) starts.push(d);
  } else {
    const first = sessions.reduce((min, s) => (s.date < min ? s.date : min), today);
    const cursor = parseDate(keyOf(first));
    const end = keyOf(today);
    while (toDateString(cursor) <= end) {
      starts.push(toDateString(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    starts.splice(0, Math.max(0, starts.length - 24));
  }

  const values = new Map(starts.map((s) => [s, 0]));
  for (const s of sessions) {
    const key = keyOf(s.date);
    if (!values.has(key) || s.date > today) continue;
    values.set(key, values.get(key)! + (metric === 'sessions' ? 1 : s.durationSec));
  }

  return starts.map((start) => {
    const d = parseDate(start);
    const label =
      unit === 'month'
        ? MONTHS[d.getMonth()]
        : unit === 'week'
          ? `${d.getDate()} ${MONTHS[d.getMonth()]}`
          : period === '7d'
            ? WEEKDAYS[d.getDay()]
            : String(d.getDate());
    return { start, label, value: values.get(start)! };
  });
}

export interface ExerciseSummary {
  exerciseId: string;
  name: string;
  type: TrainingType;
  sec: number;
  sessions: number;
  lastDate: string;
}

/** Time and session count per exercise, using the same split as timeByType. */
export function exerciseSummaries(
  sessions: SessionPoint[],
  sets: (TypedSet & { exerciseId: string; exerciseName: string })[],
): ExerciseSummary[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const estTotal = new Map<string, number>();
  for (const s of sets) if (byId.has(s.sessionId)) estTotal.set(s.sessionId, (estTotal.get(s.sessionId) ?? 0) + s.estSec);

  const out = new Map<string, ExerciseSummary & { sessionIds: Set<string> }>();
  for (const s of sets) {
    const session = byId.get(s.sessionId);
    const total = estTotal.get(s.sessionId);
    if (!session || !total) continue;
    const row = out.get(s.exerciseId) ?? {
      exerciseId: s.exerciseId,
      name: s.exerciseName,
      type: s.type,
      sec: 0,
      sessions: 0,
      lastDate: session.date,
      sessionIds: new Set<string>(),
    };
    row.sec += (session.durationSec * s.estSec) / total;
    row.sessionIds.add(s.sessionId);
    row.sessions = row.sessionIds.size;
    if (session.date > row.lastDate) row.lastDate = session.date;
    out.set(s.exerciseId, row);
  }
  return [...out.values()]
    .map(({ sessionIds: _ids, ...row }) => row)
    .sort((a, b) => b.sec - a.sec);
}

export interface WorkoutSummary {
  workoutId: string | null;
  name: string;
  sec: number;
  sessions: number;
  lastDate: string;
}

/** Sessions grouped by workout (single-exercise sessions group by their name). */
export function workoutSummaries(sessions: (SessionPoint & { workoutId: string | null; workoutName: string })[]): WorkoutSummary[] {
  const out = new Map<string, WorkoutSummary>();
  for (const s of sessions) {
    const key = s.workoutId ?? `name:${s.workoutName}`;
    const row = out.get(key) ?? { workoutId: s.workoutId, name: s.workoutName, sec: 0, sessions: 0, lastDate: s.date };
    row.sec += s.durationSec;
    row.sessions += 1;
    if (s.date > row.lastDate) row.lastDate = s.date;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => b.sessions - a.sessions || b.sec - a.sec);
}
