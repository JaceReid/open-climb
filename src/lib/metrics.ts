// Per-session progress metrics for charts.
import { maxGrade } from './grades';
import type { Exercise, SetLog } from './types';

export interface LoggedSet extends Pick<SetLog, 'sessionId' | 'weightKg' | 'reps' | 'durationSec' | 'grade' | 'completed'> {
  completedAt: string;
  /** Bodyweight recorded with the session, if any. */
  bodyweightKg: number | null;
}

export interface SessionPoint {
  sessionId: string;
  date: string;
  /** Heaviest load lifted/hung in the session (added weight for bodyweight exercises). */
  topWeightKg: number | null;
  /** Estimated one-rep max (Epley), same basis as topWeightKg. */
  e1rmKg: number | null;
  /** (bodyweight + added) / bodyweight × 100 for bodyweight exercises. */
  pctBodyweight: number | null;
  maxGrade: string | null;
  totalReps: number;
  maxDurationSec: number | null;
}

/** Epley estimate. Above ~12 reps the estimate is meaningless, so return null. */
export function epley(weight: number, reps: number): number | null {
  if (reps < 1 || reps > 12) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Whether a 1RM estimate makes sense for this exercise (rep-based lifting). */
export function supportsE1rm(exercise: Pick<Exercise, 'category' | 'tracks'>): boolean {
  return (
    (exercise.category === 'strength' || exercise.category === 'antagonist') &&
    exercise.tracks.includes('weight') &&
    exercise.tracks.includes('reps')
  );
}

export function sessionSeries(
  sets: LoggedSet[],
  exercise: Pick<Exercise, 'category' | 'tracks' | 'bodyweight'>,
  fallbackBodyweightKg: number | null,
): SessionPoint[] {
  const bySession = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    if (!s.completed) continue;
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }

  const points: SessionPoint[] = [];
  for (const [sessionId, list] of bySession) {
    const bw = list[0].bodyweightKg ?? fallbackBodyweightKg;
    const weights = list.map((s) => s.weightKg).filter((w): w is number => w != null);
    const topWeightKg = weights.length ? Math.max(...weights) : null;

    let e1rmKg: number | null = null;
    if (supportsE1rm(exercise)) {
      for (const s of list) {
        if (s.weightKg == null || s.reps == null) continue;
        // For bodyweight lifts the estimate is on total load, then expressed as added weight again.
        const base = exercise.bodyweight && bw ? bw : 0;
        const est = epley(s.weightKg + base, s.reps);
        if (est != null) e1rmKg = Math.max(e1rmKg ?? -Infinity, est - base);
      }
    }

    const pctBodyweight =
      exercise.bodyweight && bw && topWeightKg != null ? ((bw + topWeightKg) / bw) * 100 : null;

    const durations = list.map((s) => s.durationSec).filter((d): d is number => d != null);

    points.push({
      sessionId,
      date: list[0].completedAt.slice(0, 10),
      topWeightKg,
      e1rmKg,
      pctBodyweight,
      maxGrade: maxGrade(list.map((s) => s.grade)),
      totalReps: list.reduce((n, s) => n + (s.reps ?? 0), 0),
      maxDurationSec: durations.length ? Math.max(...durations) : null,
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeightTrend {
  /** Points with a logged weight inside the window, oldest first. */
  points: SessionPoint[];
  latest: SessionPoint;
  /** Heaviest top weight inside the window. */
  bestKg: number;
  /** Latest minus first top weight inside the window; null with fewer than two sessions. */
  changeKg: number | null;
}

/** Top-weight trend since `from` (YYYY-MM-DD, inclusive), or all time when null. */
export function weightTrend(series: SessionPoint[], from: string | null): WeightTrend | null {
  const points = series.filter((p) => p.topWeightKg != null && (!from || p.date >= from));
  if (points.length === 0) return null;
  const weights = points.map((p) => p.topWeightKg!);
  return {
    points,
    latest: points[points.length - 1],
    bestKg: Math.max(...weights),
    changeKg: points.length >= 2 ? weights[weights.length - 1] - weights[0] : null,
  };
}
