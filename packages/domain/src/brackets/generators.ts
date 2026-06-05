import type { EntryId, Match, MatchId, Seed } from './match.js';
import { InvariantViolation, ValidationError } from '../shared/result.js';

/**
 * Pure generator helpers for bracket layouts.
 *
 * Each generator returns a `Match[]` with all wiring (`advancesToMatchId`)
 * resolved. IDs are produced by the supplied `mkId` factory so the caller
 * (typically the repository when persisting a freshly generated bracket)
 * controls ID assignment.
 *
 * Supported formats: single elimination, round robin, pool play → playoff,
 * and double elimination.
 */

type IdFactory = () => MatchId;

/** Seeds in the canonical bracket-position order for a P-slot single-elim bracket. */
function bracketSlots(p: number): number[] {
  if (p < 2 || (p & (p - 1)) !== 0) {
    throw new InvariantViolation(`bracketSlots requires power-of-two p, got ${p}`, { p });
  }
  if (p === 2) return [1, 2];
  const half = bracketSlots(p / 2);
  const out: number[] = [];
  for (const s of half) out.push(s, p + 1 - s);
  return out;
}

/** Smallest power of two >= n. */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate a single-elimination bracket. Byes go to the top seeds
 * automatically (highest seeds are paired against phantom slots).
 *
 * @throws {ValidationError} if fewer than 2 seeds are supplied.
 * @throws {InvariantViolation} if internal slot wiring fails (should not
 *   happen with valid input — indicates a bug).
 */
export function generateSingleElimination(seeds: ReadonlyArray<Seed>, mkId: IdFactory): Match[] {
  if (seeds.length < 2) {
    throw new ValidationError('Single elimination requires at least 2 teams.', {
      teamCount: seeds.length,
    });
  }
  const sorted = [...seeds].sort((a, b) => a.seed - b.seed);
  const N = sorted.length;
  const P = nextPow2(N);
  const slots = bracketSlots(P);

  // teamForSlot[slotIdx] = team at canonical slot position (1-indexed)
  const teamForSlot = new Map<number, EntryId>();
  for (const s of sorted) teamForSlot.set(s.seed, s.entryId);

  const totalRounds = Math.log2(P);
  const matches: Match[] = [];
  // Build rounds bottom-up so we know the IDs of round R+1 before round R.
  // We'll record for each "half-pair" of round R, the match it feeds in R+1.
  const matchesByRound: Match[][] = [];

  for (let round = totalRounds; round >= 1; round--) {
    const matchesInRound = Math.pow(2, totalRounds - round);
    const arr: Match[] = [];
    for (let m = 0; m < matchesInRound; m++) {
      const nextRoundArr = matchesByRound[totalRounds - round - 1];
      const feedsIdx = Math.floor(m / 2);
      const feeds = nextRoundArr ? nextRoundArr[feedsIdx] : null;
      const slot: 'a' | 'b' = m % 2 === 0 ? 'a' : 'b';
      arr.push({
        id: mkId(),
        round,
        matchNumber: m + 1,
        pool: null,
        bracketSide: null,
        entryAId: null,
        entryBId: null,
        winnerEntryId: null,
        workTeamId: null,
        court: null,
        slot: null,
        bestOf: null,
        targetScore: null,
        status: 'pending',
        sets: [],
        advancesToMatchId: feeds ? feeds.id : null,
        advancesToSlot: feeds ? slot : null,
        loserAdvancesToMatchId: null,
        loserAdvancesToSlot: null,
        scheduledAt: null,
      });
    }
    matchesByRound[totalRounds - round] = arr;
  }

  // Round 1 team placement + bye auto-advance.
  const round1 = matchesByRound[totalRounds - 1];
  if (!round1) throw new InvariantViolation('round-1 should exist');
  for (let i = 0; i < round1.length; i++) {
    const slotA = slots[i * 2];
    const slotB = slots[i * 2 + 1];
    if (slotA === undefined || slotB === undefined) continue;
    const teamA = teamForSlot.get(slotA) ?? null;
    const teamB = teamForSlot.get(slotB) ?? null;
    const m = round1[i];
    if (!m) continue;
    m.entryAId = teamA;
    m.entryBId = teamB;
    if (teamA && !teamB) {
      m.status = 'bye';
      m.winnerEntryId = teamA;
      placeAdvancedTeam(matchesByRound, m, teamA);
    } else if (teamB && !teamA) {
      m.status = 'bye';
      m.winnerEntryId = teamB;
      placeAdvancedTeam(matchesByRound, m, teamB);
    } else if (!teamA && !teamB) {
      // Phantom-vs-phantom: should not happen with sensible seeding.
      m.status = 'bye';
    }
  }

  for (const r of matchesByRound) matches.push(...r);
  return matches;
}

