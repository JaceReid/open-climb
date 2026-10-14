// Full-screen modal pickers for exercises, workouts and grades.
import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { workoutOrigin } from '@/data/library';
import { useExercises, useWorkouts } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { FONT_GRADES } from '@/lib/grades';
import { CATEGORIES, CATEGORY_LABELS, type Category, type Exercise, type Workout } from '@/lib/types';

import { Chip, ChipRow, Field, IconButton, ListItem, Row, T } from './ui';

function PickerShell({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <Row style={{ padding: Spacing.lg, justifyContent: 'space-between' }}>
          <T variant="title">{title}</T>
          <IconButton name="close" label="Close" onPress={onClose} />
        </Row>
        {children}
      </View>
    </Modal>
  );
}

const ORIGIN_LABELS = { library: 'Library', edited: 'Edited', custom: 'Custom' } as const;

const matches = (q: string, ...fields: string[]) => {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some((f) => f.toLowerCase().includes(needle));
};

export function ExercisePicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
}) {
  const { exercises } = useExercises();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const filtered = exercises.filter(
    (e) => (!category || e.category === category) && matches(query, e.name, e.description),
  );
  return (
    <PickerShell visible={visible} title="Add exercise" onClose={onClose}>
      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
        <Field placeholder="Search exercises" value={query} onChangeText={setQuery} autoCorrect={false} />
        <ChipRow>
          <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
          {CATEGORIES.map((cat) => (
            <Chip key={cat} label={CATEGORY_LABELS[cat]} selected={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </ChipRow>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListItem
            title={item.name}
            subtitle={CATEGORY_LABELS[item.category]}
            chevron={false}
            onPress={() => {
              onPick(item);
              onClose();
            }}
          />
        )}
      />
    </PickerShell>
  );
}

export function WorkoutPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (w: Workout) => void;
}) {
  const { workouts } = useWorkouts();
  const [query, setQuery] = useState('');
  const filtered = workouts.filter((w) => matches(query, w.name, w.focus));
  return (
    <PickerShell visible={visible} title="Choose workout" onClose={onClose}>
      <View style={{ paddingHorizontal: Spacing.lg }}>
        <Field placeholder="Search workouts" value={query} onChangeText={setQuery} autoCorrect={false} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListItem
            title={item.name}
            subtitle={[item.focus, ORIGIN_LABELS[workoutOrigin(item)]].filter(Boolean).join(' · ')}
            chevron={false}
            onPress={() => {
              onPick(item);
              onClose();
            }}
          />
        )}
      />
    </PickerShell>
  );
}

export function GradePicker({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string | null | undefined;
  onClose: () => void;
  onPick: (grade: string | null) => void;
}) {
  const c = useTheme();
  const pick = (g: string | null) => {
    onPick(g);
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]}>
          <T variant="heading">Font grade</T>
          <View style={styles.grid}>
            {FONT_GRADES.map((g) => (
              <Pressable
                key={g}
                onPress={() => pick(g)}
                style={[
                  styles.gradeCell,
                  { borderColor: c.border, backgroundColor: value === g ? c.accent2 : c.surfaceAlt },
                ]}>
                <T variant="heading" style={{ color: value === g ? c.onAccent2 : c.text }}>
                  {g}
                </T>
              </Pressable>
            ))}
          </View>
          <Row>
            <Chip label="Clear" onPress={() => pick(null)} />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xxl * 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  sheet: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gradeCell: {
    flexBasis: '22%',
    flexGrow: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
