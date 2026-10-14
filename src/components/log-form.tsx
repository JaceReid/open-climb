// Editable session log: prefilled sets per exercise with done toggles. Exercises
// can be added or removed to match what was actually done on the day.
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDraftExercise, type DraftItem, type DraftSet } from '@/lib/draft';
import { displayWeight, unitToKg } from '@/lib/format';
import type { Settings } from '@/lib/types';

import { ExercisePicker, GradePicker } from './pickers';
import { Button, Card, Icon, IconButton, NumberInput, Row, T } from './ui';

export function LogForm({
  draft,
  onChange,
  unit,
}: {
  draft: DraftItem[];
  onChange: (draft: DraftItem[]) => void;
  unit: Settings['unit'];
}) {
  const [gradeFor, setGradeFor] = useState<{ item: number; set: number } | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);

  const updateSet = (i: number, s: number, patch: Partial<DraftSet>) =>
    onChange(
      draft.map((item, j) =>
        j !== i ? item : { ...item, sets: item.sets.map((set, k) => (k === s ? { ...set, ...patch } : set)) },
      ),
    );
  const addSet = (i: number) =>
    onChange(
      draft.map((item, j) => {
        if (j !== i) return item;
        const last = item.sets[item.sets.length - 1];
        return { ...item, sets: [...item.sets, { ...last, completed: true }] };
      }),
    );
  const removeSet = (i: number, s: number) =>
    onChange(draft.map((item, j) => (j !== i ? item : { ...item, sets: item.sets.filter((_, k) => k !== s) })));
  const removeItem = (i: number) =>
    Alert.alert(`Remove ${draft[i].exerciseName}?`, 'Its sets won’t be saved with this session.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onChange(draft.filter((_, j) => j !== i)) },
    ]);

  const picking = gradeFor ? draft[gradeFor.item]?.sets[gradeFor.set] : undefined;

  return (
    <View style={{ gap: Spacing.md }}>
      {draft.map((item, i) => (
        <Card key={`${item.exerciseId}-${item.itemIndex}`}>
          <Row>
            <T variant="heading" style={{ flex: 1 }}>
              {item.exerciseName}
            </T>
            <IconButton name="trash-can-outline" label={`Remove ${item.exerciseName}`} size={20} onPress={() => removeItem(i)} />
          </Row>
          <Row gap={Spacing.xs} style={{ paddingLeft: 40 }}>
            {item.tracks.includes('weight') ? <ColHeader label={item.bodyweight ? `+${unit}` : unit} /> : null}
            {item.tracks.includes('reps') ? <ColHeader label="reps" /> : null}
            {item.tracks.includes('location') ? <ColHeader label="where" /> : null}
            {item.tracks.includes('discipline') ? <ColHeader label="type" /> : null}
            {item.tracks.includes('duration') ? <ColHeader label={item.durationUnit} /> : null}
            {item.tracks.includes('grade') ? <ColHeader label="grade" /> : null}
          </Row>
          {item.sets.map((set, s) => (
            <SetRow
              key={s}
              index={s}
              set={set}
              tracks={item.tracks}
              durationUnit={item.durationUnit}
              unit={unit}
              onChange={(patch) => updateSet(i, s, patch)}
              onRemove={item.sets.length > 1 ? () => removeSet(i, s) : undefined}
              onPickGrade={() => setGradeFor({ item: i, set: s })}
            />
          ))}
          <Button title="Add set" icon="plus" variant="ghost" small onPress={() => addSet(i)} />
        </Card>
      ))}
      <Button title="Add exercise" icon="plus" variant="tonal" onPress={() => setAddingExercise(true)} />
      <ExercisePicker visible={addingExercise} onClose={() => setAddingExercise(false)} onPick={(ex) => onChange(addDraftExercise(draft, ex))} />
      <GradePicker
        visible={!!gradeFor}
        value={picking?.grade}
        onClose={() => setGradeFor(null)}
        onPick={(grade) => gradeFor && updateSet(gradeFor.item, gradeFor.set, { grade, completed: true })}
      />
    </View>
  );
}

