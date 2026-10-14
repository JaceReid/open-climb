// Timer state machine for the workout player. Pure and time-injected so it can
// be tested, and so it catches up correctly after the JS thread was paused.
import type { TimerStep } from './timer';

export interface PlayerState {
  index: number;
  /** ms timestamp the current step started (shifted forward by pauses). */
  startedAt: number;
  /** ms timestamp when paused, or null while running. */
  pausedAt: number | null;
  finished: boolean;
}

export type PlayerAction =
  | { type: 'tick'; now: number }
  | { type: 'next'; now: number }
  | { type: 'prev'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  /** Add time to the current step (e.g. "+15s" on a rest). */
  | { type: 'extend'; ms: number };

export function initPlayer(now: number): PlayerState {
  return { index: 0, startedAt: now, pausedAt: null, finished: false };
}

export function elapsedMs(state: PlayerState, now: number): number {
  return (state.pausedAt ?? now) - state.startedAt;
}

export function remainingMs(state: PlayerState, step: TimerStep | undefined, now: number): number | null {
  if (!step || step.durationSec == null) return null;
  return Math.max(0, step.durationSec * 1000 - elapsedMs(state, now));
}

export function playerReducer(steps: TimerStep[]) {
  return (state: PlayerState, action: PlayerAction): PlayerState => {
    if (state.finished) return state;
    switch (action.type) {
      case 'tick': {
        if (state.pausedAt != null) return state;
        let { index, startedAt } = state;
        // Advance through every timed step that has fully elapsed.
        while (index < steps.length) {
          const d = steps[index].durationSec;
          if (d == null || action.now - startedAt < d * 1000) break;
          startedAt += d * 1000;
          index++;
        }
        if (index === state.index) return state;
        return { ...state, index, startedAt, finished: index >= steps.length };
      }
      case 'next': {
        const index = state.index + 1;
        return { index, startedAt: action.now, pausedAt: null, finished: index >= steps.length };
      }
      case 'prev': {
        // Like a music player: restart the step, or go back if just started.
        const back = elapsedMs(state, action.now) < 2000 && state.index > 0;
        return { index: back ? state.index - 1 : state.index, startedAt: action.now, pausedAt: null, finished: false };
      }
      case 'pause':
        return state.pausedAt != null ? state : { ...state, pausedAt: action.now };
      case 'resume':
        if (state.pausedAt == null) return state;
        return { ...state, startedAt: state.startedAt + (action.now - state.pausedAt), pausedAt: null };
      case 'extend':
        return { ...state, startedAt: state.startedAt + action.ms };
    }
  };
}

/** Steps that complete a set and were passed, i.e. sets the user did. */
export function completedSetKeys(steps: TimerStep[], state: PlayerState): Set<string> {
  const done = new Set<string>();
  const upTo = state.finished ? steps.length : state.index;
  for (let i = 0; i < upTo; i++) {
    const s = steps[i];
    if (s.endsSet) done.add(`${s.itemIndex}:${s.setIndex}`);
  }
  return done;
}
