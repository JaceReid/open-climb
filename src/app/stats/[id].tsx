// Progress charts for one exercise, opened from the Progress tab.
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { ExerciseCharts } from '@/components/exercise-charts';
import { Badge, Button, Empty, Loading, Row, Screen } from '@/components/ui';
import { getExercise } from '@/db/repo';
import { useQuery } from '@/db/store';
import { CATEGORY_LABELS, TRAINING_TYPE_LABELS } from '@/lib/types';

export default function ExerciseStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: exercise, loading } = useQuery((d) => getExercise(d, id), [id]);

  if (loading) return <Loading />;
  if (!exercise) {
    return (
      <Screen>
        <Empty icon="alert-circle-outline" title="Exercise not found" message="It may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: exercise.name }} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Badge label={TRAINING_TYPE_LABELS[exercise.type]} tone="accent2" />
        <Badge label={CATEGORY_LABELS[exercise.category]} />
      </Row>
      <ExerciseCharts exercise={exercise} showEmpty />
      <Button title="Exercise info" icon="information-outline" variant="secondary" onPress={() => router.push(`/exercise/${exercise.id}`)} />
    </Screen>
  );
}
