import { describe, expect, it } from 'vitest';
import {
  ALLOWED_BEST_OF,
  Bracket,
  DEFAULT_BRACKET_CONFIG,
  assignCourtsAndSlots,
  generateDoubleElimination,
  generatePlayoffFromRanked,
  generatePoolPlay,
  generateRoundRobin,
  rankAcrossPools,
  type BracketId,
  type EntryId,
  type Match,
  type MatchId,
  type PoolStanding,
  type Seed,
} from './index.js';
import type { DivisionId } from '../events/division.js';
import type { EventId, UserId } from '../events/volleyball-event.js';
import { ConflictError, InvariantViolation, ValidationError } from '../shared/result.js';

// ---- Helpers ----------------------------------------------------------

const tid = (n: number): EntryId => `team-${n}` as unknown as EntryId;

function seedTeams(n: number): Seed[] {
  return Array.from({ length: n }, (_, i) => ({
    entryId: tid(i + 1),
    seed: i + 1,
    pool: null,
  }));
}

function mkIdFactory(): () => MatchId {
  let n = 0;
  return () => `m-${++n}` as MatchId;
}

// ---- Bracket.create validation ---------------------------------------

describe('Bracket.create', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  it.each(ALLOWED_BEST_OF.map((n) => [n] as const))('accepts bestOf %i', (bestOf) => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf });
    expect(b.config.bestOf).toBe(bestOf);
  });

  it('rejects bestOf 7', () => {
    expect(() =>
      Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 7 }),
    ).toThrow(ValidationError);
  });

  it('rejects bestOf 2 (even)', () => {
    expect(() =>
      Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 2 }),
    ).toThrow(ValidationError);
  });

  it('defaults poolSchedule to round_robin', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff');
    expect(b.config.poolSchedule).toBe('round_robin');
    expect(b.config.poolGamesPerTeam).toBeNull();
  });

  it('requires poolGamesPerTeam when poolSchedule is fixed_games', () => {
    expect(() =>
      Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
        poolSchedule: 'fixed_games',
        poolGamesPerTeam: null,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
        poolSchedule: 'fixed_games',
        poolGamesPerTeam: 0,
      }),
    ).toThrow(ValidationError);
  });

  it('accepts fixed_games with poolGamesPerTeam >= 1', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      poolSchedule: 'fixed_games',
      poolGamesPerTeam: 3,
    });
    expect(b.config.poolSchedule).toBe('fixed_games');
    expect(b.config.poolGamesPerTeam).toBe(3);
  });
});

// ---- Bracket.createStandalone (ADR 0025) -----------------------------

describe('Bracket.createStandalone', () => {
  const ownerUserId = 'owner-1' as UserId;
  const bracketId = 'bracket-std-1' as BracketId;

  it('owns the bracket with null event/division scope', () => {
    const b = Bracket.createStandalone(bracketId, ownerUserId, 'single_elimination');
    expect(b.ownerUserId).toBe(ownerUserId);
    expect(b.eventId).toBeNull();
    expect(b.divisionId).toBeNull();
    expect(b.status).toBe('setup');
  });

  it('applies the same create-time validation as create()', () => {
    expect(() =>
      Bracket.createStandalone(bracketId, ownerUserId, 'single_elimination', { bestOf: 2 }),
    ).toThrow(ValidationError);
    expect(() =>
      Bracket.createStandalone(bracketId, ownerUserId, 'pool_play_playoff', {
        poolSchedule: 'fixed_games',
        poolGamesPerTeam: null,
      }),
    ).toThrow(ValidationError);
  });

  it('runs the full lifecycle identically to an event bracket (scope is inert)', () => {
    // Same format/seeds/idFactory through both scopes must produce the same
    // generated match graph — proving the aggregate logic never reads scope.
    const seeds = seedTeams(4).map((s) => s.entryId);

    const std = Bracket.createStandalone(bracketId, ownerUserId, 'single_elimination');
    std.seedTeams(seeds);
    std.generate(mkIdFactory());
    // ADR 0032: generate lands in `draft`; publish to go live before scoring.
    expect(std.status).toBe('draft');
    std.publish();

    const evt = Bracket.create(
      'bracket-evt-1' as BracketId,
      'event-1' as EventId,
      'division-1' as DivisionId,
      'single_elimination',
    );
    evt.seedTeams(seeds);
    evt.generate(mkIdFactory());

    expect(std.matches.length).toBe(evt.matches.length);
    expect(std.status).toBe('active');

    // And a result records + advances on the standalone bracket (best-of-3
    // default → two sets to take the match).
    const first = std.matches.find((m) => m.entryAId && m.entryBId)!;
    std.recordResult({
      matchId: first.id,
      sets: [
        { setNumber: 1, teamAScore: 25, teamBScore: 10 },
        { setNumber: 2, teamAScore: 25, teamBScore: 12 },
      ],
    });
    const recorded = std.matches.find((m) => m.id === first.id)!;
    expect(recorded.status).toBe('completed');
    expect(recorded.winnerEntryId).toBe(first.entryAId);
  });
});

// ---- Double elimination — loser advancement -------------------------

