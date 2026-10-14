// Full-screen guided workout timer.
import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClock, formatDetails, formatDuration, formatSetsReps } from '@/lib/format';
import { completedSetKeys, elapsedMs, initPlayer, playerReducer, remainingMs } from '@/lib/player';
import { buildSteps, type TimerStep } from '@/lib/timer';
import type { Exercise, Settings, Workout } from '@/lib/types';

import { Icon, type IconName } from './ui';

const WHITE = '#FFFFFF';
const WHITE_DIM = 'rgba(255,255,255,0.75)';

/** Beeps, voice and vibration, honouring the user's settings. Also used by the max-test timer. */
export function useCues(settings: Settings) {
  const tick = useAudioPlayer(require('@/assets/sounds/tick.wav'));
  const go = useAudioPlayer(require('@/assets/sounds/go.wav'));
  const rest = useAudioPlayer(require('@/assets/sounds/rest.wav'));

  useEffect(() => {
    // Beep over the user's music rather than pausing it.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    return () => {
      Speech.stop();
    };
  }, []);

  const play = (p: AudioPlayer) => {
    if (!settings.sound) return;
    p.seekTo(0);
    p.play();
  };
  return {
    tick: () => play(tick),
    go: () => {
      play(go);
      if (settings.vibrate) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    },
    rest: () => {
      play(rest);
      if (settings.vibrate) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    say: (text: string) => {
      if (!settings.voice) return;
      Speech.stop();
      Speech.speak(text, { rate: 1.05 });
    },
  };
}

function spokenDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  const parts = [];
  if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (s) parts.push(`${s} seconds`);
  return parts.join(' ');
}

function workLabel(ex: Exercise | undefined): string {
  if (ex?.category === 'fingerboard') return 'Hang';
  if (ex?.category === 'core' || ex?.category === 'mobility') return 'Hold';
  return 'Go';
}

