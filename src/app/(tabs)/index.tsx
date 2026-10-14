import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Empty, IconButton, Row, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { completedPlanSessions, getActivePlanBundle } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useExercises, useWorkouts } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDay, formatShort, mondayOf, parseDate, today } from '@/lib/dates';
import { formatEstimate } from '@/lib/format';
import { planEndDate, planPosition, sessionsInRange, type ScheduledSession } from '@/lib/schedule';
import { estimateWorkoutSec } from '@/lib/timer';
import { WEEKDAY_SHORT } from '@/lib/types';

export default function TodayScreen() {
  const c = useTheme();
  const todayStr = today();
  const [selected, setSelected] = useState(todayStr);
  const weekStart = mondayOf(selected);
  const weekEnd = addDays(weekStart, 6);

  const { data: bundle, loading } = useQuery(getActivePlanBundle);
  const { data: done } = useQuery((db) => completedPlanSessions(db, weekStart, weekEnd), [weekStart]);
  const { byId: workouts } = useWorkouts();
  const { byId: exercises } = useExercises();

  const settingsButton = (
    <IconButton name="cog-outline" label="Settings" onPress={() => router.push('/settings')} />
  );

  if (loading) return <Screen title="Today">{null}</Screen>;

  if (!bundle || !bundle.plan.startDate) {
    return (
      <Screen title="Today" subtitle={formatDay(todayStr)} right={settingsButton}>
        <Empty
          icon="calendar-blank-outline"
          title="No active plan"
          message="Import a plan, build one yourself, or just pick a workout from the library.">
          <Button title="Import plan" icon="import" onPress={() => router.push('/import')} />
          <Button title="Create a plan" variant="tonal" icon="plus" onPress={() => router.push('/plans')} />
          <Button title="Browse workouts" variant="secondary" icon="dumbbell" onPress={() => router.push('/library')} />
        </Empty>
      </Screen>
    );
  }

  const { plan, blocks, sessions } = bundle;
  const start = plan.startDate!;
  const end = planEndDate(start, blocks);
  const week = sessionsInRange(start, blocks, sessions, weekStart, weekEnd);
  const position = planPosition(start, blocks, selected);
  const todayPosition = planPosition(start, blocks, todayStr);
  const dayItems = week.filter((s) => s.date === selected);
  const isDone = (s: ScheduledSession) => done?.has(`${s.session.id}@${s.date}`) ?? false;

  let status: string;
  if (todayStr < start) status = `Starts ${formatDay(start)}`;
  else if (todayStr > end) status = `Finished ${formatDay(end)}`;
  else status = `${todayPosition!.block.name} · week ${todayPosition!.week} of ${todayPosition!.block.weeks}`;

  return (
    <Screen title="Today" subtitle={formatDay(todayStr)} right={settingsButton}>
      <Card onPress={() => router.push(`/plan/${plan.id}`)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading" style={{ flex: 1 }} numberOfLines={1}>
            {plan.name}
          </T>
          <Badge label="Active" tone="accent" />
        </Row>
        <T tone="secondary">{status}</T>
        {todayPosition ? (
          <View style={[styles.progressTrack, { backgroundColor: c.surfaceAlt }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: c.accent, width: `${(todayPosition.planWeek / todayPosition.totalWeeks) * 100}%` },
              ]}
            />
          </View>
        ) : null}
        {plan.goal ? (
          <T variant="caption" tone="secondary">
            Goal: {plan.goal}
          </T>
        ) : null}
      </Card>

      <View style={{ gap: Spacing.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton name="chevron-left" label="Previous week" onPress={() => setSelected(addDays(selected, -7))} />
          <T variant="label" tone="secondary">
            {position ? `Plan week ${position.planWeek} of ${position.totalWeeks} · ` : ''}
            {formatShort(weekStart)} – {formatShort(weekEnd)}
          </T>
          <IconButton name="chevron-right" label="Next week" onPress={() => setSelected(addDays(selected, 7))} />
        </Row>
        <Row gap={Spacing.xs}>
          {WEEKDAY_SHORT.map((label, i) => {
            const date = addDays(weekStart, i);
            const items = week.filter((s) => s.date === date);
            const allDone = items.length > 0 && items.every(isDone);
            const isSelected = date === selected;
            const isToday = date === todayStr;
            return (
              <Pressable
                key={date}
                onPress={() => setSelected(date)}
                style={[
                  styles.day,
                  {
                    backgroundColor: isSelected ? c.accent : c.surface,
                    borderColor: isToday ? c.accent : c.border,
                  },
                ]}>
                <T variant="caption" style={{ color: isSelected ? c.onAccent : c.textSecondary }}>
                  {label}
                </T>
                <T variant="heading" style={{ color: isSelected ? c.onAccent : c.text }}>
                  {parseDate(date).getDate()}
                </T>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: items.length
                        ? allDone
                          ? c.success
                          : isSelected
                            ? c.onAccent
                            : c.accent2
                        : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </Row>
        {selected !== todayStr ? (
          <Button title="Back to today" variant="ghost" small onPress={() => setSelected(todayStr)} />
        ) : null}
      </View>

      <Section title={selected === todayStr ? "Today's training" : formatDay(selected)}>
        {dayItems.length === 0 ? (
          <Card>
            <T variant="heading">Rest day</T>
            <T tone="secondary">
              {selected < start || selected > end
                ? 'Outside this plan.'
                : 'Nothing scheduled. Recover, stretch, or do some easy mileage.'}
            </T>
          </Card>
        ) : (
          dayItems.map((s) => {
            const workout = workouts.get(s.session.workoutId);
            if (!workout) return null;
            const completed = isDone(s);
            const exerciseNames = workout.items
              .map((i) => exercises.get(i.exerciseId)?.name)
              .filter(Boolean)
              .join(' · ');
            const params = { workoutId: workout.id, planSessionId: s.session.id, date: s.date };
            return (
              <Card key={`${s.session.id}`} accent={!completed && s.date === todayStr} onPress={() => router.push(`/workout/${workout.id}`)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="heading" style={{ flex: 1 }}>
                    {workout.name}
                  </T>
                  {completed ? <Badge label="Done" tone="success" /> : null}
                </Row>
                <T variant="caption" tone="secondary">
                  {[workout.focus, formatEstimate(estimateWorkoutSec(workout.items))].filter(Boolean).join(' · ')}
                </T>
                <T numberOfLines={2}>{exerciseNames}</T>
                {s.session.notes ? (
                  <T variant="caption" style={{ fontStyle: 'italic' }}>
                    {s.session.notes}
                  </T>
                ) : null}
                {workout.test ? (
                  <Button
                    title={completed ? 'Test again' : 'Start test'}
                    icon="flag-checkered"
                    small
                    variant={completed ? 'secondary' : 'primary'}
                    style={{ marginTop: Spacing.xs }}
                    onPress={() => router.push({ pathname: '/test/run', params })}
                  />
                ) : (
                  <Row style={{ marginTop: Spacing.xs }}>
                    <Button
                      title={completed ? 'Do again' : 'Start'}
                      icon="play"
                      small
                      variant={completed ? 'secondary' : 'primary'}
                      style={{ flex: 1 }}
                      onPress={() => router.push({ pathname: '/session/run', params: { ...params, mode: 'timer' } })}
                    />
                    <Button
                      title="Log"
                      icon="pencil-outline"
                      small
                      variant="tonal"
                      style={{ flex: 1 }}
                      onPress={() => router.push({ pathname: '/session/run', params: { ...params, mode: 'log' } })}
                    />
                  </Row>
                )}
              </Card>
            );
          })
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.xs },
  progressFill: { height: 6, borderRadius: 3 },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