function placeAdvancedTeam(matchesByRound: Match[][], fromMatch: Match, teamId: EntryId): void {
  if (!fromMatch.advancesToMatchId || !fromMatch.advancesToSlot) return;
  const next = findMatch(matchesByRound, fromMatch.advancesToMatchId);
  if (!next) return;
  if (fromMatch.advancesToSlot === 'a') next.entryAId = teamId;
  else next.entryBId = teamId;
}

function findMatch(matchesByRound: Match[][], id: MatchId): Match | null {
  for (const r of matchesByRound) {
    for (const m of r) if (m.id === id) return m;
  }
  return null;
}

/**
 * Generate a round-robin schedule using the standard circle method.
 * Every team plays every other team exactly once. For odd N, one team
 * sits out per round.
 *
 * When `maxRounds` is supplied, the schedule is truncated after that
 * many rounds — useful for "each team plays exactly N games" pools
 * (see {@link generatePoolPlay} `fixed_games` mode). Each team will
 * have played `maxRounds` opponents (or one fewer when sitting out as
 * the odd team in their round).
 *
 * By default `maxRounds` is **capped** at a full round-robin (`n − 1`),
 * so no pairing repeats. Pass `allowRepeats = true` to let `maxRounds`
 * exceed that — the circle rotation has period `n − 1`, so continuing it
 * deterministically replays earlier matchups. This backs the rec
 * "everyone plays ~N games even if they play a team twice" target-games
 * mode (ADR 0032): a 3-team pool can reach the same games-per-team as a
 * larger pool by repeating an opponent.
 *
 * @throws {ValidationError} if fewer than 2 seeds are supplied or
 *   `maxRounds` is not positive.
 */
export function generateRoundRobin(
  seeds: ReadonlyArray<Seed>,
  mkId: IdFactory,
  maxRounds?: number,
  allowRepeats = false,
): Match[] {
  if (seeds.length < 2) {
    throw new ValidationError('Round robin requires at least 2 teams.', {
      teamCount: seeds.length,
    });
  }
  if (maxRounds !== undefined && maxRounds < 1) {
    throw new ValidationError('maxRounds must be >= 1.', { maxRounds });
  }
  const sorted = [...seeds].sort((a, b) => a.seed - b.seed);
  const teams: (EntryId | null)[] = sorted.map((s) => s.entryId);
  if (teams.length % 2 === 1) teams.push(null); // bye marker

  const n = teams.length;
  const fullRounds = n - 1;
  const rounds =
    maxRounds === undefined
      ? fullRounds
      : allowRepeats
        ? maxRounds
        : Math.min(maxRounds, fullRounds);
  const half = n / 2;
  const matches: Match[] = [];

  // Fix team 0; rotate the rest.
  let rotation: (EntryId | null)[] = teams.slice(1);
  const fixed = teams[0] ?? null;
  for (let round = 1; round <= rounds; round++) {
    const arrangement: (EntryId | null)[] = [fixed, ...rotation];
    let matchNum = 1;
    for (let i = 0; i < half; i++) {
      const a = arrangement[i] ?? null;
      const b = arrangement[n - 1 - i] ?? null;
      // Skip the bye pairing entirely.
      if (a === null || b === null) continue;
      matches.push({
        id: mkId(),
        round,
        matchNumber: matchNum++,
        pool: null,
        bracketSide: null,
        entryAId: a,
        entryBId: b,
        winnerEntryId: null,
        workTeamId: null,
        court: null,
        slot: null,
        bestOf: null,
        targetScore: null,
        status: 'pending',
        sets: [],
        advancesToMatchId: null,
        advancesToSlot: null,
        loserAdvancesToMatchId: null,
        loserAdvancesToSlot: null,
        scheduledAt: null,
      });
    }
    // Rotate.
    const last = rotation[rotation.length - 1];
    if (last !== undefined) {
      rotation = [last, ...rotation.slice(0, -1)];
    }
  }
  return matches;
}

