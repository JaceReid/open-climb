import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipRow, Field, ListItem, Screen, Segmented, T } from '@/components/ui';
import { OriginBadge } from '@/components/workout-bits';
import { Spacing } from '@/constants/theme';
import { exerciseOrigin, workoutOrigin } from '@/data/library';
import { useExercises, useWorkouts } from '@/hooks/data';
import { formatEstimate, plural } from '@/lib/format';
import { estimateWorkoutSec } from '@/lib/timer';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@/lib/types';

type Tab = 'workouts' | 'exercises';

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>('workouts');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const { exercises } = useExercises();
  const { workouts } = useWorkouts();

  const q = query.trim().toLowerCase();
  const visibleExercises = exercises.filter(
    (e) => (!category || e.category === category) && (!q || e.name.toLowerCase().includes(q)),
  );
  const visibleWorkouts = workouts.filter(
    (w) => !q || w.name.toLowerCase().includes(q) || w.focus.toLowerCase().includes(q),
  );

  return (
    <Screen title="Library">
      <Segmented
        options={[
          { value: 'workouts', label: `Workouts (${workouts.length})` },
          { value: 'exercises', label: `Exercises (${exercises.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Field placeholder={`Search ${tab}`} value={query} onChangeText={setQuery} autoCorrect={false} />
      <T variant="caption" tone="secondary">
        Tap to open, long-press to edit. Library items can be edited too, and reset later.
      </T>

      {tab === 'workouts' ? (
        <View style={{ gap: Spacing.sm }}>
          <Button title="New workout" icon="plus" variant="tonal" onPress={() => router.push('/workout/edit')} />
          {visibleWorkouts.map((w) => (
            <ListItem
              key={w.id}
              title={w.name}
              subtitle={[w.focus, plural(w.items.length, 'exercise'), formatEstimate(estimateWorkoutSec(w.items))]
                .filter(Boolean)
                .join(' · ')}
              right={<OriginBadge origin={workoutOrigin(w)} quiet />}
              onPress={() => router.push(`/workout/${w.id}`)}
              onLongPress={() => router.push({ pathname: '/workout/edit', params: { id: w.id } })}
            />
          ))}
        </View>
      ) : (
        <View style={{ gap: Spacing.sm }}>
          <ChipRow>
            <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={CATEGORY_LABELS[cat]}
                selected={category === cat}
                onPress={() => setCategory(category === cat ? null : cat)}
              />
            ))}
          </ChipRow>
          <Button title="New exercise" icon="plus" variant="tonal" onPress={() => router.push('/exercise/edit')} />
          {visibleExercises.map((e) => (
            <ListItem
              key={e.id}
              title={e.name}
              subtitle={CATEGORY_LABELS[e.category]}
              right={<OriginBadge origin={exerciseOrigin(e)} quiet />}
              onPress={() => router.push(`/exercise/${e.id}`)}
              onLongPress={() => router.push({ pathname: '/exercise/edit', params: { id: e.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
