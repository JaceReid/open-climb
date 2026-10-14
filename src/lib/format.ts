import type { Exercise, Prescription, Settings } from './types';

type Unit = Settings['unit'];

/** Label of a set from a prescription's setLabels, cycling through them. */
export function setLabel(p: Pick<Prescription, 'setLabels'>, setIndex: number): string | null {
  const labels = p.setLabels?.filter((l) => l.trim()) ?? [];
  return labels.length ? labels[setIndex % labels.length] : null;
}

/** "1 set", "3 sets" */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const KG_PER_LB = 0.45359237;

export function kgToUnit(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function unitToKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

function round(n: number, step = 0.5): number {
  return Math.round(n / step) * step;
}

/** Display value in the user's unit, rounded to a sensible step. */
export function displayWeight(kg: number, unit: Unit): number {
  return round(kgToUnit(kg, unit), unit === 'kg' ? 0.5 : 1);
}

/** "+10 kg", "-15 kg", "60 kg". Bodyweight exercises always show a sign. */
export function formatWeight(kg: number, unit: Unit, signed = false): string {
  const v = displayWeight(kg, unit);
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v} ${unit}`;
}

/** "10s", "1:30", "20 min" */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec >= 600 && sec % 60 === 0) return `${sec / 60} min`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Clock face for the timer: "0:07", "12:30". */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Training totals: "45 min", "6 h", "6 h 20 min". */
export function formatHours(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Compact totals for tight spaces: "45m", "6h", "11h 52m". */
export function formatHoursShort(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "≈ 45 min" */
export function formatEstimate(sec: number): string {
  if (sec <= 0) return '';
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 90) return `≈ ${min} min`;
  return `≈ ${(min / 60).toFixed(1)} h`;
}

/** Main line, e.g. "5 sets × 6 × 7s on / 3s off". */
export function formatSetsReps(p: Prescription): string {
  const sets = `${p.sets} ${p.sets === 1 ? 'set' : 'sets'}`;
  if (p.workSec) {
    const work = formatDuration(p.workSec);
    if (p.reps > 1) {
      const rest = p.restSec ? ` / ${formatDuration(p.restSec)} off` : '';
      return `${sets} × ${p.reps} × ${work}${p.restSec ? ' on' : ''}${rest}`;
    }
    return `${sets} × ${work}`;
  }
  return `${sets} × ${p.reps} ${p.reps === 1 ? 'rep' : 'reps'}`;
}

/** Secondary details: load, edge, grip, rest. */
export function formatDetails(
  p: Prescription & { needsTest?: boolean },
  exercise: Pick<Exercise, 'bodyweight'> | undefined,
  unit: Unit,
): string {
  const parts: string[] = [];
  const weight =
    p.weightKg != null && (p.weightKg !== 0 || p.pctOfMax != null)
      ? formatWeight(p.weightKg, unit, exercise?.bodyweight ?? false)
      : null;
  if (p.pctOfMax != null) {
    // Items resolved from a max show both: "+10 kg (80% max)".
    if (p.needsTest || weight == null) parts.push(`${p.pctOfMax}% of max${p.needsTest ? ' (test needed)' : ''}`);
    else parts.push(`${weight} (${p.pctOfMax}% max)`);
  } else if (weight) {
    parts.push(weight);
  }
  if (p.edgeMm) parts.push(`${p.edgeMm}mm`);
  if (p.grip) parts.push(p.grip);
  if (p.setLabels?.length) parts.push(p.setLabels.join(' → '));
  if (p.intensity) parts.push(p.intensity);
  if (p.setRestSec && p.sets > 1) parts.push(`rest ${formatDuration(p.setRestSec)}`);
  return parts.join(' · ');
}