export function Player({
  workout,
  exercises,
  settings,
  onFinish,
  onDiscard,
}: {
  workout: Workout;
  exercises: Map<string, Exercise>;
  settings: Settings;
  onFinish: (completed: Set<string>) => void;
  onDiscard: () => void;
}) {
  useKeepAwake();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const cues = useCues(settings);
  const steps = useMemo(() => buildSteps(workout.items, settings.prepSec), [workout.items, settings.prepSec]);
  const reducer = useMemo(() => playerReducer(steps), [steps]);
  const [state, dispatch] = useReducer(reducer, undefined, () => initPlayer(Date.now()));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: 'tick', now: t });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const step: TimerStep | undefined = steps[state.index];
  const item = step ? workout.items[step.itemIndex] : undefined;
  const exercise = item ? exercises.get(item.exerciseId) : undefined;

  // Cues when entering a step.
  const entered = useRef(-1);
  useEffect(() => {
    if (state.finished) {
      cues.say('Workout complete. Nice work.');
      onFinish(completedSetKeys(steps, state));
      return;
    }
    if (!step || entered.current === state.index) return;
    entered.current = state.index;
    switch (step.kind) {
      case 'ready':
        cues.say(`${state.index === 0 ? '' : 'Next: '}${exercise?.name ?? ''}`);
        break;
      case 'prep':
        cues.say('Get ready');
        break;
      case 'work':
      case 'manual':
        cues.go();
        break;
      case 'rest':
        cues.rest();
        break;
      case 'setRest':
        cues.rest();
        cues.say(`Rest, ${spokenDuration(step.durationSec ?? 0)}`);
        break;
    }
    // Cues are fire-and-forget; only the step change matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, state.finished]);

  // 3-2-1 countdown beeps.
  const remaining = remainingMs(state, step, now);
  const remSec = remaining == null ? null : Math.ceil(remaining / 1000);
  const beeped = useRef('');
  useEffect(() => {
    if (!step || step.durationSec == null || remSec == null || state.pausedAt != null) return;
    const long = step.kind === 'work' ? step.durationSec >= 5 : step.durationSec >= 3;
    if (!long || remSec < 1 || remSec > 3 || remSec >= step.durationSec) return;
    const key = `${state.index}:${remSec}`;
    if (beeped.current === key) return;
    beeped.current = key;
    cues.tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remSec, state.index]);

  const confirmQuit = () => {
    dispatch({ type: 'pause', now: Date.now() });
    Alert.alert('End workout?', 'Log the sets you completed, or discard this session.', [
      { text: 'Keep going', style: 'cancel', onPress: () => dispatch({ type: 'resume', now: Date.now() }) },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
      { text: 'Finish & log', onPress: () => onFinish(completedSetKeys(steps, state)) },
    ]);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmQuit();
      return true;
    });
    return () => sub.remove();
  });

  if (!step || !item) return <View style={{ flex: 1, backgroundColor: c.ready }} />;

  const paused = state.pausedAt != null;
  const bg = { ready: c.ready, prep: c.prep, work: c.work, manual: c.work, rest: c.rest, setRest: c.setRest }[step.kind];
  const label = {
    ready: state.index === 0 ? 'First up' : 'Up next',
    prep: 'Get ready',
    work: workLabel(exercise),
    manual: `Set ${step.setIndex + 1}`,
    rest: 'Rest',
    setRest: 'Set rest',
  }[step.kind];
  const details = formatDetails(item, exercise, settings.unit);
  const timedItem = (item.workSec ?? 0) > 0;
  const setLine = `Set ${step.setIndex + 1} of ${item.sets}${timedItem && item.reps > 1 ? ` · Rep ${step.repIndex + 1} of ${item.reps}` : ''}`;
  const progress = state.index / steps.length;

  const clock =
    remaining != null ? formatClock(remaining / 1000) : step.kind === 'manual' ? formatClock(elapsedMs(state, now) / 1000) : null;

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg }]}>
      <View style={styles.topBar}>
        <Pressable onPress={confirmQuit} hitSlop={12} accessibilityLabel="End workout">
          <Icon name="close" color={WHITE} size={28} />
        </Pressable>
        <Text style={styles.topTitle}>
          Exercise {step.itemIndex + 1} of {workout.items.length}
        </Text>
        <Pressable onPress={confirmQuit} hitSlop={12}>
          <Text style={styles.topAction}>Finish</Text>
        </Pressable>
      </View>
      <View style={[styles.progressTrack]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.center}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Text style={styles.exercise} numberOfLines={2}>
          {exercise?.name ?? 'Exercise'}
        </Text>
        {step.kind === 'ready' ? (
          <>
            <Text style={styles.sub}>{formatSetsReps(item)}</Text>
            {details ? <Text style={styles.sub}>{details}</Text> : null}
            {item.notes ? <Text style={styles.note}>{item.notes}</Text> : null}
          </>
        ) : (
          <Text style={styles.sub}>{setLine}</Text>
        )}

        {clock != null ? (
          <Text style={[styles.clock, step.kind === 'manual' && styles.clockSmall]} accessibilityRole="timer">
            {clock}
          </Text>
        ) : null}

        {step.kind === 'manual' ? (
          <Text style={styles.sub}>
            {item.reps} {item.reps === 1 ? 'rep' : 'reps'}
            {details ? ` · ${details}` : ''}
          </Text>
        ) : null}
        {step.kind === 'setRest' || step.kind === 'rest' || step.kind === 'prep' ? (
          <Text style={styles.next}>
            Next: {step.kind === 'setRest' ? `set ${step.setIndex + 2} of ${item.sets}` : `${workLabel(exercise).toLowerCase()} ${formatDuration(item.workSec ?? 0)}`}
            {step.kind !== 'setRest' && details ? ` · ${details}` : ''}
          </Text>
        ) : null}
      </View>

      {step.kind === 'ready' || step.kind === 'manual' ? (
        <Pressable
          onPress={() => dispatch({ type: 'next', now: Date.now() })}
          style={({ pressed }) => [styles.bigButton, { opacity: pressed ? 0.8 : 1 }]}
          accessibilityRole="button">
          <Text style={[styles.bigButtonText, { color: bg }]}>{step.kind === 'ready' ? 'Start' : 'Done'}</Text>
        </Pressable>
      ) : null}

      <View style={styles.controls}>
        <Control icon="skip-previous" label="Previous" onPress={() => dispatch({ type: 'prev', now: Date.now() })} />
        {step.durationSec != null ? (
          <Control
            big
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Resume' : 'Pause'}
            onPress={() => dispatch({ type: paused ? 'resume' : 'pause', now: Date.now() })}
          />
        ) : (
          <View style={{ width: 72 }} />
        )}
        {step.kind === 'setRest' ? (
          <Control icon="plus" label="+15s" onPress={() => dispatch({ type: 'extend', ms: 15_000 })} />
        ) : null}
        <Control icon="skip-next" label="Skip" onPress={() => dispatch({ type: 'next', now: Date.now() })} />
      </View>
    </View>
  );
}

function Control({ icon, label, onPress, big }: { icon: IconName; label: string; onPress: () => void; big?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [styles.control, big && styles.controlBig, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={big ? 40 : 28} color={WHITE} />
      {!big ? <Text style={styles.controlLabel}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  topTitle: { color: WHITE_DIM, fontSize: 15, fontWeight: '600' },
  topAction: { color: WHITE, fontSize: 16, fontWeight: '700' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: WHITE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  label: { color: WHITE, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  exercise: { color: WHITE, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  sub: { color: WHITE_DIM, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  note: { color: WHITE, fontSize: 15, fontStyle: 'italic', textAlign: 'center', marginTop: Spacing.sm },
  clock: {
    color: WHITE,
    fontSize: 112,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    marginVertical: Spacing.sm,
  },
  clockSmall: { fontSize: 56, opacity: 0.8 },
  next: { color: WHITE, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  bigButton: {
    backgroundColor: WHITE,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  bigButtonText: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  control: { alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 64, gap: 2 },
  controlBig: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  controlLabel: { color: WHITE_DIM, fontSize: 12, fontWeight: '600' },
});
