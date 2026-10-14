// Progress: an overview (training mix by type + activity over time) by default,
// a per-type breakdown to drill into single exercises/workouts, and history.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarChart, type BarDatum } from '@/components/bar-chart';
import { Sparkline } from '@/components/sparkline';
import { DonutChart } from '@/components/donut-chart';
import { Card, Chip, ChipRow, Empty, ListItem, Row, Screen, Section, Segmented, T } from '@/components/ui';
import { Spacing, TypeColors } from '@/constants/theme';
import { listSessionLogs, progressData, weightedSets } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useExercises, useMaxes, useSettings } from '@/hooks/data';
import { useScheme, useTheme } from '@/hooks/use-theme';
import {
  PERIOD_LABELS,
  PERIODS,
  activityBuckets,
  bucketUnit,
  exerciseSummaries,
  foldSlices,
  inPeriod,
  periodStart,
  timeByType,
  workoutSummaries,
  type Metric,
  type Period,
} from '@/lib/analytics';
import { formatDay, formatShort, parseDate, today } from '@/lib/dates';
import { displayWeight, formatHours, formatWeight, plural } from '@/lib/format';
import { sessionSeries, weightTrend, type LoggedSet } from '@/lib/metrics';
import { TRAINING_TYPE_LABELS, type TrainingType } from '@/lib/types';

