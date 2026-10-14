// Local-date helpers. Dates are passed around as 'YYYY-MM-DD' strings in the
// device's local timezone so a session "on Monday" stays on Monday.
import type { Weekday } from './types';

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateString(parseDate(s)) === s;
}

export function today(): string {
  return toDateString(new Date());
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayOf(s: string): Weekday {
  return ((parseDate(s).getDay() + 6) % 7) as Weekday;
}

export function mondayOf(s: string): string {
  return addDays(s, -weekdayOf(s));
}

export function daysBetween(from: string, to: string): number {
  // Use UTC to avoid DST shifting the result by an hour.
  const a = parseDate(from);
  const b = parseDate(to);
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 13 Oct" */
export function formatDay(s: string): string {
  const d = parseDate(s);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "13 Oct 2026" */
export function formatDate(s: string): string {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "13 Oct" */
export function formatShort(s: string): string {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
