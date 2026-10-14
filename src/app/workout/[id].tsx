import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable } from 'react-native';

import { Badge, Button, Card, Empty, IconButton, ListItem, Loading, Row, Screen, Section, T } from '@/components/ui';
import { ItemSummary, OriginBadge } from '@/components/workout-bits';
import { workoutOrigin } from '@/data/library';
import { countPlanSessionsForWorkout, deleteWorkout, getWorkout, resetWorkout, sessionLogsForWorkout } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useExercises, useMaxes, useSettings } from '@/hooks/data';
import { formatDay } from '@/lib/dates';
import { formatEstimate, formatHours, plural } from '@/lib/format';
import { applyMaxes } from '@/lib/maxtest';
import { estimateWorkoutSec } from '@/lib/timer';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { data: workout, loading } = useQuery((d) => getWorkout(d, id), [id]);
  const { byId: exercises } = useExercises();
  const { data: history } = useQuery((d) => sessionLogsForWorkout(d, id), [id]);
  const { unit, bodyweightKg } = useSettings();
  const maxes = useMaxes();

  if (loading) return <Loading />;
  if (!workout) {
    return (
      <Screen>
        <Empty icon="alert-circle-outline" title="Workout not found" />
      </Screen>
    );
  }

  const remove = async () => {
    const uses = await countPlanSessionsForWorkout(db, workout.id);
    Alert.alert(
      'Delete workout?',
      uses > 0
        ? `It is scheduled ${uses} times in your plans. Those sessions will be removed too.`
        : 'This cannot be undone. Your logged history is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteWorkout(db, workout.id);
            router.back();
          },
        },
      ],
    );
  };

  const start = (mode: 'timer' | 'log') =>
    workout.test
      ? router.push({ pathname: '/test/run', params: { workoutId: workout.id } })
      : router.push({ pathname: '/session/run', params: { workoutId: workout.id, mode } });
  // Items prescribed as % of max show the weight worked out from the latest test.
  const items = applyMaxes(workout.items, exercises, maxes, bodyweightKg);

  const origin = workoutOrigin(workout);
  const edit = () => router.push({ pathname: '/workout/edit', params: { id: workout.id } });
  const reset = () =>
    Alert.alert('Reset to library version?', 'Your changes to this workout are discarded. Plans that use it keep it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => resetWorkout(db, workout.id) },
    ]);

  return (
    <Screen>
      <Stack.Screen
        options={{ title: workout.name, headerRight: () => <IconButton name="pencil-outline" label="Edit workout" onPress={edit} /> }}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        {workout.test ? <Badge label="Max test" tone="accent" /> : null}
        {workout.focus ? <Badge label={workout.focus} tone="accent2" /> : null}
        <Badge label={formatEstimate(estimateWorkoutSec(workout.items))} />
        <OriginBadge origin={origin} />
      </Row>
      {workout.description ? <T>{workout.description}</T> : null}

      {workout.test ? (
        <Button title="Start test" icon="flag-checkered" onPress={() => start('timer')} />
      ) : (
        <Row>
          <Button title="Start" icon="play" onPress={() => start('timer')} style={{ flex: 1 }} />
          <Button title="Log" icon="pencil-outline" variant="tonal" onPress={() => start('log')} style={{ flex: 1 }} />
        </Row>
      )}

      <Section title="Exercises">
        {items.map((item, i) => (
          <Pressable key={i} onPress={() => router.push(`/exercise/${item.exerciseId}`)}>
            <Card>
              <ItemSummary item={item} exercise={exercises.get(item.exerciseId)} unit={unit} index={i} />
            </Card>
          </Pressable>
        ))}
      </Section>

      {history && history.total > 0 ? (
        <Section title={`Your history · ${plural(history.total, 'session')}`}>
          {history.recent.map((l) => (
            <ListItem
              key={l.id}
              title={formatDay(l.completedAt.slice(0, 10))}
              subtitle={[l.durationSec ? formatHours(l.durationSec) : null, l.rpe ? `RPE ${l.rpe}` : null].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/session/${l.id}`)}
            />
          ))}
        </Section>
      ) : null}

      <Row>
        <Button title="Edit" icon="pencil" variant="tonal" style={{ flex: 1 }} onPress={edit} />
        <Button
          title="Duplicate"
          icon="content-copy"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/workout/edit', params: { copyOf: workout.id } })}
        />
      </Row>
      {origin === 'edited' ? (
        <Button title="Reset to library version" icon="restore" variant="secondary" onPress={reset} />
      ) : null}
      {origin === 'custom' ? (
        <Button title="Delete workout" icon="trash-can-outline" variant="danger" onPress={remove} />
      ) : null}
    </Screen>
  );
}
