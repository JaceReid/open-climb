// Maps plan blocks/weeks/weekdays onto calendar dates. A plan starts on a
// Monday and its blocks follow each other back to back.
import { addDays, daysBetween } from './dates';
import type { PlanBlock, PlanSession } from './types';

export interface BlockRange {
  block: PlanBlock;
  /** Weeks before this block starts. */
  weekOffset: number;
  startDate: string;
  /** Inclusive (a Sunday). */
  endDate: string;
}

const byPosition = (a: PlanBlock, b: PlanBlock) => a.position - b.position;

export function totalWeeks(blocks: PlanBlock[]): number {
  return blocks.reduce((n, b) => n + b.weeks, 0);
}

export function blockRanges(startDate: string, blocks: PlanBlock[]): BlockRange[] {
  let weekOffset = 0;
  return blocks
    .slice()
    .sort(byPosition)
    .map((block) => {
      const range: BlockRange = {
        block,
        weekOffset,
        startDate: addDays(startDate, weekOffset * 7),
        endDate: addDays(startDate, (weekOffset + block.weeks) * 7 - 1),
      };
      weekOffset += block.weeks;
      return range;
    });
}

export function planEndDate(startDate: string, blocks: PlanBlock[]): string {
  return addDays(startDate, Math.max(1, totalWeeks(blocks)) * 7 - 1);
}

export interface ScheduledSession {
  date: string;
  session: PlanSession;
  block: PlanBlock;
}

/** All sessions with dates in [from, to] (inclusive), in calendar order. */
export function sessionsInRange(
  startDate: string,
  blocks: PlanBlock[],
  sessions: PlanSession[],
  from: string,
  to: string,
): ScheduledSession[] {
  const ranges = new Map(blockRanges(startDate, blocks).map((r) => [r.block.id, r]));
  const out: ScheduledSession[] = [];
  for (const session of sessions) {
    const range = ranges.get(session.blockId);
    if (!range) continue;
    const date = addDays(range.startDate, (session.week - 1) * 7 + session.day);
    if (date >= from && date <= to) out.push({ date, session, block: range.block });
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.block.position - b.block.position ||
      a.session.position - b.session.position,
  );
}

export interface PlanPosition {
  block: PlanBlock;
  blockIndex: number;
  /** 1-based week within the block. */
  week: number;
  /** 1-based week within the whole plan. */
  planWeek: number;
  totalWeeks: number;
}

/** Where `date` falls in the plan, or null if outside it. */
export function planPosition(startDate: string, blocks: PlanBlock[], date: string): PlanPosition | null {
  const days = daysBetween(startDate, date);
  if (days < 0) return null;
  const planWeek = Math.floor(days / 7) + 1;
  const total = totalWeeks(blocks);
  if (planWeek > total) return null;
  const ranges = blockRanges(startDate, blocks);
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (planWeek <= r.weekOffset + r.block.weeks) {
      return { block: r.block, blockIndex: i, week: planWeek - r.weekOffset, planWeek, totalWeeks: total };
    }
  }
  return null;
}
