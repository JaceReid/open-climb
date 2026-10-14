import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { ExercisePicker } from '@/components/pickers';
import { Button, Card, Field, IconButton, ListField, Loading, NumberField, Row, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { libraryWorkout } from '@/data/library';
import { getWorkout, saveWorkout } from '@/db/repo';
import { useExercises, useMaxes, useSettings } from '@/hooks/data';
import { displayWeight, formatWeight, unitToKg } from '@/lib/format';
import { testKind, workingWeightKg } from '@/lib/maxtest';
import { newId } from '@/lib/id';
import type { Exercise, Workout, WorkoutItem } from '@/lib/types';

const blank = (): Workout => ({ id: newId('wo-'), name: '', focus: '', description: '', items: [], builtIn: false, test: false });

export default function WorkoutEditScreen() {
  const { id, copyOf } = useLocalSearchParams<{ id?: string; copyOf?: string }>();
  const db = useSQLiteContext();
  const { byId: exercises } = useExercises();
  const { unit, bodyweightKg } = useSettings();
  const maxes = useMaxes();
  const [workout, setWorkout] = useState<Workout | null>(id || copyOf ? null : blank());
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const source = id ?? copyOf;
    if (!source) return;
    getWorkout(db, source).then((w) => {
      if (!w) return setWorkout(blank());
      setWorkout(copyOf ? { ...w, id: newId('wo-'), name: `${w.name} (copy)`, builtIn: false } : w);
    });
  }, [db, id, copyOf]);

  if (!workout) return <Loading />;

  const set = (patch: Partial<Workout>) => setWorkout({ ...workout, ...patch });
  const setItem = (i: number, patch: Partial<WorkoutItem>) =>
    set({ items: workout.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, dir: -1 | 1) => {
    const items = workout.items.slice();
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    set({ items });
  };

  // What a % of max prescription currently works out to.
  const maxHint = (pct: number, exercise: Exercise) => {
    const max = maxes.get(exercise.id);
    const kg = max ? workingWeightKg(max, pct, exercise.bodyweight, bodyweightKg) : null;
    return kg != null
      ? `${pct}% of your max = ${formatWeight(kg, unit, exercise.bodyweight)}. It updates when you retest; the weight above is only used until there's a max.`
      : `No max yet for ${exercise.name}: test it from its page. Until then the weight above is used.`;
  };

  const save = async () => {
    if (!workout.name.trim()) return Alert.alert('Name required', 'Give the workout a name.');
    if (workout.items.length === 0) return Alert.alert('No exercises', 'Add at least one exercise.');
    await saveWorkout(db, { ...workout, name: workout.name.trim() });
    if (id) router.back();
    else router.replace(`/workout/${workout.id}`);
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: id ? 'Edit workout' : 'New workout',
          headerRight: () => <Button title="Save" small onPress={save} />,
        }}
      />
      {id && libraryWorkout(id) ? (
        <T variant="caption" tone="secondary">
          This is a library workout. Your changes replace it on this device, and you can reset it to the original
          from its page.
        </T>
      ) : null}
      <Field label="Name" value={workout.name} onChangeText={(name) => set({ name })} placeholder="e.g. Max Hangs + Pulls" />
      <Field label="Focus" value={workout.focus} onChangeText={(focus) => set({ focus })} placeholder="e.g. Finger strength" />
      <Field
        label="Description"
        value={workout.description}
        onChangeText={(description) => set({ description })}
        multiline
      />

      <Section title="Exercises">
        {workout.items.map((item, i) => {
          const exercise = exercises.get(item.exerciseId);
          return (
            <Card key={`${item.exerciseId}-${i}`}>
              <Row>
                <T variant="heading" style={{ flex: 1 }}>
                  {i + 1}. {exercise?.name ?? 'Unknown exercise'}
                </T>
                <IconButton name="arrow-up" label="Move up" onPress={() => move(i, -1)} disabled={i === 0} />
                <IconButton
                  name="arrow-down"
                  label="Move down"
                  onPress={() => move(i, 1)}
                  disabled={i === workout.items.length - 1}
                />
                <IconButton
                  name="trash-can-outline"
                  label="Remove"
                  onPress={() => set({ items: workout.items.filter((_, j) => j !== i) })}
                />
              </Row>
              <Row style={{ alignItems: 'flex-start' }}>
                <NumberField label="Sets" integer value={item.sets} onChange={(v) => setItem(i, { sets: v ?? 1 })} />
                <NumberField label="Reps" integer value={item.reps} onChange={(v) => setItem(i, { reps: v ?? 1 })} />
                <NumberField label="Work" suffix="s" value={item.workSec} onChange={(v) => setItem(i, { workSec: v || undefined })} placeholder="–" />
              </Row>
              <Row style={{ alignItems: 'flex-start' }}>
                <NumberField label="Rep rest" suffix="s" value={item.restSec} onChange={(v) => setItem(i, { restSec: v })} placeholder="–" />
                <NumberField label="Set rest" suffix="s" value={item.setRestSec} onChange={(v) => setItem(i, { setRestSec: v })} placeholder="–" />
              </Row>
              <Row style={{ alignItems: 'flex-start' }}>
                <NumberField
                  label={exercise?.bodyweight ? 'Added weight' : 'Weight'}
                  suffix={unit}
                  allowNegative
                  value={item.weightKg != null ? displayWeight(item.weightKg, unit) : undefined}
                  onChange={(v) => setItem(i, { weightKg: v == null ? undefined : unitToKg(v, unit) })}
                  placeholder="–"
                />
                {exercise && testKind(exercise) ? (
                  <NumberField
                    label="% of max"
                    suffix="%"
                    integer
                    value={item.pctOfMax}
                    onChange={(v) => setItem(i, { pctOfMax: v || undefined })}
                    placeholder="–"
                  />
                ) : null}
                <NumberField label="Edge" suffix="mm" value={item.edgeMm} onChange={(v) => setItem(i, { edgeMm: v })} placeholder="–" />
              </Row>
              {item.pctOfMax != null && exercise ? (
                <T variant="caption" tone="secondary">
                  {maxHint(item.pctOfMax, exercise)}
                </T>
              ) : null}
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Field label="Intensity" value={item.intensity ?? ''} onChangeText={(t) => setItem(i, { intensity: t || undefined })} placeholder="RPE 8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Grip" value={item.grip ?? ''} onChangeText={(t) => setItem(i, { grip: t || undefined })} placeholder="half crimp" />
                </View>
              </Row>
              <ListField
                label="Set labels"
                value={item.setLabels}
                onChange={(setLabels) => setItem(i, { setLabels })}
                placeholder="e.g. half crimp, front three, open hand"
                hint="One per set, shown in the timer and log; repeats if there are more sets than labels."
              />
              <Field label="Notes" value={item.notes ?? ''} onChangeText={(t) => setItem(i, { notes: t || undefined })} />
            </Card>
          );
        })}
        <Button title="Add exercise" icon="plus" variant="tonal" onPress={() => setPicking(true)} />
        <T variant="caption" tone="secondary" style={{ marginTop: Spacing.xs }}>
          Set “Work” for timed efforts like hangs (the timer counts them down). Leave it empty for normal reps; the timer
          then waits for you to tap Done.
        </T>
      </Section>

      <Button title="Save workout" icon="content-save-outline" onPress={save} />

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(e) => set({ items: [...workout.items, { exerciseId: e.id, ...e.defaults }] })}
      />
    </Screen>
  );
}