describe('double elimination — losers bracket advancement', () => {
  it('drops losers into the losers bracket so the whole graph plays out', () => {
    // Regression: applyAdvancement used to place only the winner, never the
    // loser, so a double-elim degenerated into a single-elim — the losers
    // bracket + grand final never received teams and stayed unplayable.
    const seeds = seedTeams(4).map((s) => s.entryId);
    const b = Bracket.create(
      'bracket-de' as BracketId,
      'event-de' as EventId,
      'division-de' as DivisionId,
      'double_elimination',
      { bestOf: 1 }, // one set decides → entryA (top row) always wins
    );
    b.seedTeams(seeds);
    b.generate(mkIdFactory());
    b.publish();
    expect(b.status).toBe('active');

    // Record every currently-playable match (entryA always wins) until none
    // remain. With loser advancement working, recording the winners-bracket
    // matches drops teams into the losers bracket, which then becomes playable.
    let recorded = 0;
    for (let i = 0; i < 24; i++) {
      const next = b.matches.find(
        (m) => m.status !== 'completed' && m.status !== 'bye' && m.entryAId && m.entryBId,
      );
      if (!next) break;
      b.recordResult({
        matchId: next.id,
        sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }],
      });
      recorded += 1;
    }

    // A 4-team single-elim plays exactly 3 matches; double-elim must play more
    // (2 WB semis + WB final + ≥1 LB match + grand final). Pre-fix this stopped
    // at 3 because the losers bracket never filled.
    expect(recorded).toBeGreaterThan(3);
    // At least one losers-bracket match actually played.
    expect(b.matches.some((m) => m.bracketSide === 'losers' && m.status === 'completed')).toBe(
      true,
    );
    // Every non-bye match resolved → the bracket completes.
    expect(b.status).toBe('completed');
  });

  it('reverting a winners-bracket result also pulls the loser back out of the losers bracket', () => {
    const seeds = seedTeams(4).map((s) => s.entryId);
    const b = Bracket.create(
      'bracket-de2' as BracketId,
      'event-de2' as EventId,
      'division-de2' as DivisionId,
      'double_elimination',
      { bestOf: 1 },
    );
    b.seedTeams(seeds);
    b.generate(mkIdFactory());
    b.publish();

    // Record both winners-bracket semifinals → both losers drop into the LB.
    const semis = b.matches.filter(
      (m) => m.bracketSide === 'winners' && m.entryAId && m.entryBId && m.status !== 'bye',
    );
    for (const sf of semis.slice(0, 2)) {
      b.recordResult({ matchId: sf.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    }
    const lbMatch = b.matches.find((m) => m.bracketSide === 'losers' && m.entryAId && m.entryBId);
    expect(lbMatch, 'an LB match should be playable after both semis').toBeTruthy();

    // Reset one semifinal → its loser must be pulled back out of the LB match.
    const droppedLoser =
      semis[0]!.winnerEntryId === semis[0]!.entryAId ? semis[0]!.entryBId : semis[0]!.entryAId;
    b.resetMatch(semis[0]!.id);
    const lbAfter = b.matches.find((m) => m.id === lbMatch!.id)!;
    expect(lbAfter.entryAId === droppedLoser || lbAfter.entryBId === droppedLoser).toBe(false);
  });
});

// ---- Double elimination — non-power-of-two byes + reset final -------

describe('double elimination — non-power-of-two fields (byes)', () => {
  const eventId = 'event-de-bye' as EventId;
  const divisionId = 'division-de-bye' as DivisionId;

  it('generates a 6-team double elim with two WB-R1 byes and a reset final (no power-of-two throw)', () => {
    const matches = generateDoubleElimination(seedTeams(6), mkIdFactory());
    const wbR1Byes = matches.filter(
      (m) => m.bracketSide === 'winners' && m.round === 1 && m.status === 'bye',
    );
    expect(wbR1Byes.length).toBe(2); // P=8, 4 WB-R1 matches, 6 teams → 2 byes
    // Grand final + reset are both `final`.
    expect(matches.filter((m) => m.bracketSide === 'final').length).toBe(2);
    // Pruning left no LB match with a permanently-empty slot: every surviving LB
    // match is either fed by two live sources or is a real R1 with two seeds.
  });

  for (const n of [5, 6, 7]) {
    it(`an ${n}-team double elim plays through to a single champion (top seed wins out)`, () => {
      const b = Bracket.create(
        `bracket-de-${n}` as BracketId,
        eventId,
        divisionId,
        'double_elimination',
        { bestOf: 1 }, // one set decides; entryA (top row) always wins
      );
      b.seedTeams(seedTeams(n).map((s) => s.entryId));
      b.generate(mkIdFactory());
      b.publish();

      // Record every playable match (entryA always wins) until none remain. If
      // bye pruning left an unreachable match, this stalls and the status
      // assertion below fails.
      for (let i = 0; i < 200; i++) {
        const next = b.matches.find(
          (m) => m.status !== 'completed' && m.status !== 'bye' && m.entryAId && m.entryBId,
        );
        if (!next) break;
        b.recordResult({
          matchId: next.id,
          sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }],
        });
      }

      // Whole graph resolved.
      expect(b.matches.every((m) => m.status === 'completed' || m.status === 'bye')).toBe(true);
      expect(b.status).toBe('completed');
      // Every completed match actually had two real teams (no orphan TBD slot).
      for (const m of b.matches) {
        if (m.status === 'completed') expect(!!(m.entryAId && m.entryBId)).toBe(true);
      }
      // A single champion: the winner of the highest-round completed final.
      const finals = b.matches
        .filter((m) => m.bracketSide === 'final' && m.status === 'completed')
        .sort((x, y) => y.round - x.round);
      expect(finals[0]?.winnerEntryId).toBeTruthy();
    });
  }
});

describe('double elimination — reset grand final', () => {
  const recordWinner = (b: Bracket, m: Match, side: 'a' | 'b') =>
    b.recordResult({
      matchId: m.id,
      sets: [
        { setNumber: 1, teamAScore: side === 'a' ? 25 : 10, teamBScore: side === 'a' ? 10 : 25 },
      ],
    });

  it('voids the reset when the winners-bracket team wins the grand final', () => {
    const b = Bracket.create(
      'bracket-de-noreset' as BracketId,
      'event-x' as EventId,
      'division-x' as DivisionId,
      'double_elimination',
      { bestOf: 1 },
    );
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(mkIdFactory());
    b.publish();
    // Play everything (entryA wins) — the WB team also wins the grand final.
    for (let i = 0; i < 50; i++) {
      const next = b.matches.find(
        (m) => m.status !== 'completed' && m.status !== 'bye' && m.entryAId && m.entryBId,
      );
      if (!next) break;
      recordWinner(b, next, 'a');
    }
    expect(b.status).toBe('completed');
    const finals = b.matches.filter((m) => m.bracketSide === 'final');
    const reset = finals.sort((x, y) => y.round - x.round)[0]!;
    expect(reset.status).toBe('bye'); // voided
    expect(reset.entryAId).toBeNull();
  });

  it('forces a deciding reset when the losers-bracket team wins the grand final', () => {
    const b = Bracket.create(
      'bracket-de-reset' as BracketId,
      'event-y' as EventId,
      'division-y' as DivisionId,
      'double_elimination',
      { bestOf: 1 },
    );
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(mkIdFactory());
    b.publish();

    // Play every non-final match (entryA wins) so only the grand final remains.
    for (let i = 0; i < 50; i++) {
      const next = b.matches.find(
        (m) =>
          m.status !== 'completed' &&
          m.status !== 'bye' &&
          m.entryAId &&
          m.entryBId &&
          m.bracketSide !== 'final',
      );
      if (!next) break;
      recordWinner(b, next, 'a');
    }
    const gf = b.matches.find(
      (m) => m.bracketSide === 'final' && m.status !== 'completed' && m.entryAId && m.entryBId,
    )!;
    expect(gf).toBeTruthy();

    // The losers-bracket team (slot b) wins the grand final → reset required.
    recordWinner(b, gf, 'b');
    expect(b.status).not.toBe('completed');
    const reset = b.matches.find((m) => m.bracketSide === 'final' && m.id !== gf.id)!;
    expect(reset.status).toBe('pending');
    expect(!!(reset.entryAId && reset.entryBId)).toBe(true);

    // Reverting the grand final (still active) pulls the reset back to a clean
    // slate — it's a conditional game that only exists once the LB side wins.
    b.resetMatch(gf.id);
    const resetReverted = b.matches.find((m) => m.id === reset.id)!;
    expect(resetReverted.entryAId).toBeNull();
    expect(resetReverted.entryBId).toBeNull();
    expect(resetReverted.status).toBe('pending');

    // Re-decide the grand final the same way, then play the reset → the bracket
    // completes with the reset's winner as champion.
    recordWinner(b, b.matches.find((m) => m.id === gf.id)!, 'b');
    const resetLive = b.matches.find((m) => m.id === reset.id)!;
    expect(!!(resetLive.entryAId && resetLive.entryBId)).toBe(true);
    recordWinner(b, resetLive, 'a');
    expect(b.status).toBe('completed');
    expect(resetLive.winnerEntryId).toBeTruthy();
  });
});

