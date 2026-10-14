// Current max and working weights for a testable exercise, with a way to (re)test.
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { deleteMaxTest, maxTestsFor } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useSettings } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { formatShort } from '@/lib/dates';
import { formatWeight } from '@/lib/format';
import { maxTotalKg, testKind, workingWeightKg } from '@/lib/maxtest';
import type { Exercise, MaxTest } from '@/lib/types';

import { Button, Card, IconButton, Row, Section, T } from './ui';

const OTHER_PCTS = [70, 75, 85, 90];

export function MaxCard({ exercise }: { exercise: Exercise }) {
  const db = useSQLiteContext();
  const c = useTheme();
  const { unit, bodyweightKg, workingPct } = useSettings();
  const { data: history } = useQuery((d) => maxTestsFor(d, exercise.id), [exercise.id]);
  const kind = testKind(exercise);
  if (!kind || !history) return null;

  const test = () => router.push({ pathname: '/test/run', params: { exerciseId: exercise.id } });
  const signed = (kg: number) => formatWeight(kg, unit, exercise.bodyweight);
  const latest = history[0];

  if (!latest) {
    return (
      <Section title="Max & working weight">
        <Card>
          <T>Test your max to get working weights: {workingPct}% of it fills in automatically wherever a workout uses % of max.</T>
          <Button title="Test max" icon="flag-checkered" variant="tonal" onPress={test} />
        </Card>
      </Section>
    );
  }

  const working = workingWeightKg(latest, workingPct, exercise.bodyweight, bodyweightKg);
  const total = maxTotalKg(latest, exercise.bodyweight);
  const describe = (t: MaxTest) =>
    t.kind === 'hold'
      ? `${t.holdSec} s ${exercise.category === 'fingerboard' && exercise.bodyweight ? 'hang' : 'hold'}`
      : t.reps && t.reps > 1
        ? `est. from ${t.reps} reps at ${signed(t.weightKg)}`
        : '1 rep max';

  const remove = (t: MaxTest) =>
    Alert.alert('Delete this test?', 'Your working weights will use the previous test, if there is one.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMaxTest(db, t.id) },
    ]);

  return (
    <Section title="Max & working weight">
      <Card>
        <Row style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="caption" tone="secondary">
              Max · {describe(latest)} · {formatShort(latest.testedAt.slice(0, 10))}
            </T>
            <T variant="title">{signed(latest.maxKg)}</T>
            {exercise.bodyweight && total && latest.bodyweightKg ? (
              <T variant="caption" tone="secondary">
                Total {formatWeight(total, unit)} · {Math.round((total / latest.bodyweightKg) * 100)}% bodyweight
              </T>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="caption" tone="secondary">
              Working ({workingPct}%)
            </T>
            <T variant="title" tone="accent">
              {working != null ? signed(working) : '–'}
            </T>
          </View>
        </Row>
        {working != null ? (
          <Row style={{ flexWrap: 'wrap', borderTopWidth: 1, borderColor: c.grid, paddingTop: Spacing.sm }}>
            {OTHER_PCTS.map((p) => {
              const kg = workingWeightKg(latest, p, exercise.bodyweight, bodyweightKg);
              return kg == null ? null : (
                <T key={p} variant="caption" tone="secondary" style={{ marginRight: Spacing.md, fontVariant: ['tabular-nums'] }}>
                  {p}%: {signed(kg)}
                </T>
              );
            })}
          </Row>
        ) : (
          <T variant="caption" tone="secondary">
            Set your bodyweight in Settings to get a working weight.
          </T>
        )}
        <Button title="Retest" icon="flag-checkered" variant="tonal" onPress={test} />
      </Card>
      {history.length > 1 ? (
        <Card style={{ gap: 2 }}>
          <T variant="label" tone="secondary">
            Previous tests
          </T>
          {history.slice(1, 6).map((t) => (
            <Row key={t.id} style={{ justifyContent: 'space-between' }}>
              <T tone="secondary">{formatShort(t.testedAt.slice(0, 10))}</T>
              <T style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {signed(t.maxKg)} · {describe(t)}
              </T>
              <IconButton name="close" label="Delete test" size={16} color={c.textSecondary} onPress={() => remove(t)} />
            </Row>
          ))}
        </Card>
      ) : null}
    </Section>
  );
}