/**
 * Stub for formats not yet implemented.
 *
 * @throws {ValidationError} always — the format is not supported.
 */
export function generateNotImplemented(format: string): never {
  throw new ValidationError(`Bracket format "${format}" is not implemented yet.`, { format });
}

// ---- Double elimination --------------------------------------------------

type MutableMatch = { -readonly [K in keyof Match]: Match[K] };

function emptyMatch(
  id: MatchId,
  round: number,
  matchNumber: number,
  side: 'winners' | 'losers' | 'final',
): MutableMatch {
  return {
    id,
    round,
    matchNumber,
    pool: null,
    bracketSide: side,
    entryAId: null,
    entryBId: null,
    winnerEntryId: null,
    workTeamId: null,
    court: null,
    slot: null,
    bestOf: null,
    targetScore: null,
    status: 'pending',
    sets: [],
    advancesToMatchId: null,
    advancesToSlot: null,
    loserAdvancesToMatchId: null,
    loserAdvancesToSlot: null,
    scheduledAt: null,
  };
}

/**
 * Generate a double-elimination bracket. v1 requires a power-of-two team
 * count (4, 8, 16, 32) so the losers bracket pairing stays clean. The
 * grand final is a single match (no bracket reset in v1) — the WB winner
 * faces the LB winner once.
 *
 * Match layout:
 *   - Winners bracket: `bracketSide='winners'`, rounds 1..W (W = log2(P)).
 *   - Losers bracket:  `bracketSide='losers'`,  rounds 1..2(W-1) alternating
 *                      minor (odd) and major (even) rounds.
 *   - Grand final:     `bracketSide='final'`, round 1.
 *
 * Wiring:
 *   - WB winner → next WB round (or grand final from WB final).
 *   - WB loser  → corresponding LB match.
 *   - LB winner → next LB round (or grand final from LB final).
 *
 * @throws {ValidationError} if fewer than 4 seeds are supplied or the
 *   seed count is not a power of two (4, 8, 16, 32, …).
 */