// ---- Playoff re-seed (host override of the auto cross-seed) ---------

describe('Bracket.seedPlayoff (host re-seed override)', () => {
  it('rebuilds the playoff from a host-chosen order, placing the new #1 seed on top', () => {
    // One shared id factory across the whole lifecycle so match ids stay unique
    // (the real repo uses UUIDs).
    const ids = mkIdFactory();
    const b = Bracket.create(
      'b-seed-playoff' as BracketId,
      'event-sp' as EventId,
      'division-sp' as DivisionId,
      'pool_play_playoff',
      { bestOf: 1, poolCount: 2, advancePerPool: 2 },
    );
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(ids);
    b.publish();
    // Complete pool play so the playoff can be generated.
    for (let i = 0; i < 20; i++) {
      const pm = b.matches.find(
        (m) => m.pool !== null && m.status === 'pending' && m.entryAId && m.entryBId,
      );
      if (!pm) break;
      b.recordResult({ matchId: pm.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    }
    b.generatePlayoff(ids);
    const before = b.matches.filter((m) => m.bracketSide === 'final').length;
    expect(before).toBeGreaterThan(0);

    // Re-seed with an explicit overall order (all four advance from 2×2).
    b.seedPlayoff(ids, [tid(4), tid(3), tid(2), tid(1)]);
    const finals = b.matches.filter((m) => m.bracketSide === 'final');
    expect(finals.length).toBe(before); // same shape, rebuilt
    const minRound = Math.min(...finals.map((m) => m.round));
    const topMatch = finals
      .filter((m) => m.round === minRound)
      .sort((x, y) => x.matchNumber - y.matchNumber)[0]!;
    expect(topMatch.entryAId).toBe(tid(4)); // chosen #1 seed lands in the top slot
  });

  it('rejects a re-seed once a playoff match has started', () => {
    const ids = mkIdFactory();
    const b = Bracket.create(
      'b-seed-playoff-2' as BracketId,
      'event-sp2' as EventId,
      'division-sp2' as DivisionId,
      'pool_play_playoff',
      { bestOf: 1, poolCount: 2, advancePerPool: 2 },
    );
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(ids);
    b.publish();
    for (let i = 0; i < 20; i++) {
      const pm = b.matches.find(
        (m) => m.pool !== null && m.status === 'pending' && m.entryAId && m.entryBId,
      );
      if (!pm) break;
      b.recordResult({ matchId: pm.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    }
    b.generatePlayoff(ids);
    // Start a playoff match.
    const pf = b.matches.find(
      (m) => m.bracketSide === 'final' && m.status === 'pending' && m.entryAId && m.entryBId,
    )!;
    b.recordResult({ matchId: pf.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    expect(() => b.seedPlayoff(ids, [tid(1), tid(2), tid(3), tid(4)])).toThrow(ConflictError);
  });
});

describe('Bracket.generate (single pool → playoff)', () => {
  it('runs one round-robin pool, then a playoff of the top finishers', () => {
    // The host can configure a single pool (poolCount: 1): everyone plays one
    // round-robin, then the top `advancePerPool` advance to a single-elim
    // playoff. Regression guard for the create path that enables poolCount: 1.
    const ids = mkIdFactory();
    const b = Bracket.create(
      'b-single-pool' as BracketId,
      'event-sp1' as EventId,
      'division-sp1' as DivisionId,
      'pool_play_playoff',
      { bestOf: 1, poolCount: 1, advancePerPool: 2 },
    );
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(ids);
    // Single pool ⇒ every generated pool match shares one pool label.
    const poolMatches = b.matches.filter((m) => m.pool !== null);
    expect(poolMatches.length).toBeGreaterThan(0);
    expect(new Set(poolMatches.map((m) => m.pool)).size).toBe(1);
    expect(b.matches.some((m) => m.bracketSide === 'final')).toBe(false);

    b.publish();
    for (let i = 0; i < 20; i++) {
      const pm = b.matches.find(
        (m) => m.pool !== null && m.status === 'pending' && m.entryAId && m.entryBId,
      );
      if (!pm) break;
      b.recordResult({ matchId: pm.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    }
    b.generatePlayoff(ids);
    // Top 2 of the single pool → a 1-match final.
    const finals = b.matches.filter((m) => m.bracketSide === 'final');
    expect(finals.length).toBe(1);
  });
});

// ---- DEFAULT_BRACKET_CONFIG -----------------------------------------

describe('DEFAULT_BRACKET_CONFIG', () => {
  it('keeps existing rows backward-compatible', () => {
    expect(DEFAULT_BRACKET_CONFIG.bestOf).toBe(3);
    expect(DEFAULT_BRACKET_CONFIG.poolSchedule).toBe('round_robin');
    expect(DEFAULT_BRACKET_CONFIG.poolGamesPerTeam).toBeNull();
  });
});

// ---- generateRoundRobin with maxRounds -------------------------------

describe('generateRoundRobin', () => {
  it('produces n*(n-1)/2 matches for even n with no cap', () => {
    const seeds = seedTeams(4);
    const matches = generateRoundRobin(seeds, mkIdFactory());
    expect(matches).toHaveLength(6);
  });

  it('produces n*(n-1)/2 matches for odd n with no cap (byes skipped)', () => {
    const seeds = seedTeams(5);
    const matches = generateRoundRobin(seeds, mkIdFactory());
    // 5 teams, full RR = 10 matches; circle-method has 5 rounds × 2 real + 1 bye.
    expect(matches).toHaveLength(10);
  });

  it('truncates to maxRounds when supplied', () => {
    // 4 teams: full RR = 3 rounds × 2 matches = 6. maxRounds=2 → 4 matches.
    const matches = generateRoundRobin(seedTeams(4), mkIdFactory(), 2);
    expect(matches).toHaveLength(4);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds).toEqual(new Set([1, 2]));
  });

  it('caps maxRounds at full schedule when oversized', () => {
    // 4 teams: full RR = 3 rounds. Asking for 99 should give 3.
    const matches = generateRoundRobin(seedTeams(4), mkIdFactory(), 99);
    expect(matches).toHaveLength(6);
  });

  it('each team plays at most maxRounds opponents', () => {
    const seeds = seedTeams(6);
    const matches = generateRoundRobin(seeds, mkIdFactory(), 2);
    const counts = new Map<string, number>();
    for (const m of matches) {
      for (const t of [m.entryAId, m.entryBId]) {
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(2);
  });

  it('rejects maxRounds < 1', () => {
    expect(() => generateRoundRobin(seedTeams(4), mkIdFactory(), 0)).toThrow(ValidationError);
  });
});

// ---- generatePoolPlay schedule modes --------------------------------

describe('generatePoolPlay', () => {
  it('round_robin: full schedule per pool', () => {
    // 8 teams in 2 pools (4 each) → 6 matches × 2 = 12.
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      { schedule: 'round_robin', gamesPerTeam: null },
      mkIdFactory(),
    );
    expect(matches).toHaveLength(12);
    const poolA = matches.filter((m) => m.pool === 'A');
    const poolB = matches.filter((m) => m.pool === 'B');
    expect(poolA).toHaveLength(6);
    expect(poolB).toHaveLength(6);
  });

  it('fixed_games: each team plays exactly N opponents', () => {
    // 12 teams in 3 pools (4 each), 2 games per team.
    // Per pool: 4 teams × 2 games / 2 = 4 matches. Total = 12.
    const matches = generatePoolPlay(
      seedTeams(12),
      3,
      { schedule: 'fixed_games', gamesPerTeam: 2 },
      mkIdFactory(),
    );
    expect(matches).toHaveLength(12);

    // Each team appears in exactly 2 matches.
    const counts = new Map<string, number>();
    for (const m of matches) {
      for (const t of [m.entryAId, m.entryBId]) {
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(12);
    for (const c of counts.values()) expect(c).toBe(2);
  });

  it('fixed_games: repeats opponents to reach the target in small pools (ADR 0032)', () => {
    // 6 teams in 2 pools (3 each). A target of 3 games/team exceeds a 3-team
    // full round-robin (2 games), so opponents repeat to top up — this used to
    // throw; ADR 0032 makes it the rec "everyone plays ~N games" behavior.
    const matches = generatePoolPlay(
      seedTeams(6),
      2,
      { schedule: 'fixed_games', gamesPerTeam: 3 },
      mkIdFactory(),
    );
    const counts = new Map<string, number>();
    for (const m of matches) {
      for (const t of [m.entryAId, m.entryBId]) {
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(6);
    // Everyone gets at least the target number of games.
    for (const c of counts.values()) expect(c).toBeGreaterThanOrEqual(3);
    // A repeat must exist — some pairing appears more than once within a pool.
    const pairCounts = new Map<string, number>();
    for (const m of matches) {
      const key = `${m.pool}|${[m.entryAId, m.entryBId].sort().join('-')}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    expect([...pairCounts.values()].some((n) => n > 1)).toBe(true);
  });

  it('fixed_games: rejects gamesPerTeam < 1', () => {
    expect(() =>
      generatePoolPlay(
        seedTeams(8),
        2,
        { schedule: 'fixed_games', gamesPerTeam: 0 },
        mkIdFactory(),
      ),
    ).toThrow(ValidationError);
  });

  it('fixed_games: rejects null gamesPerTeam', () => {
    expect(() =>
      generatePoolPlay(
        seedTeams(8),
        2,
        { schedule: 'fixed_games', gamesPerTeam: null },
        mkIdFactory(),
      ),
    ).toThrow(ValidationError);
  });

  it('no team appears twice in the same round of the same pool', () => {
    const matches = generatePoolPlay(
      seedTeams(12),
      3,
      { schedule: 'fixed_games', gamesPerTeam: 3 },
      mkIdFactory(),
    );
    const seen = new Map<string, Set<string>>(); // key: pool|round, teams
    for (const m of matches) {
      const key = `${m.pool}|${m.round}`;
      const set = seen.get(key) ?? new Set<string>();
      for (const t of [m.entryAId, m.entryBId]) {
        if (t) {
          expect(set.has(t)).toBe(false);
          set.add(t);
        }
      }
      seen.set(key, set);
    }
  });

  // ---- Phase 2: work / ref team assignment ---------------------------

  it('does not assign work teams when assignWorkTeam is false', () => {
    const matches = generatePoolPlay(
      seedTeams(10),
      2,
      { schedule: 'round_robin', gamesPerTeam: null },
      mkIdFactory(),
    );
    for (const m of matches) expect(m.workTeamId).toBeNull();
  });

  it('assigns the idle team as work team in odd-sized pools', () => {
    // 10 teams / 2 pools = 5-team pools (odd → one idle team per round).
    const matches = generatePoolPlay(
      seedTeams(10),
      2,
      { schedule: 'round_robin', gamesPerTeam: null, assignWorkTeam: true },
      mkIdFactory(),
    );
    // Every match should have a work team set.
    for (const m of matches) {
      expect(m.workTeamId).not.toBeNull();
      // Work team must not also be playing the match.
      expect(m.workTeamId).not.toBe(m.entryAId);
      expect(m.workTeamId).not.toBe(m.entryBId);
    }
    // Per (pool, round), the work team is the same on every match in that round.
    const seen = new Map<string, string>();
    for (const m of matches) {
      const key = `${m.pool}|${m.round}`;
      const prev = seen.get(key);
      if (prev) expect(m.workTeamId).toBe(prev);
      else if (m.workTeamId) seen.set(key, m.workTeamId);
    }
  });

  it('leaves work team null in even-sized pools (no idle team)', () => {
    // 8 teams / 2 pools = 4-team pools (even → no idle team per round).
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      { schedule: 'round_robin', gamesPerTeam: null, assignWorkTeam: true },
      mkIdFactory(),
    );
    for (const m of matches) expect(m.workTeamId).toBeNull();
  });

  it('assigns work team in fixed_games mode too', () => {
    // 10 teams / 2 pools = 5-team pools. fixed_games=2.
    const matches = generatePoolPlay(
      seedTeams(10),
      2,
      { schedule: 'fixed_games', gamesPerTeam: 2, assignWorkTeam: true },
      mkIdFactory(),
    );
    for (const m of matches) {
      expect(m.workTeamId).not.toBeNull();
      expect(m.workTeamId).not.toBe(m.entryAId);
      expect(m.workTeamId).not.toBe(m.entryBId);
    }
  });
});

// ---- Bracket.create requireWorkTeam default -------------------------

describe('Bracket.create requireWorkTeam', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  it('defaults requireWorkTeam to false', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff');
    expect(b.config.requireWorkTeam).toBe(false);
  });

  it('accepts requireWorkTeam = true', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      requireWorkTeam: true,
    });
    expect(b.config.requireWorkTeam).toBe(true);
  });
});

// ---- Phase 3: courts + parallel-slot solver -------------------------

describe('assignCourtsAndSlots', () => {
  it('is a no-op when courtLabels is empty', () => {
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      { schedule: 'round_robin', gamesPerTeam: null },
      mkIdFactory(),
    );
    assignCourtsAndSlots(matches, []);
    for (const m of matches) {
      expect(m.court).toBeNull();
      expect(m.slot).toBeNull();
    }
  });

  it('never puts the same team in two matches in the same slot', () => {
    const matches = generatePoolPlay(
      seedTeams(12),
      3,
      { schedule: 'round_robin', gamesPerTeam: null, courtLabels: ['C1', 'C2'] },
      mkIdFactory(),
    );
    // Group by slot, check team uniqueness.
    const bySlot = new Map<number, Match[]>();
    for (const m of matches) {
      expect(m.slot).not.toBeNull();
      const list = bySlot.get(m.slot!) ?? [];
      list.push(m);
      bySlot.set(m.slot!, list);
    }
    for (const [, list] of bySlot) {
      const teams = new Set<string>();
      for (const m of list) {
        for (const t of [m.entryAId, m.entryBId]) {
          if (t) {
            expect(teams.has(t)).toBe(false);
            teams.add(t);
          }
        }
      }
    }
  });

  it('respects court count: no slot has more matches than courts', () => {
    const matches = generatePoolPlay(
      seedTeams(12),
      3,
      { schedule: 'round_robin', gamesPerTeam: null, courtLabels: ['C1', 'C2'] },
      mkIdFactory(),
    );
    const countsBySlot = new Map<number, number>();
    for (const m of matches) {
      countsBySlot.set(m.slot!, (countsBySlot.get(m.slot!) ?? 0) + 1);
    }
    for (const [, n] of countsBySlot) expect(n).toBeLessThanOrEqual(2);
  });

  it('assigns court labels from the provided list', () => {
    const labels = ['Court A', 'Court B'];
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      { schedule: 'round_robin', gamesPerTeam: null, courtLabels: labels },
      mkIdFactory(),
    );
    for (const m of matches) expect(labels).toContain(m.court);
  });

  it('treats workTeamId as a slot conflict', () => {
    // 6 teams / 2 pools = 3-team pools. Odd → one idle team per round.
    const matches = generatePoolPlay(
      seedTeams(6),
      2,
      {
        schedule: 'round_robin',
        gamesPerTeam: null,
        assignWorkTeam: true,
        courtLabels: ['C1', 'C2'],
      },
      mkIdFactory(),
    );
    const bySlot = new Map<number, Match[]>();
    for (const m of matches) {
      const list = bySlot.get(m.slot!) ?? [];
      list.push(m);
      bySlot.set(m.slot!, list);
    }
    for (const [, list] of bySlot) {
      const involved = new Set<string>();
      for (const m of list) {
        for (const t of [m.entryAId, m.entryBId, m.workTeamId]) {
          if (t) {
            expect(involved.has(t)).toBe(false);
            involved.add(t);
          }
        }
      }
    }
  });
});

// ---- Bracket.create courtLabels default -----------------------------

describe('Bracket.create courtLabels', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  it('defaults courtLabels to empty', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff');
    expect(b.config.courtLabels).toEqual([]);
  });

  it('accepts a courtLabels list', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      courtLabels: ['Court 1', 'Court 2'],
    });
    expect(b.config.courtLabels).toEqual(['Court 1', 'Court 2']);
  });

  it('defaults courtsByPool to empty', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff');
    expect(b.config.courtsByPool).toEqual({});
  });

  it('accepts a courtsByPool map', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      courtsByPool: { A: ['Court 1', 'Court 2'], B: ['Court 3'] },
    });
    expect(b.config.courtsByPool).toEqual({ A: ['Court 1', 'Court 2'], B: ['Court 3'] });
  });
});

// ---- Per-pool advance feasibility (TT-16) ---------------------------

describe('pool-play per-pool advance feasibility (TT-16)', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  const unevenSeeds = (): Seed[] => [
    { entryId: tid(1), seed: 1, pool: 'A' },
    { entryId: tid(2), seed: 2, pool: 'A' },
    { entryId: tid(3), seed: 3, pool: 'B' },
    { entryId: tid(4), seed: 4, pool: 'B' },
    { entryId: tid(5), seed: 5, pool: 'B' },
    { entryId: tid(6), seed: 6, pool: 'B' },
  ];

  it('generatePoolPlay rejects a hand-assigned pool smaller than advancePerPool, naming it', () => {
    expect(() =>
      generatePoolPlay(
        unevenSeeds(),
        2,
        { schedule: 'round_robin', gamesPerTeam: null, minAdvancePerPool: 3 },
        mkIdFactory(),
      ),
    ).toThrow(/Pool A has 2 team/);
  });

  it('generatePoolPlay allows pools that all meet advancePerPool', () => {
    const even: Seed[] = [
      { entryId: tid(1), seed: 1, pool: 'A' },
      { entryId: tid(2), seed: 2, pool: 'A' },
      { entryId: tid(3), seed: 3, pool: 'A' },
      { entryId: tid(4), seed: 4, pool: 'B' },
      { entryId: tid(5), seed: 5, pool: 'B' },
      { entryId: tid(6), seed: 6, pool: 'B' },
    ];
    expect(() =>
      generatePoolPlay(
        even,
        2,
        { schedule: 'round_robin', gamesPerTeam: null, minAdvancePerPool: 3 },
        mkIdFactory(),
      ),
    ).not.toThrow();
  });

  it('generate() rejects a too-small hand-assigned pool even when the global count passes', () => {
    // 6 teams, 2 pools advancing 3 → global guard (6 ≥ 2×3) passes, but the
    // hand-assigned A:2 / B:4 split leaves A short.
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      advancePerPool: 3,
    });
    b.seedTeams([tid(1), tid(2), tid(3), tid(4), tid(5), tid(6)]);
    b.setPools(unevenSeeds().map((s) => ({ entryId: s.entryId, pool: s.pool })));
    expect(() => b.generate(mkIdFactory())).toThrow(/Pool A/);
  });
});

// ---- Per-pool courts -----------------------------------------------

describe('assignCourtsAndSlots courtsByPool', () => {
  it('uses the per-pool court list in place of the bracket-wide list', () => {
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      {
        schedule: 'round_robin',
        gamesPerTeam: null,
        courtLabels: ['Default'],
        courtsByPool: { A: ['A-Court'], B: ['B-Court'] },
      },
      mkIdFactory(),
    );
    for (const m of matches) {
      if (m.pool === 'A') expect(m.court).toBe('A-Court');
      else if (m.pool === 'B') expect(m.court).toBe('B-Court');
    }
  });

  it('falls back to bracket-wide courtLabels for pools without an override', () => {
    const matches = generatePoolPlay(
      seedTeams(12),
      3,
      {
        schedule: 'round_robin',
        gamesPerTeam: null,
        courtLabels: ['Fallback'],
        courtsByPool: { A: ['A-Only'] },
      },
      mkIdFactory(),
    );
    for (const m of matches) {
      if (m.pool === 'A') expect(m.court).toBe('A-Only');
      else expect(m.court).toBe('Fallback');
    }
  });

  it('skips a pool when courtsByPool maps it to an empty list', () => {
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      {
        schedule: 'round_robin',
        gamesPerTeam: null,
        courtLabels: ['C1'],
        courtsByPool: { B: [] },
      },
      mkIdFactory(),
    );
    for (const m of matches) {
      if (m.pool === 'B') {
        expect(m.court).toBeNull();
        expect(m.slot).toBeNull();
      } else {
        expect(m.court).toBe('C1');
        expect(m.slot).not.toBeNull();
      }
    }
  });

  it('schedules pools with disjoint court sets fully in parallel', () => {
    // 2 pools of 4, each with two disjoint courts. A 4-team round-robin
    // has 3 rounds × 2 matches = 6 matches; two courts per pool fit
    // those into 3 slots. Disjoint per-pool courts mean both pools
    // share the same 3 slots → total slots == 3.
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      {
        schedule: 'round_robin',
        gamesPerTeam: null,
        courtsByPool: { A: ['A1', 'A2'], B: ['B1', 'B2'] },
      },
      mkIdFactory(),
    );
    const bySlot = new Map<number, Match[]>();
    for (const m of matches) {
      const list = bySlot.get(m.slot!) ?? [];
      list.push(m);
      bySlot.set(m.slot!, list);
    }
    // Every slot must use each court at most once.
    for (const [, list] of bySlot) {
      const courts = new Set<string>();
      for (const m of list) {
        expect(courts.has(m.court!)).toBe(false);
        courts.add(m.court!);
      }
    }
    expect(bySlot.size).toBe(3);
  });

  it('shares slots correctly when pools share a court', () => {
    // Pool A on [C1, C2], Pool B on [C2, C3]. C2 is the shared court —
    // no slot may use it for both pools at once, but C1 and C3 can run
    // concurrently with C2.
    const matches = generatePoolPlay(
      seedTeams(8),
      2,
      {
        schedule: 'round_robin',
        gamesPerTeam: null,
        courtsByPool: { A: ['C1', 'C2'], B: ['C2', 'C3'] },
      },
      mkIdFactory(),
    );
    const bySlot = new Map<number, Match[]>();
    for (const m of matches) {
      const list = bySlot.get(m.slot!) ?? [];
      list.push(m);
      bySlot.set(m.slot!, list);
    }
    for (const [, list] of bySlot) {
      const courts = new Set<string>();
      for (const m of list) {
        expect(courts.has(m.court!)).toBe(false);
        courts.add(m.court!);
        // Court must be from the match's allowed list.
        if (m.pool === 'A') expect(['C1', 'C2']).toContain(m.court);
        else if (m.pool === 'B') expect(['C2', 'C3']).toContain(m.court);
      }
    }
  });
});

// ---- Phase 1b: reorderPoolMatches ----------------------------------

describe('Bracket.reorderPoolMatches', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  function setupPoolPlay(opts: { courtLabels?: string[] } = {}): Bracket {
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      bestOf: 1,
      ...(opts.courtLabels ? { courtLabels: opts.courtLabels } : {}),
    });
    b.seedTeams(seedTeams(6).map((s) => s.entryId));
    b.generate(mkIdFactory());
    return b;
  }

  it('renumbers matches 1..N in the new order', () => {
    const b = setupPoolPlay();
    const poolA = b.matches.filter((m) => m.pool === 'A');
    expect(poolA.length).toBeGreaterThan(1);
    const reversed = poolA
      .slice()
      .sort((a, x) => a.matchNumber - x.matchNumber)
      .reverse()
      .map((m) => m.id);
    b.reorderPoolMatches('A', reversed);
    const afterA = b.matches
      .filter((m) => m.pool === 'A')
      .sort((a, x) => a.matchNumber - x.matchNumber);
    for (let i = 0; i < afterA.length; i++) {
      expect(afterA[i]!.matchNumber).toBe(i + 1);
      expect(afterA[i]!.id).toBe(reversed[i]);
    }
  });

  it('does not change opponents', () => {
    const b = setupPoolPlay();
    const before = new Map(
      b.matches.filter((m) => m.pool === 'A').map((m) => [String(m.id), [m.entryAId, m.entryBId]]),
    );
    const reversed = b.matches
      .filter((m) => m.pool === 'A')
      .sort((a, x) => a.matchNumber - x.matchNumber)
      .reverse()
      .map((m) => m.id);
    b.reorderPoolMatches('A', reversed);
    for (const m of b.matches.filter((m) => m.pool === 'A')) {
      const orig = before.get(String(m.id))!;
      expect([m.entryAId, m.entryBId]).toEqual(orig);
    }
  });

  it('re-runs the slot solver when courtLabels is set', () => {
    const b = setupPoolPlay({ courtLabels: ['C1', 'C2'] });
    const poolA = b.matches.filter((m) => m.pool === 'A');
    const reversed = poolA
      .slice()
      .sort((a, x) => a.matchNumber - x.matchNumber)
      .reverse()
      .map((m) => m.id);
    b.reorderPoolMatches('A', reversed);
    // Every pool match still has a slot/court assigned and no team appears
    // twice in the same slot.
    const bySlot = new Map<number, typeof b.matches>();
    for (const m of b.matches.filter((x) => x.pool !== null)) {
      expect(m.slot).not.toBeNull();
      expect(m.court).not.toBeNull();
      const list = (bySlot.get(m.slot!) ?? []) as typeof b.matches;
      bySlot.set(m.slot!, [...list, m]);
    }
    for (const [, list] of bySlot) {
      const teams = new Set<string>();
      for (const m of list) {
        for (const t of [m.entryAId, m.entryBId]) {
          if (t) {
            expect(teams.has(t)).toBe(false);
            teams.add(t);
          }
        }
      }
    }
  });

  it('rejects reorder when newOrder length mismatches', () => {
    const b = setupPoolPlay();
    const poolA = b.matches.filter((m) => m.pool === 'A');
    expect(() =>
      b.reorderPoolMatches(
        'A',
        poolA.slice(0, 1).map((m) => m.id),
      ),
    ).toThrow(/every match/i);
  });

  it('rejects reorder when a listed id is not in the pool', () => {
    const b = setupPoolPlay();
    const poolA = b.matches.filter((m) => m.pool === 'A');
    const poolB = b.matches.filter((m) => m.pool === 'B');
    const swapped = [...poolA.slice(0, poolA.length - 1).map((m) => m.id), poolB[0]!.id];
    expect(() => b.reorderPoolMatches('A', swapped)).toThrow();
  });

  it('rejects reorder for an unknown pool', () => {
    const b = setupPoolPlay();
    expect(() => b.reorderPoolMatches('Z', [])).toThrow();
  });

  it('rejects reorder when a pool match has progressed past pending', () => {
    const b = setupPoolPlay();
    b.publish(); // scoring requires an active bracket (ADR 0032)
    const poolA = b.matches.filter((m) => m.pool === 'A');
    // Record a result on the first non-bye match in pool A.
    const target = poolA.find((m) => m.status === 'pending' && m.entryAId && m.entryBId)!;
    b.recordResult({
      matchId: target.id,
      sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }],
    });
    const reversed = poolA
      .slice()
      .sort((a, x) => a.matchNumber - x.matchNumber)
      .reverse()
      .map((m) => m.id);
    expect(() => b.reorderPoolMatches('A', reversed)).toThrow(/progress|completed/i);
  });
});

// ---- ADR 0032: draft lifecycle --------------------------------------

describe('Bracket lifecycle (ADR 0032)', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  it('generate lands in draft; publish goes active', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(mkIdFactory());
    expect(b.status).toBe('draft');
    b.publish();
    expect(b.status).toBe('active');
  });

  it('publish requires a draft with matches', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    expect(() => b.publish()).toThrow(InvariantViolation); // setup, no matches
  });

  it('can re-generate from draft (e.g. after a pool change)', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(mkIdFactory());
    expect(() => b.generate(mkIdFactory())).not.toThrow();
    expect(b.status).toBe('draft');
  });

  it('reopen returns a completed bracket to active', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    b.seedTeams([tid(1), tid(2)]);
    b.generate(mkIdFactory());
    b.publish();
    const final = b.matches.find((m) => m.entryAId && m.entryBId)!;
    b.recordResult({ matchId: final.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    expect(b.status).toBe('completed');
    b.reopen();
    expect(b.status).toBe('active');
  });

  it('reset from draft returns to setup, preserving seeds', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    b.seedTeams(seedTeams(4).map((s) => s.entryId));
    b.generate(mkIdFactory());
    b.reset();
    expect(b.status).toBe('setup');
    expect(b.seeds).toHaveLength(4);
    expect(b.matches).toHaveLength(0);
  });

  it('scoring is rejected before publish (draft is structure-only)', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    b.seedTeams([tid(1), tid(2)]);
    b.generate(mkIdFactory());
    const m = b.matches.find((x) => x.entryAId && x.entryBId)!;
    expect(() =>
      b.recordResult({ matchId: m.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] }),
    ).toThrow(InvariantViolation);
  });
});

// ---- ADR 0032: per-stage config + per-match best-of -----------------

describe('Bracket per-stage / per-match best-of (ADR 0032)', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  it('validates playoffBestOf and target scores at create-time', () => {
    expect(() =>
      Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', { playoffBestOf: 2 }),
    ).toThrow(ValidationError);
    expect(() =>
      Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', { targetScore: 0 }),
    ).toThrow(ValidationError);
    const ok = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      bestOf: 1,
      targetScore: 21,
      playoffBestOf: 3,
      playoffTargetScore: 25,
    });
    expect(ok.config.targetScore).toBe(21);
    expect(ok.config.playoffBestOf).toBe(3);
  });

  it('a per-match bestOf override drives recordResult', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'round_robin', { bestOf: 1 });
    b.seedTeams(seedTeams(3).map((s) => s.entryId));
    b.generate(mkIdFactory());
    b.publish();
    const m = b.matches[0]!;
    b.editMatch(m.id, { bestOf: 3 });
    // One set can't clinch best-of-3 → still in progress (bestOf:1 would complete).
    b.recordResult({ matchId: m.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    expect(b.matches.find((x) => x.id === m.id)!.status).toBe('in_progress');
  });
});

// ---- ADR 0032: manual edits -----------------------------------------

describe('Bracket manual edits (ADR 0032)', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  function elim4(): Bracket {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    b.seedTeams([tid(1), tid(2), tid(3), tid(4)]);
    b.generate(mkIdFactory());
    return b;
  }

  it('editMatch changes a matchup in draft', () => {
    const b = elim4();
    const m = b.matches.find((x) => x.entryAId && x.entryBId)!;
    b.editMatch(m.id, { entryAId: tid(99) });
    expect(b.matches.find((x) => x.id === m.id)!.entryAId).toBe(tid(99));
  });

  it('editMatch changing a scored matchup in active clears the result', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'round_robin', { bestOf: 1 });
    b.seedTeams(seedTeams(3).map((s) => s.entryId));
    b.generate(mkIdFactory());
    b.publish();
    const m = b.matches[0]!;
    b.recordResult({ matchId: m.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    expect(b.matches.find((x) => x.id === m.id)!.status).toBe('completed');
    b.editMatch(m.id, { entryBId: tid(99) });
    const after = b.matches.find((x) => x.id === m.id)!;
    expect(after.status).toBe('pending');
    expect(after.winnerEntryId).toBeNull();
    expect(after.sets).toHaveLength(0);
    expect(after.entryBId).toBe(tid(99));
  });

  it('editMatch rejects a completed bracket (reopen first)', () => {
    const b = Bracket.create(bracketId, eventId, divisionId, 'single_elimination', { bestOf: 1 });
    b.seedTeams([tid(1), tid(2)]);
    b.generate(mkIdFactory());
    b.publish();
    const m = b.matches.find((x) => x.entryAId && x.entryBId)!;
    b.recordResult({ matchId: m.id, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
    expect(b.status).toBe('completed');
    expect(() => b.editMatch(m.id, { court: 'C1' })).toThrow(InvariantViolation);
  });

  it('addMatch then removeMatch on a draft pool', () => {
    // One shared id factory so the added match's id can't collide with a
    // generated one (real ids are UUIDs; the test factory is sequential).
    const ids = mkIdFactory();
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      bestOf: 1,
      poolCount: 2,
      advancePerPool: 1,
    });
    b.seedTeams(seedTeams(6).map((s) => s.entryId));
    b.generate(ids);
    const before = b.matches.filter((m) => m.pool === 'A').length;
    const id = b.addMatch(ids, { pool: 'A', entryAId: tid(1), entryBId: tid(3) });
    expect(b.matches.filter((m) => m.pool === 'A')).toHaveLength(before + 1);
    const added = b.matches.find((m) => m.id === id)!;
    expect(added.pool).toBe('A');
    expect(added.entryAId).toBe(tid(1));
    expect(added.matchNumber).toBeGreaterThan(0);
    b.removeMatch(id);
    expect(b.matches.find((m) => m.id === id)).toBeUndefined();
    expect(b.matches.filter((m) => m.pool === 'A')).toHaveLength(before);
  });

  it('replaceEntry swaps a team across seeds and matches', () => {
    const b = elim4();
    b.publish();
    b.replaceEntry(tid(1), tid(50));
    expect(b.seeds.some((s) => s.entryId === tid(50))).toBe(true);
    expect(b.seeds.some((s) => s.entryId === tid(1))).toBe(false);
    expect(b.matches.some((m) => m.entryAId === tid(50) || m.entryBId === tid(50))).toBe(true);
  });
});

// ---- ADR 0032: uneven pools via setPools ----------------------------

describe('Bracket.setPools + uneven pools (ADR 0032)', () => {
  const eventId = 'event-1' as EventId;
  const divisionId = 'division-1' as DivisionId;
  const bracketId = 'bracket-1' as BracketId;

  it('honors host-assigned uneven pools and equalizes games via repeats', () => {
    // 7 teams → pool A (3), pool B (4); target 3 games per team.
    const b = Bracket.create(bracketId, eventId, divisionId, 'pool_play_playoff', {
      bestOf: 1,
      poolSchedule: 'fixed_games',
      poolGamesPerTeam: 3,
      poolCount: 2,
      advancePerPool: 1,
    });
    const ids = seedTeams(7).map((s) => s.entryId);
    b.seedTeams(ids);
    b.setPools([
      { entryId: ids[0]!, pool: 'A' },
      { entryId: ids[1]!, pool: 'A' },
      { entryId: ids[2]!, pool: 'A' },
      { entryId: ids[3]!, pool: 'B' },
      { entryId: ids[4]!, pool: 'B' },
      { entryId: ids[5]!, pool: 'B' },
      { entryId: ids[6]!, pool: 'B' },
    ]);
    b.generate(mkIdFactory());

    const poolA = new Set(
      b.matches
        .filter((m) => m.pool === 'A')
        .flatMap((m) => [m.entryAId, m.entryBId].filter((t): t is EntryId => !!t)),
    );
    const poolB = new Set(
      b.matches
        .filter((m) => m.pool === 'B')
        .flatMap((m) => [m.entryAId, m.entryBId].filter((t): t is EntryId => !!t)),
    );
    expect(poolA.size).toBe(3);
    expect(poolB.size).toBe(4);

    // Everyone gets at least the 3-game target despite uneven pools.
    const counts = new Map<string, number>();
    for (const m of b.matches) {
      for (const t of [m.entryAId, m.entryBId]) {
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(7);
    for (const c of counts.values()) expect(c).toBeGreaterThanOrEqual(3);
  });
});

// ---- ADR 0032: cross-seed playoff -----------------------------------

describe('rankAcrossPools + generatePlayoffFromRanked (ADR 0032)', () => {
  const ps = (
    entryId: EntryId,
    wins: number,
    losses: number,
    setDiff: number,
    pointDiff = 0,
  ): PoolStanding => ({
    entryId,
    matchesPlayed: wins + losses,
    wins,
    losses,
    setsWon: 0,
    setsLost: 0,
    setDiff,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff,
  });

  it('ranks pool winners above runners-up, by record within a tier', () => {
    const poolA = [ps(tid(1), 3, 0, 6), ps(tid(2), 2, 1, 2), ps(tid(3), 0, 3, -8)];
    const poolB = [ps(tid(4), 3, 0, 5), ps(tid(5), 1, 2, -1)];
    const order = rankAcrossPools([poolA, poolB], 2);
    expect(order).toEqual([tid(1), tid(4), tid(2), tid(5)]);
  });

  it('throws when a pool is short of advancePerPool', () => {
    expect(() => rankAcrossPools([[ps(tid(1), 1, 0, 1)]], 2)).toThrow(ValidationError);
  });

  it('generatePlayoffFromRanked cross-seeds 1-vs-N onto the final side', () => {
    const matches = generatePlayoffFromRanked([tid(1), tid(2), tid(3), tid(4)], mkIdFactory(), 5);
    expect(matches.every((m) => m.bracketSide === 'final')).toBe(true);
    const r1 = matches.filter((m) => m.round === 6); // roundOffset 5 → first round 6
    expect(r1).toHaveLength(2);
    const pairings = r1.map((m) => new Set([m.entryAId, m.entryBId]));
    expect(pairings.some((p) => p.has(tid(1)) && p.has(tid(4)))).toBe(true);
    expect(pairings.some((p) => p.has(tid(2)) && p.has(tid(3)))).toBe(true);
  });
});