type View_ = 'overview' | 'performance' | 'types' | 'history';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ProgressScreen() {
  const [view, setView] = useState<View_>('overview');
  const [period, setPeriod] = useState<Period>('30d');
  const { data } = useQuery(progressData);
  const { data: logs } = useQuery((db) => listSessionLogs(db, 200));

  if (data && data.sessions.length === 0) {
    return (
      <Screen title="Progress">
        <Empty
          icon="chart-line"
          title="Nothing logged yet"
          message="Finish or log a workout and your training mix, activity and strength charts will show up here."
        />
      </Screen>
    );
  }

  const t = today();
  const sessions = inPeriod(data?.sessions ?? [], period, t);
  const ids = new Set(sessions.map((s) => s.id));
  const sets = (data?.sets ?? []).filter((s) => ids.has(s.sessionId));

  return (
    <Screen title="Progress">
      <Segmented<View_>
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'performance', label: 'Performance' },
          { value: 'types', label: 'By type' },
          { value: 'history', label: 'History' },
        ]}
        value={view}
        onChange={setView}
      />
      {view !== 'history' ? (
        <ChipRow>
          {PERIODS.map((p) => (
            <Chip key={p} label={PERIOD_LABELS[p]} selected={period === p} onPress={() => setPeriod(p)} />
          ))}
        </ChipRow>
      ) : null}

      {view === 'overview' ? <Overview sessions={sessions} sets={sets} period={period} /> : null}
      {view === 'performance' ? <Performance period={period} /> : null}
      {view === 'types' ? <ByType sessions={sessions} sets={sets} /> : null}
      {view === 'history' ? (
        <View style={{ gap: Spacing.sm }}>
          {(logs ?? []).map((l) => (
            <ListItem
              key={l.id}
              title={l.workoutName}
              subtitle={[
                formatDay(l.completedAt.slice(0, 10)),
                l.durationSec ? formatHours(l.durationSec) : null,
                plural(l.setCount, 'set'),
                l.rpe ? `RPE ${l.rpe}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => router.push(`/session/${l.id}`)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

type Sessions = Parameters<typeof workoutSummaries>[0];
type Sets = Parameters<typeof exerciseSummaries>[1];

function Overview({ sessions, sets, period }: { sessions: Sessions; sets: Sets; period: Period }) {
  const c = useTheme();
  const colors = TypeColors[useScheme()];
  const [selected, setSelected] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('time');

  const totalSec = sessions.reduce((n, s) => n + s.durationSec, 0);
  const activeDays = new Set(sessions.map((s) => s.date)).size;
  const slices = foldSlices(timeByType(sessions, sets));
  const active = slices.find((s) => s.key === selected) ?? null;

  const unit = bucketUnit(period);
  const buckets = activityBuckets(sessions, period, today(), metric);
  const bars: BarDatum[] = buckets.map((b) => {
    const d = parseDate(b.start);
    return {
      key: b.start,
      label: b.label,
      tooltip:
        unit === 'day' ? formatDay(b.start) : unit === 'week' ? `Week of ${formatShort(b.start)}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      value: metric === 'time' ? b.value / 60 : b.value,
    };
  });
  const per = unit === 'day' ? 'day' : unit;

  if (sessions.length === 0) {
    return <Empty icon="calendar-blank-outline" title={`No training in the last ${PERIOD_LABELS[period].toLowerCase()}`} />;
  }

  return (
    <>
      <Row>
        <Stat label="Sessions" value={String(sessions.length)} />
        <Stat label="Training time" value={formatHours(totalSec)} />
        <Stat label="Active days" value={String(activeDays)} />
      </Row>

      <Card>
        <T variant="label" tone="secondary">
          TRAINING MIX
        </T>
        {slices.length === 0 ? (
          <T tone="secondary">No sets logged in this period.</T>
        ) : (
          <>
            <DonutChart
              slices={slices.map((s) => ({ key: s.key, label: TRAINING_TYPE_LABELS[s.key], value: s.sec, color: colors[s.key] }))}
              selected={selected}
              onSelect={setSelected}
              center={
                active ? (
                  <>
                    <T variant="title">{Math.round(active.fraction * 100)}%</T>
                    <T variant="caption" tone="secondary" style={{ textAlign: 'center' }} numberOfLines={2}>
                      {TRAINING_TYPE_LABELS[active.key]}
                    </T>
                  </>
                ) : (
                  <>
                    <T variant="title">{formatHours(totalSec)}</T>
                    <T variant="caption" tone="secondary">
                      total
                    </T>
                  </>
                )
              }
            />
            <View style={{ gap: 2 }}>
              {slices.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => setSelected(selected === s.key ? null : s.key)}
                  style={[styles.legendRow, selected === s.key && { backgroundColor: c.surfaceAlt }]}>
                  <View style={[styles.swatch, { backgroundColor: colors[s.key] }]} />
                  <View style={{ flex: 1 }}>
                    <T>{TRAINING_TYPE_LABELS[s.key]}</T>
                    {s.types.length > 1 ? (
                      <T variant="caption" tone="secondary">
                        {s.types.map((x) => TRAINING_TYPE_LABELS[x]).join(', ')}
                      </T>
                    ) : null}
                  </View>
                  <T tone="secondary" style={styles.num}>
                    {formatHours(s.sec)}
                  </T>
                  <T variant="heading" style={[styles.num, { width: 48, textAlign: 'right' }]}>
                    {Math.round(s.fraction * 100)}%
                  </T>
                </Pressable>
              ))}
            </View>
            <T variant="caption" tone="secondary">
              Share of training time, including rests. Tap a slice or row to highlight it.
            </T>
          </>
        )}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="label" tone="secondary">
            {metric === 'time' ? `TRAINING TIME PER ${per.toUpperCase()}` : `SESSIONS PER ${per.toUpperCase()}`}
          </T>
          <T variant="heading">{metric === 'time' ? formatHours(totalSec) : plural(sessions.length, 'session')}</T>
        </Row>
        <Segmented<Metric>
          options={[
            { value: 'time', label: 'Time' },
            { value: 'sessions', label: 'Sessions' },
          ]}
          value={metric}
          onChange={setMetric}
        />
        <BarChart
          data={bars}
          formatAxis={(v) => (metric === 'time' ? (v >= 60 ? `${Math.round((v / 60) * 10) / 10}h` : `${Math.round(v)}m`) : String(v))}
          formatValue={(v) => (metric === 'time' ? formatHours(v * 60) : plural(v, 'session'))}
        />
      </Card>
    </>
  );
}

function ByType({ sessions, sets }: { sessions: Sessions; sets: Sets }) {
  const c = useTheme();
  const colors = TypeColors[useScheme()];
  const byType = timeByType(sessions, sets).sort((a, b) => b.sec - a.sec);
  const totalSec = byType.reduce((n, x) => n + x.sec, 0);
  const exercises = exerciseSummaries(sessions, sets);
  const workouts = workoutSummaries(sessions);

  if (sessions.length === 0) return <Empty icon="calendar-blank-outline" title="No training in this period" />;

  return (
    <>
      <T variant="caption" tone="secondary">
        Tap an exercise for its strength and progress charts.
      </T>
      {byType.map(({ type, sec }) => (
        <Card key={type}>
          <Row>
            <View style={[styles.swatch, { backgroundColor: colors[type as TrainingType] }]} />
            <T variant="heading" style={{ flex: 1 }}>
              {TRAINING_TYPE_LABELS[type]}
            </T>
            <T tone="secondary" style={styles.num}>
              {formatHours(sec)}
            </T>
            <T variant="heading" style={[styles.num, { width: 48, textAlign: 'right' }]}>
              {totalSec ? Math.round((sec / totalSec) * 100) : 0}%
            </T>
          </Row>
          {exercises
            .filter((e) => e.type === type)
            .map((e) => (
              <Pressable
                key={e.exerciseId}
                onPress={() => router.push(`/stats/${e.exerciseId}`)}
                style={({ pressed }) => [styles.exerciseRow, { borderColor: c.grid }, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1 }}>
                  <T>{e.name}</T>
                  <T variant="caption" tone="secondary">
                    {plural(e.sessions, 'session')} · last {formatShort(e.lastDate)}
                  </T>
                </View>
                <T tone="secondary" style={styles.num}>
                  {formatHours(e.sec)}
                </T>
                <T tone="secondary">›</T>
              </Pressable>
            ))}
        </Card>
      ))}

      <Section title="Workouts">
        {workouts.map((w) => (
          <ListItem
            key={w.workoutId ?? w.name}
            title={w.name}
            subtitle={`${plural(w.sessions, 'session')} · ${formatHours(w.sec)} · last ${formatShort(w.lastDate)}`}
            onPress={w.workoutId ? () => router.push(`/workout/${w.workoutId}`) : undefined}
          />
        ))}
      </Section>
    </>
  );
}

