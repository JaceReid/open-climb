import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Switch } from 'react-native';

import { Button, Card, Chip, Field, ListField, Loading, NumberField, Row, Screen, Section, T } from '@/components/ui';
import { libraryExercise } from '@/data/library';
import { getExercise, saveExercise } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { newId } from '@/lib/id';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  TRACK_FIELDS,
  TRACK_LABELS,
  TRAINING_TYPE_LABELS,
  TRAINING_TYPES,
  defaultTrainingType,
  type Exercise,
  type Prescription,
} from '@/lib/types';

const blank = (): Exercise => ({
  id: newId('ex-'),
  name: '',
  category: 'fingerboard',
  type: 'finger-strength',
  description: '',
  instructions: '',
  equipment: '',
  tracks: ['weight', 'reps'],
  bodyweight: false,
  defaults: { sets: 3, reps: 5, setRestSec: 120 },
  builtIn: false,
});

export default function ExerciseEditScreen() {
  const { id, copyOf } = useLocalSearchParams<{ id?: string; copyOf?: string }>();
  const db = useSQLiteContext();
  const c = useTheme();
  const [exercise, setExercise] = useState<Exercise | null>(id || copyOf ? null : blank());
  // For a new exercise the training type follows the category until picked by hand.
  const [typeChosen, setTypeChosen] = useState(!!(id || copyOf));

  useEffect(() => {
    const source = id ?? copyOf;
    if (!source) return;
    getExercise(db, source).then((e) => {
      if (!e) return setExercise(blank());
      setExercise(copyOf ? { ...e, id: newId('ex-'), name: `${e.name} (copy)`, builtIn: false } : e);
    });
  }, [db, id, copyOf]);

  if (!exercise) return <Loading />;

  const set = (patch: Partial<Exercise>) => setExercise({ ...exercise, ...patch });
  const setDefaults = (patch: Partial<Prescription>) => set({ defaults: { ...exercise.defaults, ...patch } });

  const save = async () => {
    if (!exercise.name.trim()) return Alert.alert('Name required', 'Give the exercise a name.');
    await saveExercise(db, { ...exercise, name: exercise.name.trim() });
    if (id) router.back();
    else router.replace(`/exercise/${exercise.id}`);
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: id ? 'Edit exercise' : 'New exercise',
          headerRight: () => <Button title="Save" small onPress={save} />,
        }}
      />
      {id && libraryExercise(id) ? (
        <T variant="caption" tone="secondary">
          This is a library exercise. Your changes replace it on this device, and you can reset it to the original
          from its page.
        </T>
      ) : null}
      <Field label="Name" value={exercise.name} onChangeText={(name) => set({ name })} placeholder="e.g. Sloper hangs" />

      <Section title="Category">
        <Row style={{ flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={CATEGORY_LABELS[cat]}
              selected={exercise.category === cat}
              onPress={() => set(typeChosen ? { category: cat } : { category: cat, type: defaultTrainingType(cat) })}
            />
          ))}
        </Row>
      </Section>

      <Section title="Training type">
        <Row style={{ flexWrap: 'wrap' }}>
          {TRAINING_TYPES.map((t) => (
            <Chip
              key={t}
              label={TRAINING_TYPE_LABELS[t]}
              selected={exercise.type === t}
              onPress={() => {
                setTypeChosen(true);
                set({ type: t });
              }}
            />
          ))}
        </Row>
        <T variant="caption" tone="secondary">
          What this exercise trains. Used for the training mix chart on the Progress tab.
        </T>
      </Section>

      <Section title="What to log each set">
        <Row style={{ flexWrap: 'wrap' }}>
          {TRACK_FIELDS.map((t) => {
            const on = exercise.tracks.includes(t);
            return (
              <Chip
                key={t}
                label={TRACK_LABELS[t]}
                selected={on}
                onPress={() => set({ tracks: on ? exercise.tracks.filter((x) => x !== t) : [...exercise.tracks, t] })}
              />
            );
          })}
        </Row>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T style={{ flex: 1 }}>Weight is added to bodyweight (hangs, pull-ups, dips)</T>
            <Switch
              value={exercise.bodyweight}
              onValueChange={(bodyweight) => set({ bodyweight })}
              trackColor={{ true: c.accent }}
              thumbColor="#FFFFFF"
            />
          </Row>
        </Card>
      </Section>

      <Field label="Description" value={exercise.description} onChangeText={(description) => set({ description })} multiline />
      <Field label="How to do it" value={exercise.instructions} onChangeText={(instructions) => set({ instructions })} multiline />
      <Field label="Equipment" value={exercise.equipment} onChangeText={(equipment) => set({ equipment })} />

      <Section title="Defaults when added to a workout">
        <T variant="caption" tone="secondary">
          Workouts that already use this exercise keep their own sets and reps.
        </T>
        <Row style={{ alignItems: 'flex-start' }}>
          <NumberField label="Sets" integer value={exercise.defaults.sets} onChange={(v) => setDefaults({ sets: v ?? 1 })} />
          <NumberField label="Reps" integer value={exercise.defaults.reps} onChange={(v) => setDefaults({ reps: v ?? 1 })} />
          <NumberField label="Work" suffix="s" value={exercise.defaults.workSec} onChange={(v) => setDefaults({ workSec: v || undefined })} placeholder="–" />
        </Row>
        <Row style={{ alignItems: 'flex-start' }}>
          <NumberField label="Rep rest" suffix="s" value={exercise.defaults.restSec} onChange={(v) => setDefaults({ restSec: v })} placeholder="–" />
          <NumberField label="Set rest" suffix="s" value={exercise.defaults.setRestSec} onChange={(v) => setDefaults({ setRestSec: v })} placeholder="–" />
          <NumberField label="Edge" suffix="mm" value={exercise.defaults.edgeMm} onChange={(v) => setDefaults({ edgeMm: v })} placeholder="–" />
        </Row>
        <ListField
          label="Set labels"
          value={exercise.defaults.setLabels}
          onChange={(setLabels) => setDefaults({ setLabels })}
          placeholder="e.g. half crimp, front three, open hand"
          hint="One per set (e.g. the grip), shown in the timer and log."
        />
      </Section>

      <Button title="Save exercise" icon="content-save-outline" onPress={save} />
    </Screen>
  );
}
