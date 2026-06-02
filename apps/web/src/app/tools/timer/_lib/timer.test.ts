import { describe, it, expect } from 'vitest';
import {
  createTimerState,
  remainingMs,
  isExpired,
  start,
  pause,
  reset,
  adjust,
  formatClock,
} from './timer.js';

const T0 = 1_000_000; // fixed epoch ms for deterministic transitions
const MIN = 60_000;

const fresh = () => createTimerState({ label: 'Pool play', durationMs: 10 * MIN }, T0);

describe('createTimerState', () => {
  it('starts paused at the full duration', () => {
    const s = fresh();
    expect(s).toMatchObject({ running: false, endsAt: null, remainingMs: 10 * MIN, version: 0 });
    expect(remainingMs(s, T0)).toBe(10 * MIN);
  });
});

describe('start / pause', () => {
  it('start sets endsAt = now + remaining and bumps the version', () => {
    const s = start(fresh(), T0);
    expect(s.running).toBe(true);
    expect(s.endsAt).toBe(T0 + 10 * MIN);
    expect(s.version).toBe(1);
    // 3 minutes later, 7 remain.
    expect(remainingMs(s, T0 + 3 * MIN)).toBe(7 * MIN);
  });

  it('pause freezes the remaining time and clears endsAt', () => {
    const running = start(fresh(), T0);
    const paused = pause(running, T0 + 4 * MIN);
    expect(paused.running).toBe(false);
    expect(paused.endsAt).toBeNull();
    expect(paused.remainingMs).toBe(6 * MIN);
    // Time keeps passing but a paused clock holds steady.
    expect(remainingMs(paused, T0 + 9 * MIN)).toBe(6 * MIN);
  });

  it('start is a no-op when already running or nothing is left', () => {
    const running = start(fresh(), T0);
    expect(start(running, T0 + MIN)).toBe(running);
    const drained = createTimerState({ label: '', durationMs: 0 }, T0);
    expect(start(drained, T0)).toBe(drained);
  });
});

describe('reset', () => {
  it('returns to the configured duration, paused', () => {
    const ran = pause(start(fresh(), T0), T0 + 4 * MIN);
    const r = reset(ran, T0 + 5 * MIN);
    expect(r).toMatchObject({ running: false, endsAt: null, remainingMs: 10 * MIN });
  });
});

describe('adjust', () => {
  it('adds time while paused', () => {
    const r = adjust(fresh(), MIN, T0);
    expect(r.remainingMs).toBe(11 * MIN);
  });

  it('shifts endsAt while running and clamps at zero', () => {
    const running = start(fresh(), T0);
    const plus = adjust(running, MIN, T0);
    expect(plus.endsAt).toBe(T0 + 11 * MIN);
    const minusTooMuch = adjust(running, -100 * MIN, T0);
    expect(remainingMs(minusTooMuch, T0)).toBe(0);
  });
});

describe('isExpired', () => {
  it('is true only once a running clock hits zero', () => {
    const running = start(fresh(), T0);
    expect(isExpired(running, T0 + 5 * MIN)).toBe(false);
    expect(isExpired(running, T0 + 10 * MIN)).toBe(true);
    expect(isExpired(fresh(), T0 + 10 * MIN)).toBe(false); // paused never "expires"
  });
});

describe('formatClock', () => {
  it('formats M:SS and rounds up', () => {
    expect(formatClock(10 * MIN)).toBe('10:00');
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(4_200)).toBe('0:05'); // ceil
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-500)).toBe('0:00');
  });

  it('formats H:MM:SS past an hour', () => {
    expect(formatClock(90 * MIN)).toBe('1:30:00');
  });
});
