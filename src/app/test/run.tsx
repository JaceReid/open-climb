// Max test flow: for each testable exercise (one from an exercise page, or the
// weighted items of a test workout), log attempts with a hold/rest timer, then
// save the maxes that drive working weights.
import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { useCues } from '@/components/player';
import { Badge, Button, Card, Chip, Icon, IconButton, Loading, NumberField, Row, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { getExercise, getSettings, getWorkout, latestMaxes, nowLocal, saveTestSession, setSetting, type NewSetLog } from '@/db/repo';
import { useQuery } from '@/db/store';
import { useExercises } from '@/hooks/data';
import { useTheme } from '@/hooks/use-theme';
import { displayWeight, formatClock, formatWeight, unitToKg } from '@/lib/format';
import {
  DEFAULT_HOLD_SEC,
  TEST_REST_SEC,
  maxTotalKg,
  roundKg,
  testKind,
  testResult,
  workingWeightKg,
  type Attempt,
  type TestKind,
} from '@/lib/maxtest';
import type { Exercise, MaxTest, Settings } from '@/lib/types';

interface TestState {
  holdSec: number;
  reps: number;
  attempts: Attempt[];
  /** Weight for the next attempt, in kg. */
  nextKg: number;
}

type Phase = 'idle' | 'prep' | 'hold' | 'confirm' | 'rest';
const PREP_SEC = 3;

export default function MaxTestScreen() {
  const params = useLocalSearchParams<{ exerciseId?: string; workoutId?: string; planSessionId?: string; date?: string }>();
  const { byId: exercises, loading: exLoading } = useExercises();
  const { data: settings } = useQuery(getSettings);
  const { data: maxes } = useQuery(latestMaxes);
  const { data: source } = useQuery(
    async (d) => {
      if (params.workoutId) return { workout: await getWorkout(d, params.workoutId), exercise: null };
      return { workout: null, exercise: params.exerciseId ? await getExercise(d, params.exerciseId) : null };
    },
    [params.workoutId, params.exerciseId],
  );

  if (!settings || !maxes || !source || exLoading) return <Loading />;

  // The testable exercises, keeping their position in the workout for the log.
  const tests: { exercise: Exercise; kind: TestKind; itemIndex: number }[] = [];
  const warmup: string[] = [];
  if (source.workout) {
    source.workout.items.forEach((item, itemIndex) => {
      const ex = exercises.get(item.exerciseId);
      const kind = ex ? testKind(ex) : null;
      if (ex && kind && !tests.some((t) => t.exercise.id === ex.id)) tests.push({ exercise: ex, kind, itemIndex });
      else if (ex) warmup.push(ex.name);
    });
  } else if (source.exercise) {
    const kind = testKind(source.exercise);
    if (kind) tests.push({ exercise: source.exercise, kind, itemIndex: 0 });
  }

  if (tests.length === 0) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Max test' }} />
        <T>Nothing to test here: max tests need an exercise that logs weight (hangs, edge lifts, weighted pull-ups, lifts).</T>
      </Screen>
    );
  }

  return (
    <TestFlow
      key={tests.map((t) => t.exercise.id).join()}
      tests={tests}
      warmup={warmup}
      settings={settings}
      maxes={maxes}
      workout={source.workout}
      planSessionId={params.planSessionId ?? null}
      date={params.date ?? null}
      onSaved={(sessionId) => (source.workout ? router.replace(`/session/${sessionId}`) : router.back())}
    />
  );
}

