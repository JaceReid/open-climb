import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert } from 'react-native';

import { ExerciseCharts } from '@/components/exercise-charts';
import { MaxCard } from '@/components/max-card';
import { Badge, Button, Card, Empty, IconButton, ListItem, Loading, Row, Screen, Section, T } from '@/components/ui';
import { OriginBadge } from '@/components/workout-bits';
import { exerciseOrigin } from '@/data/library';
import { deleteExercise, getExercise, resetExercise, workoutsUsingExercise } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useSettings } from '@/hooks/data';
import { formatDetails, formatSetsReps } from '@/lib/format';
import { CATEGORY_LABELS, TRAINING_TYPE_LABELS } from '@/lib/types';

const TRACK_LABELS = { weight: 'Weight', reps: 'Reps', duration: 'Time', grade: 'Grade' } as const;

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { unit } = useSettings();
  const { data: exercise, loading } = useQuery((d) => getExercise(d, id), [id]);
  const { data: usedIn } = useQuery((d) => workoutsUsingExercise(d, id), [id]);

  if (loading) return <Loading />;
  if (!exercise) {
    return (
      <Screen>
        <Empty icon="alert-circle-outline" title="Exercise not found" />
      </Screen>
    );
  }

  const remove = () => {
    if (usedIn && usedIn.length > 0) {
      return Alert.alert('In use', `Remove it from ${usedIn.map((w) => w.name).join(', ')} first.`);
    }
    Alert.alert('Delete exercise?', 'Your logged history for it is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExercise(db, exercise.id);
          router.back();
        },
      },
    ]);
  };

  const origin = exerciseOrigin(exercise);
  const edit = () => router.push({ pathname: '/exercise/edit', params: { id: exercise.id } });
  const reset = () =>
    Alert.alert('Reset to library version?', 'Your changes to this exercise are discarded.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => resetExercise(db, exercise.id) },
    ]);

  const details = formatDetails(exercise.defaults, exercise, unit);
  // Logs (or times) just this exercise as its own session, using its defaults.
  const run = (mode: 'log' | 'timer') =>
    router.push({ pathname: '/session/run', params: { exerciseId: exercise.id, mode } });

  return (
    <Screen>
      <Stack.Screen
        options={{ title: exercise.name, headerRight: () => <IconButton name="pencil-outline" label="Edit exercise" onPress={edit} /> }}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        <Badge label={TRAINING_TYPE_LABELS[exercise.type]} tone="accent2" />
        <Badge label={CATEGORY_LABELS[exercise.category]} />
        {exercise.tracks.map((t) => (
          <Badge key={t} label={`Logs ${TRACK_LABELS[t].toLowerCase()}`} />
        ))}
        <OriginBadge origin={origin} />
      </Row>
      {exercise.description ? <T>{exercise.description}</T> : null}
      <Row>
        <Button title="Log this exercise" icon="pencil-plus-outline" onPress={() => run('log')} style={{ flex: 1.4 }} />
        <Button title="Timer" icon="play" variant="tonal" onPress={() => run('timer')} style={{ flex: 1 }} />
      </Row>
      <MaxCard exercise={exercise} />
      {exercise.instructions ? (
        <Section title="How to">
          <T>{exercise.instructions}</T>
        </Section>
      ) : null}
      {exercise.equipment ? (
        <Section title="Equipment">
          <T>{exercise.equipment}</T>
        </Section>
      ) : null}
      <Section title="Default prescription">
        <Card>
          <T variant="heading">{formatSetsReps(exercise.defaults)}</T>
          {details ? <T tone="secondary">{details}</T> : null}
        </Card>
      </Section>

      <ExerciseCharts exercise={exercise} />

      {usedIn && usedIn.length > 0 ? (
        <Section title="Used in">
          {usedIn.map((w) => (
            <ListItem key={w.id} title={w.name} subtitle={w.focus} onPress={() => router.push(`/workout/${w.id}`)} />
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
          onPress={() => router.push({ pathname: '/exercise/edit', params: { copyOf: exercise.id } })}
        />
      </Row>
      {origin === 'edited' ? (
        <Button title="Reset to library version" icon="restore" variant="secondary" onPress={reset} />
      ) : null}
      {origin === 'custom' ? <Button title="Delete" icon="trash-can-outline" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}
