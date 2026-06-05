/**
 * Pure court-rotation (king-of-the-court) logic for the free rotation tool
 * (`/tools/rotation`). Manages who's on each court and who's waiting; "winner
 * stays, loser to the back, next one up" is the core move.
 *
 * Framework-free and deterministic — no randomness, no `Date.now()` in render
 * (every transition takes an explicit `now`). Shared across devices via
 * `useRoomSync` (the whole `RotationState` is broadcast, last-write-wins), so
 * it carries the `version`/`updatedAt` the room engine needs.
 */

export type Side = 'a' | 'b';

/** A court holds up to two teams; `null` = an open slot waiting for a team. */
export type Court = { a: string | null; b: string | null };

export type RotationState = {
  version: number;
  updatedAt: number;
  courtCount: number;
  courts: Court[];
  /** Waiting teams, front = next up. */
  queue: string[];
};

const MAX_COURTS = 12;
const emptyCourt = (): Court => ({ a: null, b: null });

function clampCourts(count: number): number {
  return Math.max(1, Math.min(Math.floor(count) || 1, MAX_COURTS));
}

export function createRotationState(courtCount: number, now = Date.now()): RotationState {
  const n = clampCourts(courtCount);
  return {
    version: 0,
    updatedAt: now,
    courtCount: n,
    courts: Array.from({ length: n }, emptyCourt),
    queue: [],
  };
}

function bump(state: RotationState, patch: Partial<RotationState>, now: number): RotationState {
  return { ...state, ...patch, version: state.version + 1, updatedAt: now };
}

/** Fill open court slots from the front of the queue, court by court (a then b). */
function fill(
  courts: readonly Court[],
  queue: readonly string[],
): {
  courts: Court[];
  queue: string[];
} {
  const q = [...queue];
  const next = courts.map((c) => {
    const a = c.a === null && q.length > 0 ? (q.shift() ?? null) : c.a;
    const b = c.b === null && q.length > 0 ? (q.shift() ?? null) : c.b;
    return { a, b };
  });
  return { courts: next, queue: q };
}

/** Add one or more teams to the back of the queue, then top up open courts. */
export function addTeams(
  state: RotationState,
  names: readonly string[],
  now = Date.now(),
): RotationState {
  const clean = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (clean.length === 0) return state;
  return bump(state, fill(state.courts, [...state.queue, ...clean]), now);
}

/** Remove a team wherever it sits (queue or a court slot), then refill. */
export function removeTeam(state: RotationState, name: string, now = Date.now()): RotationState {
  const courts = state.courts.map((c) => ({
    a: c.a === name ? null : c.a,
    b: c.b === name ? null : c.b,
  }));
  const queue = state.queue.filter((n) => n !== name);
  return bump(state, fill(courts, queue), now);
}

/**
 * Record a court result: the winner stays put, the loser goes to the back of
 * the queue, and the next waiting team takes the open slot. No-op unless both
 * slots on that court are filled.
 */
export function reportWin(
  state: RotationState,
  courtIndex: number,
  winner: Side,
  now = Date.now(),
): RotationState {
  const court = state.courts[courtIndex];
  if (!court || court.a === null || court.b === null) return state;
  const loser = winner === 'a' ? court.b : court.a;
  const kept: Court = winner === 'a' ? { a: court.a, b: null } : { a: null, b: court.b };
  const courts = state.courts.map((c, i) => (i === courtIndex ? kept : c));
  return bump(state, fill(courts, [...state.queue, loser]), now);
}

/** Send both teams on a court to the back of the queue, then refill it. */
export function clearCourt(
  state: RotationState,
  courtIndex: number,
  now = Date.now(),
): RotationState {
  const court = state.courts[courtIndex];
  if (!court || (court.a === null && court.b === null)) return state;
  const out = [court.a, court.b].filter((x): x is string => x !== null);
  const courts = state.courts.map((c, i) => (i === courtIndex ? emptyCourt() : c));
  return bump(state, fill(courts, [...state.queue, ...out]), now);
}

/** Change the number of courts; teams on dropped courts return to the queue. */
export function setCourtCount(
  state: RotationState,
  count: number,
  now = Date.now(),
): RotationState {
  const n = clampCourts(count);
  if (n === state.courtCount) return state;
  const kept = state.courts.slice(0, n);
  const freed = state.courts
    .slice(n)
    .flatMap((c) => [c.a, c.b].filter((x): x is string => x !== null));
  const courts = [...kept];
  while (courts.length < n) courts.push(emptyCourt());
  const filled = fill(courts, [...state.queue, ...freed]);
  return bump(state, { ...filled, courtCount: n }, now);
}

/** Count of every team currently tracked (on courts + waiting). */
export function teamCount(state: RotationState): number {
  const onCourt = state.courts.reduce((sum, c) => sum + (c.a ? 1 : 0) + (c.b ? 1 : 0), 0);
  return onCourt + state.queue.length;
}

/** Render the board as a plain-text block for the "Copy" button. */
export function formatRotationText(state: RotationState): string {
  const courtLines = state.courts.map((c, i) => `Court ${i + 1}: ${c.a ?? '—'} vs ${c.b ?? '—'}`);
  const queueLine =
    state.queue.length > 0 ? `Up next: ${state.queue.join(', ')}` : 'Up next: (empty)';
  return [...courtLines, '', queueLine].join('\n');
}