function TestFlow({
  tests,
  warmup,
  settings,
  maxes,
  workout,
  planSessionId,
  date,
  onSaved,
}: {
  tests: { exercise: Exercise; kind: TestKind; itemIndex: number }[];
  warmup: string[];
  settings: Settings;
  maxes: Map<string, MaxTest>;
  workout: { id: string; name: string } | null;
  planSessionId: string | null;
  date: string | null;
  onSaved: (sessionId: string) => void;
}) {
  useKeepAwake();
  const db = useSQLiteContext();
  const c = useTheme();
  const cues = useCues(settings);
  const { unit } = settings;
  const [startMs] = useState(() => Date.now());
  const [startedAt] = useState(nowLocal);
  const [index, setIndex] = useState(0);
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(settings.bodyweightKg);
  const [states, setStates] = useState<Record<string, TestState>>(() =>
    Object.fromEntries(
      tests.map(({ exercise }) => {
        const prev = maxes.get(exercise.id);
        // Start at ~90% of the last max (of total load for bodyweight exercises).
        const start = prev
          ? (workingWeightKg(prev, 90, exercise.bodyweight, settings.bodyweightKg) ?? roundKg(prev.weightKg * 0.9))
          : (exercise.defaults.weightKg ?? 0);
        return [exercise.id, { holdSec: prev?.holdSec ?? DEFAULT_HOLD_SEC, reps: prev?.reps ?? 1, attempts: [], nextKg: start }];
      }),
    ),
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);

  const { exercise, kind } = tests[index];
  const state = states[exercise.id];
  const update = (patch: Partial<TestState>) => setStates({ ...states, [exercise.id]: { ...state, ...patch } });
  const needsBodyweight = tests.some((t) => t.exercise.bodyweight);
  const attemptsLogged = Object.values(states).some((s) => s.attempts.length > 0);

  // Countdown clock: prep -> hold -> confirm, and rest -> idle. Transitions happen
  // in the interval callback; the effect below only plays countdown beeps.
  useEffect(() => {
    if (phase === 'idle' || phase === 'confirm') return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t < endsAt) return;
      if (phase === 'prep') {
        cues.go();
        setPhase('hold');
        setEndsAt(t + state.holdSec * 1000);
      } else if (phase === 'hold') {
        cues.rest();
        setPhase('confirm');
      } else {
        cues.go();
        cues.say('Rest over');
        setPhase('idle');
      }
    }, 200);
    return () => clearInterval(id);
    // Recreated whenever the phase or its end time changes, so the closure is fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, endsAt]);
  const remaining = Math.max(0, (endsAt - now) / 1000);
  const remSec = Math.ceil(remaining);
  useEffect(() => {
    // 3-2-1 before the hold starts and before rest ends (not at the very start of a short countdown).
    const length = phase === 'prep' ? PREP_SEC : phase === 'rest' ? TEST_REST_SEC : 0;
    if (remSec <= 3 && remSec >= 1 && remSec < length) cues.tick();
    // Cues only on whole-second changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remSec, phase]);

  const record = (success: boolean) => {
    const attempts = [...state.attempts, { weightKg: state.nextKg, success }];
    // Suggest the next load: up 2.5 kg after a make, same again after a miss.
    update({ attempts, nextKg: success ? state.nextKg + 2.5 : state.nextKg });
    setPhase('rest');
    setEndsAt(Date.now() + TEST_REST_SEC * 1000);
    setNow(Date.now());
  };

  const startHold = () => {
    cues.say('Get ready');
    setPhase('prep');
    setEndsAt(Date.now() + PREP_SEC * 1000);
    setNow(Date.now());
  };

  const result = testResult(state.attempts, kind, state.reps, exercise.bodyweight, bodyweightKg);

  const confirmLeave = () => {
    if (!attemptsLogged) return router.back();
    Alert.alert('Discard this test?', 'Your attempts won’t be saved.', [
      { text: 'Keep testing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave();
      return true;
    });
    return () => sub.remove();
  });

  const save = async () => {
    if (needsBodyweight && !bodyweightKg) {
      return Alert.alert('Bodyweight needed', 'Hangs and pull-ups are tested on total load, so enter your bodyweight first.');
    }
    setSaving(true);
    try {
      const sets: NewSetLog[] = tests.flatMap((t) => {
        const s = states[t.exercise.id];
        return s.attempts.map((a, setIndex) => ({
          exerciseId: t.exercise.id,
          exerciseName: t.exercise.name,
          itemIndex: t.itemIndex,
          setIndex,
          weightKg: a.weightKg,
          reps: t.kind === 'reps' ? s.reps : null,
          durationSec: t.kind === 'hold' ? s.holdSec : null,
          grade: null,
          completed: a.success,
          notes: '',
          estSec: (t.kind === 'hold' ? s.holdSec : 30) + TEST_REST_SEC,
          location: null,
          discipline: null,
        }));
      });
      const results = tests.flatMap((t) => {
        const s = states[t.exercise.id];
        const r = testResult(s.attempts, t.kind, s.reps, t.exercise.bodyweight, bodyweightKg);
        if (!r) return [];
        return [
          {
            exerciseId: t.exercise.id,
            kind: t.kind,
            holdSec: t.kind === 'hold' ? s.holdSec : null,
            reps: t.kind === 'reps' ? s.reps : null,
            weightKg: r.weightKg,
            maxKg: r.maxKg,
            bodyweightKg: t.exercise.bodyweight ? bodyweightKg : null,
          },
        ];
      });
      if (bodyweightKg != null && bodyweightKg !== settings.bodyweightKg) await setSetting(db, 'bodyweightKg', bodyweightKg);
      const estimated = sets.reduce((n, s) => n + (s.estSec ?? 0), 0);
      const sessionId = await saveTestSession(
        db,
        {
          workoutId: workout?.id ?? null,
          workoutName: workout?.name ?? `Max test: ${exercise.name}`,
          planSessionId,
          scheduledDate: date,
          startedAt,
          completedAt: nowLocal(),
          rpe: null,
          notes: '',
          bodyweightKg,
          durationSec: Math.max((Date.now() - startMs) / 1000, estimated),
        },
        sets,
        results,
      );
      onSaved(sessionId);
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', String(e));
    }
  };

  const signed = (kg: number) => formatWeight(kg, unit, exercise.bodyweight);
  const timerColor = { idle: c.surfaceAlt, prep: c.prep, hold: c.work, confirm: c.surfaceAlt, rest: c.setRest }[phase];
  const working = result
    ? workingWeightKg({ maxKg: result.maxKg, bodyweightKg }, settings.workingPct, exercise.bodyweight, bodyweightKg)
    : null;
  const total = result ? maxTotalKg({ maxKg: result.maxKg, bodyweightKg }, exercise.bodyweight) : null;
  const previous = maxes.get(exercise.id);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: tests.length > 1 ? `Max test ${index + 1} of ${tests.length}` : 'Max test',
          headerLeft: () => <IconButton name="close" label="Close" onPress={confirmLeave} />,
        }}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        <T variant="title" style={{ flexShrink: 1 }}>
          {exercise.name}
        </T>
        {previous ? <Badge label={`Last max ${signed(previous.maxKg)}`} /> : <Badge label="First test" tone="accent2" />}
      </Row>
      {index === 0 && warmup.length ? (
        <T tone="secondary">Warm up first: {warmup.join(', ')}.</T>
      ) : null}

      <Card>
        {kind === 'hold' ? (
          <>
            <T>
              Find the heaviest load you can hold for the full time. Add weight each attempt, rest {TEST_REST_SEC / 60} min
              between, and stop when an attempt isn&apos;t clean.
            </T>
            <Row>
              <NumberField label="Hold" suffix="s" integer value={state.holdSec} onChange={(v) => update({ holdSec: Math.max(1, v ?? DEFAULT_HOLD_SEC) })} />
              {needsBodyweight ? (
                <NumberField
                  label="Bodyweight"
                  suffix={unit}
                  value={bodyweightKg != null ? displayWeight(bodyweightKg, unit) : undefined}
                  onChange={(v) => setBodyweightKg(v == null ? null : unitToKg(v, unit))}
                  placeholder="–"
                />
              ) : null}
            </Row>
          </>
        ) : (
          <>
            <T>
              Work up to the heaviest set you can do for the chosen reps, resting {TEST_REST_SEC / 60} min between attempts.
              With more than 1 rep, your 1-rep max is estimated.
            </T>
            <Row style={{ flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} label={n === 1 ? '1 rep' : `${n} reps`} selected={state.reps === n} onPress={() => update({ reps: n })} />
              ))}
            </Row>
            {needsBodyweight ? (
              <Row>
                <NumberField
                  label="Bodyweight"
                  suffix={unit}
                  value={bodyweightKg != null ? displayWeight(bodyweightKg, unit) : undefined}
                  onChange={(v) => setBodyweightKg(v == null ? null : unitToKg(v, unit))}
                  placeholder="–"
                />
                <View style={{ flex: 1 }} />
              </Row>
            ) : null}
          </>
        )}
      </Card>

      <View style={[styles.timer, { backgroundColor: timerColor }]}>
        {phase === 'idle' ? (
          <>
            <Row style={{ alignItems: 'flex-end' }}>
              <NumberField
                label={`Attempt ${state.attempts.length + 1}${exercise.bodyweight ? ' · added weight' : ''}`}
                suffix={unit}
                allowNegative={exercise.bodyweight}
                value={displayWeight(state.nextKg, unit)}
                onChange={(v) => update({ nextKg: v == null ? 0 : unitToKg(v, unit) })}
              />
            </Row>
            {kind === 'hold' ? (
              <Button title={`Start ${state.holdSec} s ${exercise.category === 'fingerboard' && exercise.bodyweight ? 'hang' : 'hold'}`} icon="play" onPress={startHold} />
            ) : (
              <Row>
                <Button title={`Made ${state.reps}`} icon="check" onPress={() => record(true)} style={{ flex: 1 }} />
                <Button title="Missed" icon="close" variant="secondary" onPress={() => record(false)} style={{ flex: 1 }} />
              </Row>
            )}
          </>
        ) : phase === 'confirm' ? (
          <>
            <T variant="heading">Did you hold {signed(state.nextKg)} for {state.holdSec} s?</T>
            <Row>
              <Button title="Made it" icon="check" onPress={() => record(true)} style={{ flex: 1 }} />
              <Button title="Missed" icon="close" variant="secondary" onPress={() => record(false)} style={{ flex: 1 }} />
            </Row>
          </>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <T style={styles.timerLabel}>{phase === 'prep' ? 'GET READY' : phase === 'hold' ? 'HOLD' : 'REST'}</T>
            <T style={styles.timerClock}>{formatClock(remaining)}</T>
            {phase === 'rest' ? (
              <>
                <T style={styles.timerSub}>Next attempt: {signed(state.nextKg)}</T>
                <Pressable onPress={() => setPhase('idle')} style={styles.skip}>
                  <T style={styles.timerSub}>Skip rest</T>
                </Pressable>
              </>
            ) : null}
          </View>
        )}
      </View>

      {state.attempts.length ? (
        <Section title="Attempts">
          {state.attempts.map((a, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <Pressable
                onPress={() =>
                  update({ attempts: state.attempts.map((x, j) => (j === i ? { ...x, success: !x.success } : x)) })
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: a.success }}>
                <Row>
                  <Icon name={a.success ? 'check-circle' : 'close-circle-outline'} color={a.success ? c.success : c.danger} />
                  <T style={{ fontVariant: ['tabular-nums'] }}>
                    {i + 1}. {signed(a.weightKg)}
                    {kind === 'reps' ? ` × ${state.reps}` : ` · ${state.holdSec} s`}
                  </T>
                </Row>
              </Pressable>
              <IconButton
                name="close"
                label="Remove attempt"
                size={18}
                color={c.textSecondary}
                onPress={() => update({ attempts: state.attempts.filter((_, j) => j !== i) })}
              />
            </Row>
          ))}
          <T variant="caption" tone="secondary">
            Tap an attempt to switch made/missed.
          </T>
        </Section>
      ) : null}

      {result ? (
        <Card accent>
          <T variant="label" tone="secondary">
            RESULT
          </T>
          <T variant="title">
            {kind === 'reps' && state.reps > 1 ? 'Est. 1RM ' : 'Max '}
            {signed(result.maxKg)}
          </T>
          <T tone="secondary">
            {kind === 'reps' && state.reps > 1 ? `From ${state.reps} reps at ${signed(result.weightKg)}. ` : ''}
            {exercise.bodyweight && total && bodyweightKg
              ? `Total ${formatWeight(total, unit)} · ${Math.round((total / bodyweightKg) * 100)}% bodyweight`
              : ''}
          </T>
          {working != null ? (
            <T variant="heading">
              Working weight ({settings.workingPct}%): {signed(working)}
            </T>
          ) : (
            <T tone="secondary">Enter your bodyweight to get a working weight.</T>
          )}
        </Card>
      ) : null}

      {index < tests.length - 1 ? (
        <Button
          title={`Next: ${tests[index + 1].exercise.name}`}
          icon="arrow-right"
          onPress={() => {
            setPhase('idle');
            setIndex(index + 1);
          }}
        />
      ) : (
        <Button title="Save test" icon="content-save-outline" onPress={save} disabled={saving || !attemptsLogged} />
      )}
      {index > 0 ? (
        <Button title={`Back to ${tests[index - 1].exercise.name}`} variant="ghost" onPress={() => setIndex(index - 1)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  timer: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  timerLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  timerClock: { color: '#FFFFFF', fontSize: 64, lineHeight: 72, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerSub: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  skip: { marginTop: Spacing.sm, paddingVertical: 6, paddingHorizontal: Spacing.md, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.2)' },
});