export function generateDoubleElimination(seeds: ReadonlyArray<Seed>, mkId: IdFactory): Match[] {
  const N = seeds.length;
  if (N < 4) {
    throw new ValidationError('Double elimination requires at least 4 teams.', { teamCount: N });
  }
  const P = nextPow2(N);
  if (P !== N) {
    throw new ValidationError(
      'Double elimination v1 requires a power-of-two team count (4, 8, 16, 32).',
      { teamCount: N },
    );
  }
  const W = Math.log2(P);

  // ---- Build skeletons (no wiring yet) --------------------------------
  const wb: MutableMatch[][] = [];
  for (let r = 1; r <= W; r++) {
    const count = P / Math.pow(2, r);
    const arr: MutableMatch[] = [];
    for (let m = 0; m < count; m++) {
      arr.push(emptyMatch(mkId(), r, m + 1, 'winners'));
    }
    wb.push(arr);
  }

  const lbRoundsCount = 2 * (W - 1);
  const lb: MutableMatch[][] = [];
  for (let r = 1; r <= lbRoundsCount; r++) {
    const k = Math.ceil(r / 2);
    const count = P / Math.pow(2, k + 1);
    const arr: MutableMatch[] = [];
    for (let m = 0; m < count; m++) {
      arr.push(emptyMatch(mkId(), r, m + 1, 'losers'));
    }
    lb.push(arr);
  }

  const grandFinal = emptyMatch(mkId(), 1, 1, 'final');

  // ---- Wire WB winners -------------------------------------------------
  for (let r = 0; r < W - 1; r++) {
    const cur = wb[r]!;
    const next = wb[r + 1]!;
    for (let i = 0; i < cur.length; i++) {
      const m = cur[i]!;
      const dest = next[Math.floor(i / 2)];
      if (!dest) continue;
      m.advancesToMatchId = dest.id;
      m.advancesToSlot = i % 2 === 0 ? 'a' : 'b';
    }
  }
  const wbFinal = wb[W - 1]?.[0];
  if (wbFinal) {
    wbFinal.advancesToMatchId = grandFinal.id;
    wbFinal.advancesToSlot = 'a';
  }

  // ---- Wire WB losers → LB --------------------------------------------
  // WB R1 losers fill LB R1 (minor) by adjacent pairing.
  const lbR1 = lb[0];
  if (lbR1) {
    const wbR1 = wb[0]!;
    for (let i = 0; i < wbR1.length; i++) {
      const m = wbR1[i]!;
      const dest = lbR1[Math.floor(i / 2)];
      if (!dest) continue;
      m.loserAdvancesToMatchId = dest.id;
      m.loserAdvancesToSlot = i % 2 === 0 ? 'a' : 'b';
    }
  }
  // WB R(k>=2) losers feed LB major round 2(k-1), one per match in slot 'b'.
  for (let k = 2; k <= W; k++) {
    const wbRk = wb[k - 1]!;
    const lbMajor = lb[2 * (k - 1) - 1];
    if (!lbMajor) continue;
    for (let i = 0; i < wbRk.length; i++) {
      const m = wbRk[i]!;
      const dest = lbMajor[i];
      if (!dest) continue;
      m.loserAdvancesToMatchId = dest.id;
      m.loserAdvancesToSlot = 'b';
    }
  }

  // ---- Wire LB winners -------------------------------------------------
  for (let r = 1; r < lbRoundsCount; r++) {
    const cur = lb[r - 1]!;
    const next = lb[r]!;
    const curIsMinor = r % 2 === 1;
    for (let i = 0; i < cur.length; i++) {
      const m = cur[i]!;
      if (curIsMinor) {
        // Next is a major round: each minor i feeds major i (slot a).
        const dest = next[i];
        if (!dest) continue;
        m.advancesToMatchId = dest.id;
        m.advancesToSlot = 'a';
      } else {
        // Next is a minor round: pair adjacent winners.
        const dest = next[Math.floor(i / 2)];
        if (!dest) continue;
        m.advancesToMatchId = dest.id;
        m.advancesToSlot = i % 2 === 0 ? 'a' : 'b';
      }
    }
  }
  const lbFinal = lb[lbRoundsCount - 1]?.[0];
  if (lbFinal) {
    lbFinal.advancesToMatchId = grandFinal.id;
    lbFinal.advancesToSlot = 'b';
  }

  // ---- Place WB R1 teams in canonical bracket order -------------------
  const sorted = [...seeds].sort((a, b) => a.seed - b.seed);
  const slots = bracketSlots(P);
  const teamForSlot = new Map<number, EntryId>();
  for (const s of sorted) teamForSlot.set(s.seed, s.entryId);
  const wbR1 = wb[0]!;
  for (let i = 0; i < wbR1.length; i++) {
    const slotA = slots[i * 2];
    const slotB = slots[i * 2 + 1];
    if (slotA === undefined || slotB === undefined) continue;
    const m = wbR1[i]!;
    m.entryAId = teamForSlot.get(slotA) ?? null;
    m.entryBId = teamForSlot.get(slotB) ?? null;
  }

  return [...wb.flat(), ...lb.flat(), grandFinal];
}

// ---- Pool play -----------------------------------------------------------

/** Pool labels A, B, C, ... up to 26 pools (more than enough for v1). */
function poolLabel(idx: number): string {
  return String.fromCharCode(65 + idx);
}

/**
 * Snake-distribute seeds into `poolCount` pools. Top seed goes to pool A,
 * second to B, ..., then snakes back so strong/weak teams are balanced.
 *
 * Returns one Seed[] per pool (in pool index order), each sorted by the
 * team's *within-pool* seed (1 = strongest in that pool).
 *
 * @throws {ValidationError} if `poolCount` is less than 1 or there are
 *   fewer than `poolCount * 2` seeds (each pool needs at least 2 teams).
 */
