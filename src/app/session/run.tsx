// Runs a workout: guided timer first (mode=timer), then the log review.
// With mode=log it goes straight to the log. Pass exerciseId instead of
// workoutId to time or log one exercise on its own.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';

import { LogForm } from '@/components/log-form';
import { Player } from '@/components/player';
import { Button, Chip, Field, Loading, NumberField, Row, Screen, Section, T } from '@/components/ui';
import { getExercise, getSettings, getWorkout, latestMaxes, nowLocal, saveSessionLog } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useExercises } from '@/hooks/data';
import { formatDay, today } from '@/lib/dates';
import { buildDraft, draftEstimateSec, draftToSetLogs, singleExerciseWorkout, type DraftItem } from '@/lib/draft';
import { applyMaxes } from '@/lib/maxtest';

export default function RunSessionScreen() {
  const params = useLocalSearchParams<{
    workoutId?: string;
    exerciseId?: string;
    planSessionId?: string;
    date?: string;
    mode?: string;
  }>();
  const db = useSQLiteContext();
  const { data: storedWorkout } = useQuery(
    async (d) => {
      if (params.workoutId) return getWorkout(d, params.workoutId);
      const exercise = params.exerciseId ? await getExercise(d, params.exerciseId) : null;
      return exercise ? singleExerciseWorkout(exercise) : null;
    },
    [params.workoutId, params.exerciseId],
  );
  const { data: settings } = useQuery(getSettings);
  const { data: maxes } = useQuery(latestMaxes);
  const { byId: exercises, loading: exercisesLoading } = useExercises();

  const [phase, setPhase] = useState<'timer' | 'review'>(params.mode === 'log' ? 'review' : 'timer');
  const [startedAt] = useState(nowLocal);
  const [startMs] = useState(() => Date.now());
  /** Real seconds spent in the timer, once it finishes. */
  const [timerSec, setTimerSec] = useState<number | null>(null);
  /** Training time typed by the user, overriding the timer/estimate. */
  const [minutes, setMinutes] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState<DraftItem[] | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Weights for % of max items come from the latest tests (timer, log prefill).
  const workout =
    storedWorkout && maxes && settings
      ? { ...storedWorkout, items: applyMaxes(storedWorkout.items, exercises, maxes, settings.bodyweightKg) }
      : null;
  const ready = workout && settings && !exercisesLoading;
  const currentDraft = draft ?? (ready ? buildDraft(workout, exercises, 'all') : null);

  const confirmDiscard = () =>
    Alert.alert('Discard this log?', 'Nothing will be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);

  useEffect(() => {
    if (storedWorkout?.test) {
      router.replace({
        pathname: '/test/run',
        params: { workoutId: storedWorkout.id, planSessionId: params.planSessionId, date: params.date },
      });
    }
  }, [storedWorkout, params.planSessionId, params.date]);

  useEffect(() => {
    if (phase !== 'review') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmDiscard();
      return true;
    });
    return () => sub.remove();
  });

  if (!ready || !currentDraft) return <Loading />;

  if (phase === 'timer') {
    return (
      <Player
        workout={workout}
        exercises={exercises}
        settings={settings}
        onDiscard={() => router.back()}
        onFinish={(completed) => {
          setTimerSec((Date.now() - startMs) / 1000);
          setDraft(buildDraft(workout, exercises, completed));
          setPhase('review');
        }}
      />
    );
  }

  // Logging a past scheduled session after the fact: date it on that day.
  const pastDate = params.mode === 'log' && params.date && params.date < today() ? params.date : null;

  const defaultSec = timerSec ?? draftEstimateSec(currentDraft);
  const durationSec = minutes != null ? minutes * 60 : defaultSec;

  const save = async () => {
    if (currentDraft.length === 0) return Alert.alert('Nothing to save', 'Add at least one exercise.');
    setSaving(true);
    try {
      const id = await saveSessionLog(
        db,
        {
          workoutId: workout.id || null,
          workoutName: workout.name,
          planSessionId: params.planSessionId ?? null,
          scheduledDate: params.date ?? null,
          startedAt: pastDate ? `${pastDate}T18:00:00` : startedAt,
          completedAt: pastDate ? `${pastDate}T18:00:00` : nowLocal(),
          rpe,
          notes: notes.trim(),
          bodyweightKg: settings.bodyweightKg,
          durationSec,
        },
        draftToSetLogs(currentDraft),
      );
      router.replace(`/session/${id}`);
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', String(e));
    }
  };

  const doneSets = currentDraft.reduce((n, i) => n + i.sets.filter((s) => s.completed).length, 0);
  const totalSets = currentDraft.reduce((n, i) => n + i.sets.length, 0);

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Log: ${workout.name}`,
          headerRight: () => <Button title="Save" small onPress={save} disabled={saving} />,
        }}
      />
      <T tone="secondary">
        {pastDate ? `Logging for ${formatDay(pastDate)}. ` : ''}
        {doneSets} of {totalSets} sets done. Tap a set’s circle to mark it done, and adjust weights, reps or grades to
        what you actually did.
      </T>
      <LogForm draft={currentDraft} onChange={setDraft} unit={settings.unit} />
      <Section title="Training time">
        <Row>
          <NumberField
            label={timerSec != null ? 'From the timer' : 'Estimated from your sets'}
            integer
            suffix="min"
            value={minutes ?? Math.round(defaultSec / 60)}
            onChange={setMinutes}
          />
          <T variant="caption" tone="secondary" style={{ flex: 2 }}>
            Change it if the session was longer or shorter. It feeds the Progress charts.
          </T>
        </Row>
      </Section>
      <Section title="How hard was it? (RPE)">
        <Row style={{ flexWrap: 'wrap' }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Chip key={n} label={String(n)} selected={rpe === n} onPress={() => setRpe(rpe === n ? null : n)} />
          ))}
        </Row>
      </Section>
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Conditions, how fingers felt, beta…" />
      <Button title="Save session" icon="check" onPress={save} disabled={saving} />
      <Button title="Discard" variant="danger" onPress={confirmDiscard} />
    </Screen>
  );
}
