// Progress charts for one exercise: load, % bodyweight, estimated 1RM, grade
// or duration, depending on what the exercise logs. One measure per chart.
import { Spacing } from '@/constants/theme';
import { loggedSetsForExercise } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useSettings } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { formatShort } from '@/lib/dates';
import { displayWeight, formatDuration } from '@/lib/format';
import { FONT_GRADES, gradeIndex } from '@/lib/grades';
import { sessionSeries, supportsE1rm, type SessionPoint } from '@/lib/metrics';
import type { Exercise } from '@/lib/types';

import { LineChart, type ChartPoint } from './line-chart';
import { Card, Row, Section, T } from './ui';

interface ChartSpec {
  title: string;
  points: ChartPoint[];
  format: (y: number) => string;
  integerTicks?: boolean;
  /** Unit appended in the stat tiles, e.g. "kg". */
  unit?: string;
}

export function ExerciseCharts({ exercise, showEmpty = false }: { exercise: Exercise; showEmpty?: boolean }) {
  const c = useTheme();
  const { unit, bodyweightKg } = useSettings();
  const { data: sets } = useQuery((db) => loggedSetsForExercise(db, exercise.id), [exercise.id]);
  if (!sets) return null;

  const series = sessionSeries(sets, exercise, bodyweightKg);
  if (series.length === 0) {
    return showEmpty ? (
      <T tone="secondary">No completed sets logged for {exercise.name} yet.</T>
    ) : null;
  }

  const pick = (f: (p: SessionPoint) => number | null): ChartPoint[] =>
    series.flatMap((p) => {
      const y = f(p);
      return y == null ? [] : [{ date: p.date, y }];
    });

  const signed = (v: number) => `${exercise.bodyweight && v > 0 ? '+' : ''}${v}`;
  const charts: ChartSpec[] = [];
  if (exercise.tracks.includes('weight')) {
    charts.push({
      title: exercise.bodyweight ? `Top added weight (${unit})` : `Top weight (${unit})`,
      points: pick((p) => (p.topWeightKg == null ? null : displayWeight(p.topWeightKg, unit))),
      format: (v) => signed(Math.round(v * 10) / 10),
      unit,
    });
  }
  if (exercise.bodyweight) {
    charts.push({
      title: 'Total load (% bodyweight)',
      points: pick((p) => (p.pctBodyweight == null ? null : Math.round(p.pctBodyweight))),
      format: (v) => `${Math.round(v)}%`,
    });
  }
  if (supportsE1rm(exercise)) {
    charts.push({
      title: `Estimated 1RM (${unit})`,
      points: pick((p) => (p.e1rmKg == null ? null : displayWeight(p.e1rmKg, unit))),
      format: (v) => signed(Math.round(v * 10) / 10),
      unit,
    });
  }
  if (exercise.tracks.includes('grade')) {
    charts.push({
      title: 'Hardest grade (Font)',
      points: pick((p) => (p.maxGrade ? gradeIndex(p.maxGrade) : null)),
      format: (v) => FONT_GRADES[Math.max(0, Math.min(FONT_GRADES.length - 1, Math.round(v)))],
      integerTicks: true,
    });
  }
  if (exercise.tracks.includes('duration') && !exercise.tracks.includes('weight')) {
    charts.push({
      title: 'Longest effort',
      points: pick((p) => p.maxDurationSec),
      format: (v) => formatDuration(Math.round(v)),
    });
  }
  if (charts.length === 0 && exercise.tracks.includes('reps')) {
    charts.push({ title: 'Total reps', points: pick((p) => p.totalReps || null), format: (v) => String(Math.round(v)) });
  }
  const visible = charts.filter((ch) => ch.points.length > 0);
  const primary = visible[0];
  const best = primary ? Math.max(...primary.points.map((p) => p.y)) : null;
  const latest = primary?.points[primary.points.length - 1];
  const stat = (y: number) => `${primary!.format(y)}${primary!.unit ? ` ${primary!.unit}` : ''}`;

  return (
    <Section title="Progress">
      <Row>
        <Stat label="Sessions" value={String(series.length)} />
        {primary && best != null ? <Stat label="Best" value={stat(best)} /> : null}
        {latest ? <Stat label="Latest" value={stat(latest.y)} /> : null}
      </Row>
      {exercise.bodyweight && !bodyweightKg ? (
        <T variant="caption" tone="secondary">
          Set your bodyweight in Settings to see load as % of bodyweight.
        </T>
      ) : null}
      {visible.map((ch) => (
        <Card key={ch.title}>
          <T variant="label" tone="secondary">
            {ch.title}
          </T>
          {ch.points.length < 2 ? (
            <T tone="secondary">Log at least two sessions to see a trend. So far: {ch.format(ch.points[0].y)}.</T>
          ) : (
            <LineChart data={ch.points} formatY={ch.format} integerTicks={ch.integerTicks} />
          )}
        </Card>
      ))}
      {primary ? (
        <Card>
          <T variant="label" tone="secondary">
            Recent sessions
          </T>
          {primary.points
            .slice(-8)
            .reverse()
            .map((p, i) => (
              <Row key={`${p.date}-${i}`} style={{ justifyContent: 'space-between', borderTopWidth: i ? 1 : 0, borderColor: c.grid, paddingTop: i ? Spacing.xs : 0 }}>
                <T tone="secondary">{formatShort(p.date)}</T>
                <T variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                  {primary.format(p.y)}
                </T>
              </Row>
            ))}
        </Card>
      ) : null}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, padding: Spacing.md, gap: 0 }}>
      <T variant="caption" tone="secondary">
        {label}
      </T>
      <T variant="title">{value}</T>
    </Card>
  );
}
