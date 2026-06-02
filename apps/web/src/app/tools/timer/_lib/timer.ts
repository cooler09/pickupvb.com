/**
 * Pure timer state + transitions for the free match-timer tool
 * (`/tools/timer`). A synced countdown: only *transitions* (start / pause /
 * reset / adjust) are broadcast across devices — never per-tick — and each
 * device derives the displayed time locally from `endsAt - now`. That keeps the
 * realtime protocol identical to the scoreboard's (last-write-wins on
 * `version`) and avoids clock drift / chatty broadcasts.
 *
 * Framework-free and deterministic: every transition takes an explicit `now`
 * (defaulting to `Date.now()`), so the logic is unit-tested without faking time
 * and `Date.now()` never runs in a render body.
 */

export type TimerConfig = {
  label: string;
  /** Configured countdown length, in milliseconds. */
  durationMs: number;
};

export type TimerState = {
  version: number;
  updatedAt: number;
  label: string;
  durationMs: number;
  running: boolean;
  /** Epoch ms at which the clock hits zero — set only while running. */
  endsAt: number | null;
  /** Ms left on the clock while paused (and the seed when started). */
  remainingMs: number;
};

export const DEFAULT_TIMER_CONFIG: TimerConfig = { label: '', durationMs: 10 * 60_000 };

export function createTimerState(config: TimerConfig, now = Date.now()): TimerState {
  const durationMs = Math.max(0, Math.floor(config.durationMs));
  return {
    version: 0,
    updatedAt: now,
    label: config.label,
    durationMs,
    running: false,
    endsAt: null,
    remainingMs: durationMs,
  };
}

/** Ms left on the clock, clamped ≥0, for the given wall-clock `now`. */
export function remainingMs(state: TimerState, now: number): number {
  if (state.running && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  return Math.max(0, state.remainingMs);
}

/** True once a running clock has reached zero. */
export function isExpired(state: TimerState, now: number): boolean {
  return state.running && remainingMs(state, now) <= 0;
}

function next(state: TimerState, patch: Partial<TimerState>, now: number): TimerState {
  return { ...state, ...patch, version: state.version + 1, updatedAt: now };
}

/** Start (or resume) the clock. No-op if already running or nothing's left. */
export function start(state: TimerState, now = Date.now()): TimerState {
  if (state.running) return state;
  const left = remainingMs(state, now);
  if (left <= 0) return state;
  return next(state, { running: true, endsAt: now + left, remainingMs: left }, now);
}

/** Pause the clock, freezing the remaining time. No-op if already paused. */
export function pause(state: TimerState, now = Date.now()): TimerState {
  if (!state.running) return state;
  return next(state, { running: false, endsAt: null, remainingMs: remainingMs(state, now) }, now);
}

/** Reset back to the configured duration, paused. */
export function reset(state: TimerState, now = Date.now()): TimerState {
  return next(state, { running: false, endsAt: null, remainingMs: state.durationMs }, now);
}

/** Add (or subtract) time, clamped ≥0; works whether running or paused. */
export function adjust(state: TimerState, deltaMs: number, now = Date.now()): TimerState {
  const left = Math.max(0, remainingMs(state, now) + deltaMs);
  if (state.running) return next(state, { endsAt: now + left, remainingMs: left }, now);
  return next(state, { remainingMs: left }, now);
}

/** Format ms as `M:SS` (or `H:MM:SS` past an hour). Rounds up so a fresh 10:00 reads 10:00. */
export function formatClock(ms: number): string {
  const totalSec = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