export function distributeIntoPools(seeds: ReadonlyArray<Seed>, poolCount: number): Seed[][] {
  if (poolCount < 1) throw new ValidationError('Pool count must be >= 1.', { poolCount });
  if (seeds.length < poolCount * 2) {
    throw new ValidationError(`Need at least ${poolCount * 2} teams to fill ${poolCount} pools.`, {
      poolCount,
      teamCount: seeds.length,
    });
  }
  const sorted = [...seeds].sort((a, b) => a.seed - b.seed);
  const pools: Seed[][] = Array.from({ length: poolCount }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    const round = Math.floor(i / poolCount);
    const within = i % poolCount;
    const poolIdx = round % 2 === 0 ? within : poolCount - 1 - within;
    const team = sorted[i]!;
    pools[poolIdx]!.push({
      entryId: team.entryId,
      seed: pools[poolIdx]!.length + 1,
      pool: poolLabel(poolIdx),
    });
  }
  return pools;
}

/**
 * Pool grouping for {@link generatePoolPlay}. When every seed carries a
 * `pool` label (host hand-assigned via `setPools`, ADR 0032), honor those
 * groupings verbatim — preserving **uneven** pool sizes. Pools come back in
 * alphabetical label order; within each pool teams are re-seeded 1..k by the
 * incoming seed order. Otherwise fall back to even snake distribution.
 *
 * @throws {ValidationError} when a hand-assigned pool has fewer than 2 teams.
 */
function poolsFromSeedsOrSnake(seeds: ReadonlyArray<Seed>, poolCount: number): Seed[][] {
  const allAssigned = seeds.length > 0 && seeds.every((s) => s.pool !== null && s.pool !== '');
  if (!allAssigned) return distributeIntoPools(seeds, poolCount);
  const byLabel = new Map<string, Seed[]>();
  for (const s of [...seeds].sort((a, b) => a.seed - b.seed)) {
    const label = s.pool!;
    const list = byLabel.get(label) ?? [];
    list.push({ entryId: s.entryId, seed: list.length + 1, pool: label });
    byLabel.set(label, list);
  }
  const pools = [...byLabel.keys()].sort().map((k) => byLabel.get(k)!);
  for (const p of pools) {
    if (p.length < 2) {
      throw new ValidationError(`Pool ${p[0]?.pool ?? '?'} needs at least 2 teams.`, {
        pool: p[0]?.pool,
        size: p.length,
      });
    }
  }
  return pools;
}

/**
 * How many circle-method rounds a pool of `poolSize` must run for each team
 * to play ~`gamesPerTeam` games (ADR 0032 rec target-games mode). Even pools
 * play one game per team per round, so it's exactly the target. Odd pools
 * rotate a bye, so each team plays at rate `(poolSize-1)/poolSize` per round
 * — bump the count to compensate (rounding up errs toward *more* play, the
 * rec goal). Returns 0 for degenerate pools (< 2 teams).
 */
function roundsForTargetGames(poolSize: number, gamesPerTeam: number): number {
  if (poolSize < 2) return 0;
  if (poolSize % 2 === 0) return gamesPerTeam;
  return Math.ceil((gamesPerTeam * poolSize) / (poolSize - 1));
}

/**
 * Generate pool-play matches: each pool plays an internal round-robin
 * (or a fixed games-per-team truncation thereof).
 *
 * `match.pool` is set to 'A', 'B', ... so the UI can group by pool, and
 * `match.round` follows the per-pool round-robin round number.
 *
 * When `options.assignWorkTeam` is true the generator finds the idle
 * team per (pool, round) — the one not playing — and stamps it as
 * `workTeamId` on every match in that round. Even-sized pools have no
 * idle team, so `workTeamId` stays null in that case. Hosts may
 * override per match in the UI. See ADR 0018.
 *
 * Pool composition: if every seed already carries a `pool` label (the host
 * hand-assigned pools via `setPools`, ADR 0032), those groupings are honored
 * verbatim — including **uneven** pools (3 in A, 4 in B). Otherwise seeds are
 * snake-distributed into `poolCount` even-ish pools.
 *
 * Schedule modes:
 *  - `round_robin` — every team plays every other team in its pool once.
 *  - `fixed_games` — each team plays ~`gamesPerTeam` games. When the target
 *    exceeds what a full round-robin provides (smaller pools), the circle
 *    rotation continues and **repeats** opponents, so uneven pools can still
 *    hit the same games-per-team. See ADR 0032.
 *
 * @throws {ValidationError} propagated from {@link distributeIntoPools}
 *   (bad pool count / too few seeds), when a hand-assigned pool has < 2
 *   teams, or when `schedule === 'fixed_games'` without a positive
 *   `gamesPerTeam`.
 */
