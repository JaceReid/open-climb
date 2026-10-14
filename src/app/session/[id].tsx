import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert } from 'react-native';

import { Badge, Button, Card, Empty, Icon, Loading, Row, Screen, Section, T } from '@/components/ui';
import { deleteSessionLog, getSessionLog } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useSettings } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { formatDay } from '@/lib/dates';
import { formatDuration, formatHours, formatWeight } from '@/lib/format';
import type { SetLog } from '@/lib/types';

function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const c = useTheme();
  const { unit } = useSettings();
  const { data, loading } = useQuery((d) => getSessionLog(d, id), [id]);

  if (loading) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <Empty icon="alert-circle-outline" title="Session not found" />
      </Screen>
    );
  }
  const { log, sets } = data;

  const groups = new Map<number, SetLog[]>();
  for (const s of sets) groups.set(s.itemIndex, [...(groups.get(s.itemIndex) ?? []), s]);

  // Sessions saved before training time was recorded fall back to the clock.
  const durationSec = log.durationSec ?? minutesBetween(log.startedAt, log.completedAt) * 60;

  const remove = () =>
    Alert.alert('Delete this session?', 'It will be removed from your history and charts.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSessionLog(db, log.id);
          router.back();
        },
      },
    ]);

  const describe = (s: SetLog) =>
    [
      s.weightKg != null ? formatWeight(s.weightKg, unit, true) : null,
      s.reps != null ? `${s.reps} reps` : null,
      s.durationSec != null ? formatDuration(s.durationSec) : null,
      s.grade,
    ]
      .filter(Boolean)
      .join(' · ') || 'Done';

  return (
    <Screen>
      <Stack.Screen options={{ title: log.workoutName }} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Badge label={formatDay(log.completedAt.slice(0, 10))} tone="accent" />
        {durationSec >= 60 ? <Badge label={formatHours(durationSec)} /> : null}
        {log.rpe ? <Badge label={`RPE ${log.rpe}`} /> : null}
      </Row>
      {log.notes ? <T>{log.notes}</T> : null}

      <Section title="Sets">
        {[...groups.values()].map((group) => (
          <Card key={group[0].itemIndex}>
            <T variant="heading">{group[0].exerciseName}</T>
            {group.map((s) => (
              <Row key={s.id} style={{ opacity: s.completed ? 1 : 0.5 }}>
                <Icon name={s.completed ? 'check-circle' : 'circle-outline'} size={18} color={s.completed ? c.success : c.textSecondary} />
                <T style={{ fontVariant: ['tabular-nums'] }}>
                  Set {s.setIndex + 1}: {s.completed ? describe(s) : s.weightKg != null ? `${describe(s)} · not completed` : 'skipped'}
                </T>
              </Row>
            ))}
          </Card>
        ))}
      </Section>

      {log.workoutId ? (
        <Button title="View workout" variant="secondary" icon="dumbbell" onPress={() => router.push(`/workout/${log.workoutId}`)} />
      ) : groups.size === 1 ? (
        <Button
          title="View exercise"
          variant="secondary"
          icon="dumbbell"
          onPress={() => router.push(`/exercise/${sets[0].exerciseId}`)}
        />
      ) : null}
      <Button title="Delete session" variant="danger" icon="trash-can-outline" onPress={remove} />
    </Screen>
  );
}