/** Strength exercises with a logged weight: latest top weight, change and trend. */
function Performance({ period }: { period: Period }) {
  const { unit, bodyweightKg } = useSettings();
  const maxes = useMaxes();
  const { byId: exercises } = useExercises();
  const { data: sets } = useQuery(weightedSets);
  if (!sets) return null;

  const byExercise = new Map<string, LoggedSet[]>();
  for (const s of sets) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);

  const from = periodStart(period, today());
  const rows = [...byExercise.entries()].flatMap(([id, list]) => {
    const exercise = exercises.get(id);
    if (!exercise || !exercise.tracks.includes('weight')) return [];
    const trend = weightTrend(sessionSeries(list, exercise, bodyweightKg), from);
    return trend ? [{ exercise, trend }] : [];
  });
  rows.sort((a, b) => b.trend.latest.date.localeCompare(a.trend.latest.date));

  if (rows.length === 0) {
    return (
      <Empty
        icon="arm-flex-outline"
        title={period === 'all' ? 'No weighted exercises logged yet' : `No weighted sessions in the last ${PERIOD_LABELS[period].toLowerCase()}`}
        message="Exercises that log weight (max hangs, weighted pull-ups, block lifts, deadlifts…) show up here with their progress."
      />
    );
  }

  const signed = (kg: number, bodyweight: boolean) => formatWeight(kg, unit, bodyweight);

  return (
    <>
      <T variant="caption" tone="secondary">
        Top weight per exercise ({unit === 'kg' ? 'kilograms' : 'pounds'}; added weight for hangs and pull-ups). Change is
        first to latest session in the period. Tap for the weight-over-time chart.
      </T>
      {rows.map(({ exercise, trend }) => {
        const change = trend.changeKg == null ? null : displayWeight(trend.changeKg, unit);
        return (
          <Card key={exercise.id} onPress={() => router.push(`/stats/${exercise.id}`)}>
            <Row style={{ alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T variant="heading" numberOfLines={1}>
                  {exercise.name}
                </T>
                <T variant="caption" tone="secondary">
                  {plural(trend.points.length, 'session')} · best {signed(trend.bestKg, exercise.bodyweight)} · last{' '}
                  {formatShort(trend.latest.date)}
                  {maxes.get(exercise.id) ? ` · max ${signed(maxes.get(exercise.id)!.maxKg, exercise.bodyweight)}` : ''}
                </T>
              </View>
              <Sparkline values={trend.points.slice(-12).map((p) => p.topWeightKg!)} />
              <View style={{ alignItems: 'flex-end', minWidth: 72 }}>
                <T variant="heading" style={styles.num}>
                  {signed(trend.latest.topWeightKg!, exercise.bodyweight)}
                </T>
                {change == null ? (
                  <T variant="caption" tone="secondary">
                    1 session
                  </T>
                ) : (
                  <T variant="caption" tone={change > 0 ? 'success' : change < 0 ? 'danger' : 'secondary'} style={styles.num}>
                    {change > 0 ? '▲ ' : change < 0 ? '▼ ' : ''}
                    {change === 0 ? 'no change' : `${Math.abs(change)} ${unit}`}
                  </T>
                )}
              </View>
            </Row>
          </Card>
        );
      })}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, padding: Spacing.md, gap: 0 }}>
      <T variant="caption" tone="secondary">
        {label}
      </T>
      <T variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
        {value}
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  num: { fontVariant: ['tabular-nums'] },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