export function generatePoolPlay(
  seeds: ReadonlyArray<Seed>,
  poolCount: number,
  options: {
    schedule: 'round_robin' | 'fixed_games';
    gamesPerTeam: number | null;
    assignWorkTeam?: boolean;
    courtLabels?: ReadonlyArray<string>;
    courtsByPool?: Readonly<Record<string, ReadonlyArray<string>>>;
  },
  mkId: IdFactory,
): Match[] {
  const pools = poolsFromSeedsOrSnake(seeds, poolCount);
  let targetGames: number | null = null;
  if (options.schedule === 'fixed_games') {
    const g = options.gamesPerTeam;
    if (g === null || g < 1) {
      throw new ValidationError('fixed_games mode requires gamesPerTeam >= 1.', {
        gamesPerTeam: g,
      });
    }
    targetGames = g;
  }
  const out: Match[] = [];
  for (const poolSeeds of pools) {
    const label = poolSeeds[0]?.pool ?? null;
    let poolMatches: Match[];
    if (targetGames !== null) {
      // Run enough rounds for each team to reach ~targetGames games. Even
      // pools play one game per team per round (rounds = target); odd pools
      // rotate a bye so they need a few more. Rounds beyond a full
      // round-robin replay matchups (allowRepeats), which is intended.
      const rounds = roundsForTargetGames(poolSeeds.length, targetGames);
      poolMatches = generateRoundRobin(poolSeeds, mkId, rounds, true);
    } else {
      poolMatches = generateRoundRobin(poolSeeds, mkId);
    }
    const stamped = poolMatches.map((m) => ({ ...m, pool: label }));
    if (options.assignWorkTeam) {
      assignIdleWorkTeams(stamped, poolSeeds);
    }
    out.push(...stamped);
  }
  if (
    (options.courtLabels && options.courtLabels.length > 0) ||
    (options.courtsByPool && Object.values(options.courtsByPool).some((l) => l.length > 0))
  ) {
    assignCourtsAndSlots(out, options.courtLabels ?? [], options.courtsByPool ?? {});
  }
  return out;
}

/**
 * Mutates `matches` in place, stamping `workTeamId` on every match whose
 * round has exactly one idle team (the team in the pool that isn't
 * playing in that round). No-op for even-sized pools — every team
 * plays every round, so no idle team exists.
 */
