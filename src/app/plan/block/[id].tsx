import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { WorkoutPicker } from '@/components/pickers';
import { Button, Card, Chip, ChipRow, Field, Icon, IconButton, Loading, NumberField, Row, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { addPlanSession, copyWeekToAll, deleteBlock, deletePlanSession, getBlock, listBlockSessions, updateBlock } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useWorkouts } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { WEEKDAY_SHORT, type PlanBlock, type PlanSession, type Weekday } from '@/lib/types';

export default function BlockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const c = useTheme();
  const { data: block, loading } = useQuery((d) => getBlock(d, id), [id]);
  const { data: sessions } = useQuery((d) => listBlockSessions(d, id), [id]);
  const { byId: workouts } = useWorkouts();

  const [selectedWeek, setWeek] = useState(1);
  const [addingTo, setAddingTo] = useState<Weekday | null>(null);

  if (loading || !block) return <Loading />;
  // The block may have been shortened since the week was picked.
  const week = Math.min(selectedWeek, block.weeks);

  const copyWeek = () =>
    Alert.alert(`Copy week ${week} to all weeks?`, 'Every other week of this block is replaced with this week’s schedule.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Copy', onPress: () => copyWeekToAll(db, block.id, week) },
    ]);

  const remove = () =>
    Alert.alert('Delete block?', 'Its scheduled sessions are removed. Workouts are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteBlock(db, block.id);
          router.back();
        },
      },
    ]);

  const weekSessions = (sessions ?? []).filter((s) => s.week === week);

  return (
    <Screen>
      <Stack.Screen options={{ title: block.name }} />

      <Section title="Weekly schedule">
        {block.weeks > 1 ? (
          <ChipRow>
            {Array.from({ length: block.weeks }, (_, i) => i + 1).map((w) => {
              const n = (sessions ?? []).filter((s) => s.week === w).length;
              return <Chip key={w} label={`Week ${w}${n ? ` · ${n}` : ''}`} selected={w === week} onPress={() => setWeek(w)} />;
            })}
          </ChipRow>
        ) : null}
        {WEEKDAY_SHORT.map((label, d) => {
          const day = d as Weekday;
          const items = weekSessions.filter((s) => s.day === day);
          return (
            <Card key={label} style={{ paddingVertical: Spacing.sm }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <T variant="heading" style={{ width: 44, paddingTop: 6 }}>
                  {label}
                </T>
                <View style={{ flex: 1, gap: Spacing.xs }}>
                  {items.length === 0 ? (
                    <T tone="secondary" style={{ paddingTop: 6 }}>
                      Rest
                    </T>
                  ) : null}
                  {items.map((s) => (
                    <Row
                      key={s.id}
                      style={{ backgroundColor: c.surfaceAlt, borderRadius: Radius.sm, paddingLeft: Spacing.md, paddingVertical: 2 }}>
                      <Pressable style={{ flex: 1, paddingVertical: 4 }} onPress={() => router.push(`/workout/${s.workoutId}`)}>
                        <T numberOfLines={1}>{workouts.get(s.workoutId)?.name ?? 'Missing workout'}</T>
                      </Pressable>
                      <IconButton name="close" size={18} label="Remove" color={c.textSecondary} onPress={() => deletePlanSession(db, s.id)} />
                    </Row>
                  ))}
                </View>
                <Pressable
                  onPress={() => setAddingTo(day)}
                  accessibilityLabel={`Add workout on ${label}`}
                  hitSlop={8}
                  style={{ padding: Spacing.xs, paddingTop: 6 }}>
                  <Icon name="plus-circle-outline" color={c.accent} />
                </Pressable>
              </Row>
            </Card>
          );
        })}
        {block.weeks > 1 ? (
          <Button title={`Copy week ${week} to all weeks`} icon="content-copy" variant="secondary" onPress={copyWeek} />
        ) : null}
      </Section>

      <BlockDetails key={block.id} block={block} sessions={sessions ?? []} />

      <Button title="Delete block" variant="danger" icon="trash-can-outline" onPress={remove} />

      <WorkoutPicker
        visible={addingTo != null}
        onClose={() => setAddingTo(null)}
        onPick={(w) => addingTo != null && addPlanSession(db, block.id, week, addingTo, w.id)}
      />
    </Screen>
  );
}

function BlockDetails({ block, sessions }: { block: PlanBlock; sessions: PlanSession[] }) {
  const db = useSQLiteContext();
  const [form, setForm] = useState({ name: block.name, focus: block.focus, notes: block.notes, weeks: block.weeks });
  const [dirty, setDirty] = useState(false);

  const edit = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setDirty(true);
  };

  const saveDetails = async () => {
    const weeks = Math.max(1, Math.min(52, form.weeks || 1));
    const save = async () => {
      await updateBlock(db, { id: block.id, name: form.name.trim() || block.name, focus: form.focus, notes: form.notes, weeks });
      setForm({ ...form, weeks });
      setDirty(false);
    };
    const lost = sessions.filter((s) => s.week > weeks).length;
    if (lost > 0) {
      Alert.alert('Shorten block?', `${lost} scheduled sessions in weeks ${weeks + 1}–${block.weeks} will be removed.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Shorten', style: 'destructive', onPress: save },
      ]);
    } else {
      await save();
    }
  };

  return (
    <Section title="Block details">
      <Field label="Name" value={form.name} onChangeText={(name) => edit({ name })} />
      <Field label="Focus" value={form.focus} onChangeText={(focus) => edit({ focus })} placeholder="e.g. Max strength" />
      <Row>
        <NumberField label="Weeks" integer value={form.weeks} onChange={(weeks) => edit({ weeks: weeks ?? 1 })} />
        <View style={{ flex: 2 }} />
      </Row>
      <Field label="Notes" value={form.notes} onChangeText={(notes) => edit({ notes })} multiline />
      <Button title="Save details" icon="content-save-outline" onPress={saveDetails} disabled={!dirty} />
    </Section>
  );
}
