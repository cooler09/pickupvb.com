import { describe, expect, it } from 'vitest';
import {
  ALLOWED_BEST_OF,
  Bracket,
  DEFAULT_BRACKET_CONFIG,
  assignCourtsAndSlots,
  generatePoolPlay,
  generateRoundRobin,
  type BracketId,
  type EntryId,
  type Match,
  type MatchId,
  type Seed,
} from './index.js';
import type { DivisionId } from '../events/division.js';
import type { EventId, UserId } from '../events/volleyball-event.js';
import { ValidationError } from '../shared/result.js';

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

  it('fixed_games: rejects gamesPerTeam >= smallest pool size', () => {
    // 6 teams in 2 pools (3 each). gamesPerTeam=3 means full RR; reject.
    expect(() =>
      generatePoolPlay(
        seedTeams(6),
        2,
        { schedule: 'fixed_games', gamesPerTeam: 3 },
        mkIdFactory(),
      ),
    ).toThrow(ValidationError);
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