function assignIdleWorkTeams(matches: Match[], poolSeeds: ReadonlyArray<Seed>): void {
  const teamIds = new Set(poolSeeds.map((s) => s.entryId));
  const byRound = new Map<number, Match[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  for (const [, roundMatches] of byRound) {
    const playing = new Set<EntryId>();
    for (const m of roundMatches) {
      if (m.entryAId) playing.add(m.entryAId);
      if (m.entryBId) playing.add(m.entryBId);
    }
    const idle: EntryId[] = [];
    for (const t of teamIds) if (!playing.has(t)) idle.push(t);
    if (idle.length === 1) {
      const work = idle[0]!;
      for (const m of roundMatches) m.workTeamId = work;
    }
  }
}

/**
 * Mutates `matches` in place, assigning each match a 1-indexed `slot`
 * and a `court` label. Implements greedy graph coloring on the conflict
 * graph: two matches conflict (cannot share a slot) when they share any
 * team (`entryAId`, `entryBId`, or `workTeamId`) **or** would land on the
 * same physical court in that slot.
 *
 * Each match's allowed courts come from `courtsByPool[m.pool]` when set,
 * otherwise from the bracket-wide `courtLabels`. A pool with an
 * explicitly empty list is skipped (host opted that pool out of court
 * scheduling). When both lists are empty the function is a no-op.
 *
 * For each match, the lowest-numbered slot that has a free court in
 * the match's allowed set **and** no team conflict is chosen. If no
 * existing slot fits, a new slot is appended — slots are unbounded
 * (slots are time, courts are space). Within a slot, courts are taken
 * from each match's allowed list in order, so disjoint per-pool court
 * sets schedule fully in parallel. See ADR 0018.
 */
export function assignCourtsAndSlots(
  matches: Match[],
  courtLabels: ReadonlyArray<string>,
  courtsByPool: Readonly<Record<string, ReadonlyArray<string>>> = {},
): void {
  const hasAny =
    courtLabels.length > 0 || Object.values(courtsByPool).some((list) => list.length > 0);
  if (!hasAny) return;
  type SlotState = { teams: Set<EntryId>; courts: Set<string> };
  const slots: SlotState[] = [];
  const allowedFor = (m: Match): ReadonlyArray<string> => {
    if (m.pool && Object.prototype.hasOwnProperty.call(courtsByPool, m.pool)) {
      return courtsByPool[m.pool]!;
    }
    return courtLabels;
  };
  for (const m of matches) {
    const allowed = allowedFor(m);
    if (allowed.length === 0) continue;
    const involved: EntryId[] = [];
    if (m.entryAId) involved.push(m.entryAId);
    if (m.entryBId) involved.push(m.entryBId);
    if (m.workTeamId) involved.push(m.workTeamId);
    let assignedSlot = -1;
    let assignedCourt: string | null = null;
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s]!;
      let teamConflict = false;
      for (const t of involved) {
        if (slot.teams.has(t)) {
          teamConflict = true;
          break;
        }
      }
      if (teamConflict) continue;
      let free: string | null = null;
      for (const c of allowed) {
        if (!slot.courts.has(c)) {
          free = c;
          break;
        }
      }
      if (free === null) continue;
      assignedSlot = s;
      assignedCourt = free;
      break;
    }
    if (assignedSlot === -1) {
      slots.push({ teams: new Set<EntryId>(), courts: new Set<string>() });
      assignedSlot = slots.length - 1;
      assignedCourt = allowed[0]!;
    }
    const slot = slots[assignedSlot]!;
    for (const t of involved) slot.teams.add(t);
    slot.courts.add(assignedCourt!);
    m.slot = assignedSlot + 1;
    m.court = assignedCourt;
  }
}

/**
 * Build the playoff (single-elim) matches that follow pool play, from an
 * already-ranked, flat list of advancing entries (overall seed order, 1st
 * overall first). The caller decides the order — auto cross-seeding
 * (`rankAcrossPools`) or a host-edited order (`seedPlayoff`). `entryIds[0]`
 * becomes the #1 seed, so the standard 1-vs-N cross-bracket placement that
 * `generateSingleElimination` applies puts the top two seeds on opposite
 * halves (ADR 0032).
 *
 * `roundOffset` shifts the bracket round numbers so they sort *after*
 * pool-play rounds in the UI.
 *
 * @throws {ValidationError} if fewer than 2 entries are supplied.
 */
export function generatePlayoffFromRanked(
  entryIds: ReadonlyArray<EntryId>,
  mkId: IdFactory,
  roundOffset: number,
): Match[] {
  if (entryIds.length < 2) {
    throw new ValidationError('Playoff needs at least 2 advancing teams.', {
      teamCount: entryIds.length,
    });
  }
  const seeds: Seed[] = entryIds.map((entryId, i) => ({
    entryId,
    seed: i + 1,
    pool: null,
  }));
  const matches = generateSingleElimination(seeds, mkId);
  // Re-stamp wiring with the offset round numbers and final-side label.
  // Returning fresh objects so we don't mutate readonly fields.
  return matches.map((m) => ({
    ...m,
    bracketSide: 'final',
    round: m.round + roundOffset,
  }));
}
