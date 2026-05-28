import type { TeamId } from '../events/volleyball-event.js';
import type { Match, MatchId, Seed } from './match.js';
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
  const teamForSlot = new Map<number, TeamId>();
  for (const s of sorted) teamForSlot.set(s.seed, s.teamId);

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
        teamAId: null,
        teamBId: null,
        winnerTeamId: null,
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
    m.teamAId = teamA;
    m.teamBId = teamB;
    if (teamA && !teamB) {
      m.status = 'bye';
      m.winnerTeamId = teamA;
      placeAdvancedTeam(matchesByRound, m, teamA);
    } else if (teamB && !teamA) {
      m.status = 'bye';
      m.winnerTeamId = teamB;
      placeAdvancedTeam(matchesByRound, m, teamB);
    } else if (!teamA && !teamB) {
      // Phantom-vs-phantom: should not happen with sensible seeding.
      m.status = 'bye';
    }
  }

  for (const r of matchesByRound) matches.push(...r);
  return matches;
}

function placeAdvancedTeam(matchesByRound: Match[][], fromMatch: Match, teamId: TeamId): void {
  if (!fromMatch.advancesToMatchId || !fromMatch.advancesToSlot) return;
  const next = findMatch(matchesByRound, fromMatch.advancesToMatchId);
  if (!next) return;
  if (fromMatch.advancesToSlot === 'a') next.teamAId = teamId;
  else next.teamBId = teamId;
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
 * @throws {ValidationError} if fewer than 2 seeds are supplied or
 *   `maxRounds` is not positive.
 */
export function generateRoundRobin(
  seeds: ReadonlyArray<Seed>,
  mkId: IdFactory,
  maxRounds?: number,
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
  const teams: (TeamId | null)[] = sorted.map((s) => s.teamId);
  if (teams.length % 2 === 1) teams.push(null); // bye marker

  const n = teams.length;
  const fullRounds = n - 1;
  const rounds = maxRounds !== undefined ? Math.min(maxRounds, fullRounds) : fullRounds;
  const half = n / 2;
  const matches: Match[] = [];

  // Fix team 0; rotate the rest.
  let rotation: (TeamId | null)[] = teams.slice(1);
  const fixed = teams[0] ?? null;
  for (let round = 1; round <= rounds; round++) {
    const arrangement: (TeamId | null)[] = [fixed, ...rotation];
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
        teamAId: a,
        teamBId: b,
        winnerTeamId: null,
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
    teamAId: null,
    teamBId: null,
    winnerTeamId: null,
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
  const teamForSlot = new Map<number, TeamId>();
  for (const s of sorted) teamForSlot.set(s.seed, s.teamId);
  const wbR1 = wb[0]!;
  for (let i = 0; i < wbR1.length; i++) {
    const slotA = slots[i * 2];
    const slotB = slots[i * 2 + 1];
    if (slotA === undefined || slotB === undefined) continue;
    const m = wbR1[i]!;
    m.teamAId = teamForSlot.get(slotA) ?? null;
    m.teamBId = teamForSlot.get(slotB) ?? null;
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
      teamId: team.teamId,
      seed: pools[poolIdx]!.length + 1,
      pool: poolLabel(poolIdx),
    });
  }
  return pools;
}

/**
 * Generate pool-play matches: each pool plays an internal round-robin
 * (or a fixed games-per-team truncation thereof).
 *
 * `match.pool` is set to 'A', 'B', ... so the UI can group by pool, and
 * `match.round` follows the per-pool round-robin round number.
 *
 * @throws {ValidationError} propagated from {@link distributeIntoPools}
 *   (bad pool count / too few seeds), or when `schedule === 'fixed_games'`
 *   without a positive `gamesPerTeam`, or when `gamesPerTeam` is greater
 *   than or equal to the smallest pool's team count (use round-robin
 *   instead).
 */
export function generatePoolPlay(
  seeds: ReadonlyArray<Seed>,
  poolCount: number,
  options: {
    schedule: 'round_robin' | 'fixed_games';
    gamesPerTeam: number | null;
  },
  mkId: IdFactory,
): Match[] {
  const pools = distributeIntoPools(seeds, poolCount);
  let maxRounds: number | undefined;
  if (options.schedule === 'fixed_games') {
    const g = options.gamesPerTeam;
    if (g === null || g < 1) {
      throw new ValidationError('fixed_games mode requires gamesPerTeam >= 1.', {
        gamesPerTeam: g,
      });
    }
    const smallestPool = Math.min(...pools.map((p) => p.length));
    if (g >= smallestPool) {
      throw new ValidationError(
        `gamesPerTeam (${g}) must be less than the smallest pool size (${smallestPool}); ` +
          `use round_robin for a full schedule.`,
        { gamesPerTeam: g, smallestPool },
      );
    }
    maxRounds = g;
  }
  const out: Match[] = [];
  for (let i = 0; i < pools.length; i++) {
    const label = poolLabel(i);
    const poolMatches = generateRoundRobin(pools[i]!, mkId, maxRounds);
    for (const m of poolMatches) {
      out.push({ ...m, pool: label });
    }
  }
  return out;
}

/**
 * Build the playoff (single-elim) matches that follow pool play.
 * `advancingPerPool` teams from each pool advance, ordered by their
 * within-pool standings (1st across all pools first, then 2nds, etc.).
 *
 * `roundOffset` shifts the bracket round numbers so they sort *after*
 * pool-play rounds in the UI.
 *
 * @throws {ValidationError} if `advancingPerPool` is less than 1 or any
 *   pool's standings are short of `advancingPerPool` entries.
 */
export function generatePlayoffFromStandings(
  poolStandings: ReadonlyArray<ReadonlyArray<TeamId>>,
  advancingPerPool: number,
  mkId: IdFactory,
  roundOffset: number,
): Match[] {
  if (advancingPerPool < 1)
    throw new ValidationError('Must advance at least 1 per pool.', { advancingPerPool });
  const advancing: TeamId[] = [];
  for (let pos = 0; pos < advancingPerPool; pos++) {
    for (const standings of poolStandings) {
      const t = standings[pos];
      if (!t) {
        throw new ValidationError(
          `Pool standings missing position ${pos + 1}; ` +
            `each pool must have at least ${advancingPerPool} teams.`,
          { advancingPerPool, missingPosition: pos + 1 },
        );
      }
      advancing.push(t);
    }
  }
  const seeds: Seed[] = advancing.map((teamId, i) => ({
    teamId,
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
