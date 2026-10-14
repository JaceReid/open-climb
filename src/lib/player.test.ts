import { describe, expect, it } from 'vitest';

import { completedSetKeys, initPlayer, playerReducer, remainingMs } from './player';
import { buildSteps } from './timer';

// ready, prep(5), work(7), rest(3), work(7), setRest(60), work(7), rest(3), work(7)
const steps = buildSteps([{ exerciseId: 'x', sets: 2, reps: 2, workSec: 7, restSec: 3, setRestSec: 60 }], 5);
const reduce = playerReducer(steps);

describe('player', () => {
  it('waits on ready, then runs timed steps carrying over time', () => {
    let s = initPlayer(0);
    s = reduce(s, { type: 'tick', now: 10_000 });
    expect(s.index).toBe(0); // ready waits for the user
    s = reduce(s, { type: 'next', now: 10_000 });
    expect(steps[s.index].kind).toBe('prep');
    // 5s prep + 7s work + 1s into rest
    s = reduce(s, { type: 'tick', now: 23_000 });
    expect(steps[s.index].kind).toBe('rest');
    expect(remainingMs(s, steps[s.index], 23_000)).toBe(2000);
  });

  it('pauses and resumes without losing time', () => {
    let s = reduce(initPlayer(0), { type: 'next', now: 0 }); // prep
    s = reduce(s, { type: 'tick', now: 2000 });
    s = reduce(s, { type: 'pause', now: 2000 });
    s = reduce(s, { type: 'tick', now: 60_000 });
    expect(steps[s.index].kind).toBe('prep');
    s = reduce(s, { type: 'resume', now: 60_000 });
    expect(remainingMs(s, steps[s.index], 60_000)).toBe(3000);
  });

  it('finishes and reports completed sets', () => {
    let s = reduce(initPlayer(0), { type: 'next', now: 0 });
    s = reduce(s, { type: 'tick', now: 5_000 + 7_000 + 3_000 + 7_000 + 1 });
    expect(steps[s.index].kind).toBe('setRest');
    expect([...completedSetKeys(steps, s)]).toEqual(['0:0']);
    s = reduce(s, { type: 'tick', now: 1_000_000 });
    expect(s.finished).toBe(true);
    expect([...completedSetKeys(steps, s)]).toEqual(['0:0', '0:1']);
  });

  it('prev restarts the step, or goes back when just started', () => {
    let s = reduce(initPlayer(0), { type: 'next', now: 0 });
    s = reduce(s, { type: 'prev', now: 3000 });
    expect(s.index).toBe(1);
    s = reduce(s, { type: 'prev', now: 3500 });
    expect(s.index).toBe(0);
  });
});