function ColHeader({ label }: { label: string }) {
  return (
    <T variant="caption" tone="secondary" style={{ flex: 1, textAlign: 'center' }}>
      {label}
    </T>
  );
}

function SetRow({
  index,
  set,
  tracks,
  durationUnit,
  unit,
  onChange,
  onRemove,
  onPickGrade,
}: {
  index: number;
  set: DraftSet;
  tracks: DraftItem['tracks'];
  durationUnit: DraftItem['durationUnit'];
  unit: Settings['unit'];
  onChange: (patch: Partial<DraftSet>) => void;
  onRemove?: () => void;
  onPickGrade: () => void;
}) {
  const c = useTheme();
  const inputStyle = [styles.cell, { color: c.text, backgroundColor: c.surfaceAlt }];
  const perUnit = durationUnit === 'min' ? 60 : 1;
  // Tap-to-switch cell for two-option fields (indoor/outdoor, boulder/route).
  const toggle = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={[styles.cell, styles.gradeCell, { backgroundColor: c.surfaceAlt }]} accessibilityRole="button">
      <T variant="label" numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
  return (
    <View style={{ gap: 2 }}>
      {set.label ? (
        <T variant="caption" tone="secondary" style={{ paddingLeft: 40 }}>
          Set {index + 1} · {set.label}
        </T>
      ) : null}
      <Row gap={Spacing.xs} style={{ opacity: set.completed ? 1 : 0.55 }}>
        <Pressable
          onPress={() => onChange({ completed: !set.completed })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.completed }}
          accessibilityLabel={`Set ${index + 1} done`}
          style={[styles.check, { borderColor: set.completed ? c.success : c.border, backgroundColor: set.completed ? c.success : 'transparent' }]}>
          {set.completed ? <Icon name="check" size={18} color={c.surface} /> : <T variant="label">{index + 1}</T>}
        </Pressable>
        {tracks.includes('weight') ? (
          <NumberInput
            allowNegative
            value={set.weightKg == null ? undefined : displayWeight(set.weightKg, unit)}
            onChange={(v) => onChange({ weightKg: v == null ? null : unitToKg(v, unit) })}
            placeholder="–"
            style={inputStyle}
          />
        ) : null}
        {tracks.includes('reps') ? (
          <NumberInput integer value={set.reps} onChange={(v) => onChange({ reps: v ?? null })} placeholder="–" style={inputStyle} />
        ) : null}
        {tracks.includes('location')
          ? toggle(set.location === 'outdoor' ? 'Outdoor' : 'Indoor', () =>
              onChange({ location: set.location === 'outdoor' ? 'indoor' : 'outdoor' }),
            )
          : null}
        {tracks.includes('discipline')
          ? toggle(set.discipline === 'route' ? 'Route' : 'Boulder', () =>
              onChange({ discipline: set.discipline === 'route' ? 'boulder' : 'route' }),
            )
          : null}
        {tracks.includes('duration') ? (
          <NumberInput
            value={set.durationSec == null ? undefined : Math.round((set.durationSec / perUnit) * 10) / 10}
            onChange={(v) => onChange({ durationSec: v == null ? null : v * perUnit })}
            placeholder="–"
            style={inputStyle}
          />
        ) : null}
        {tracks.includes('grade') ? (
          <Pressable onPress={onPickGrade} style={[styles.cell, styles.gradeCell, { backgroundColor: c.surfaceAlt }]}>
            <T variant="heading">{set.grade ?? '–'}</T>
          </Pressable>
        ) : null}
        {tracks.length === 0 ? (
          <T tone="secondary" style={{ flex: 1 }}>
            Set {index + 1}
          </T>
        ) : null}
        {onRemove ? <IconButton name="close" label="Remove set" size={18} color={c.textSecondary} onPress={onRemove} /> : <View style={{ width: 26 }} />}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell: {
    flex: 1,
    minWidth: 0,
    borderRadius: Radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 6,
    fontSize: 16,
    textAlign: 'center',
  },
  gradeCell: { alignItems: 'center', justifyContent: 'center' },
});
