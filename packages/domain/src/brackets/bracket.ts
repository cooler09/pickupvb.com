import type { DivisionId } from '../events/division.js';
import type { EventId, UserId } from '../events/volleyball-event.js';
import type { EntryId } from './match.js';
import { AggregateRoot } from '../shared/aggregate-root.js';
import {
  ConflictError,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from '../shared/result.js';
import {
  BracketCompleted,
  BracketCreated,
  BracketGenerated,
  BracketReset,
  MatchReset,
  MatchResultRecorded,
} from './bracket-events.js';
import type { BracketFormat, BracketStatus, ByeStrategy } from './enums.js';
import {
  generateDoubleElimination,
  generateNotImplemented,
  generatePlayoffFromStandings,
  generatePoolPlay,
  generateRoundRobin,
  generateSingleElimination,
  assignCourtsAndSlots,
} from './generators.js';
import type { BracketId, Match, MatchId, MatchSet, Seed } from './match.js';
import { determineWinner } from './match.js';
import { computePoolStandings, distinctPools } from './standings.js';

export interface BracketConfig {
  bestOf: number;
  byeStrategy: ByeStrategy;
  /** Pool play only: number of pools (default 2). */
  poolCount: number;
  /** Pool play only: how many top teams from each pool advance (default 2). */
  advancePerPool: number;
  /**
   * Pool play only: whether each pool runs a full round-robin or a
   * fixed number of games per team. See ADR 0018.
   */
  poolSchedule: 'round_robin' | 'fixed_games';
  /**
   * Pool play only, `fixed_games` mode: how many opponents each team
   * plays inside its pool. Ignored (kept as null) for `round_robin`.
   */
  poolGamesPerTeam: number | null;
  /**
   * Pool play only: when true, the generator assigns the round's idle
   * team as `workTeamId` on each match. When false (default) work
   * teams stay null and the UI hides the column. See ADR 0018.
   */
  requireWorkTeam: boolean;
  /**
   * Free-text court labels (e.g. `['Court 1', 'Court 2', 'North gym']`).
   * When non-empty, the pool-play generator assigns each match a
   * `slot` (parallel time-block) and a `court` from this list such
   * that no team plays or refs two matches in the same slot.
   * Empty array (default) disables slot/court assignment. See ADR 0018.
   */
  courtLabels: ReadonlyArray<string>;
  /**
   * Per-pool court overrides. Keys are pool labels (`'A'`, `'B'`, …);
   * values are court lists used in place of `courtLabels` for matches
   * in that pool. Pools missing from this map fall back to
   * `courtLabels`. An explicitly empty list opts that pool out of
   * scheduling entirely. Disjoint per-pool court sets schedule fully
   * in parallel. See ADR 0018.
   */
  courtsByPool: Readonly<Record<string, ReadonlyArray<string>>>;
}

export const DEFAULT_BRACKET_CONFIG: BracketConfig = {
  bestOf: 3,
  byeStrategy: 'top_seeds',
  poolCount: 2,
  advancePerPool: 2,
  poolSchedule: 'round_robin',
  poolGamesPerTeam: null,
  requireWorkTeam: false,
  courtLabels: [],
  courtsByPool: {},
};

/** `bestOf` values the host can pick. Other odd values are rejected at create-time. */
export const ALLOWED_BEST_OF: ReadonlyArray<number> = [1, 3, 5];

export interface RecordResultInput {
  readonly matchId: MatchId;
  readonly sets: ReadonlyArray<MatchSet>;
}

/**
 * Tournament bracket aggregate.
 *
 * Owns the seeding, the generated match graph, and the rules for recording
 * match results & advancing winners. Pure: no I/O. The repository hydrates
 * via `fromPersistence` and persists the full state on `save`.
 */
export class Bracket extends AggregateRoot<BracketId> {
  private constructor(
    id: BracketId,
    /**
     * Scope identity. An event bracket carries `eventId` + `divisionId` (and
     * a null `ownerUserId`); a standalone bracket (ADR 0025) carries
     * `ownerUserId` (and null `eventId`/`divisionId`). Exactly one scope is
     * set — enforced by the `event_brackets_scope_xor` DB check. The aggregate
     * logic never reads these; they are echoed for the repo/handlers.
     */
    public readonly eventId: EventId | null,
    public readonly divisionId: DivisionId | null,
    public readonly ownerUserId: UserId | null,
    private _format: BracketFormat,
    private _config: BracketConfig,
    private _status: BracketStatus,
    private _seeds: Seed[],
    private _matches: Match[],
  ) {
    super(id);
  }

  /**
   * Validate inputs and produce a new `Bracket` in `setup` status with
   * no seeds and no matches. Merges `config` over `DEFAULT_BRACKET_CONFIG`
   * and throws {@link ValidationError} when `bestOf` is not a positive
   * odd number. Raises a `BracketCreated` domain event.
   */
  static create(
    id: BracketId,
    eventId: EventId,
    divisionId: DivisionId,
    format: BracketFormat,
    config: Partial<BracketConfig> = {},
  ): Bracket {
    const merged = Bracket.mergeAndValidateConfig(config);
    const b = new Bracket(id, eventId, divisionId, null, format, merged, 'setup', [], []);
    b.raise(new BracketCreated(b.id));
    return b;
  }

  /**
   * Standalone (event-free) bracket owned by a user. See ADR 0025. Same
   * create-time validation as {@link create}; scope is `ownerUserId` with
   * null `eventId`/`divisionId`. Raises a `BracketCreated` domain event.
   */
  static createStandalone(
    id: BracketId,
    ownerUserId: UserId,
    format: BracketFormat,
    config: Partial<BracketConfig> = {},
  ): Bracket {
    const merged = Bracket.mergeAndValidateConfig(config);
    const b = new Bracket(id, null, null, ownerUserId, format, merged, 'setup', [], []);
    b.raise(new BracketCreated(b.id));
    return b;
  }

  /** Merge over defaults and validate the create-time config invariants. */
  private static mergeAndValidateConfig(config: Partial<BracketConfig>): BracketConfig {
    const merged: BracketConfig = { ...DEFAULT_BRACKET_CONFIG, ...config };
    if (!ALLOWED_BEST_OF.includes(merged.bestOf)) {
      throw new ValidationError(
        `bestOf must be one of ${ALLOWED_BEST_OF.join(', ')}; got ${merged.bestOf}.`,
        { bestOf: merged.bestOf, allowed: ALLOWED_BEST_OF },
      );
    }
    if (merged.poolSchedule === 'fixed_games') {
      if (merged.poolGamesPerTeam === null || merged.poolGamesPerTeam < 1) {
        throw new ValidationError(
          'poolGamesPerTeam must be >= 1 when poolSchedule is fixed_games.',
          { poolGamesPerTeam: merged.poolGamesPerTeam },
        );
      }
    }
    return merged;
  }

  /**
   * Rebuild a `Bracket` from already-persisted state. Skips create-time
   * validation and does not raise `BracketCreated` — only call from
   * repository adapters reading already-validated rows.
   */
  static fromPersistence(props: {
    id: BracketId;
    eventId: EventId | null;
    divisionId: DivisionId | null;
    ownerUserId: UserId | null;
    format: BracketFormat;
    config: BracketConfig;
    status: BracketStatus;
    seeds: ReadonlyArray<Seed>;
    matches: ReadonlyArray<Match>;
  }): Bracket {
    return new Bracket(
      props.id,
      props.eventId,
      props.divisionId,
      props.ownerUserId,
      props.format,
      props.config,
      props.status,
      [...props.seeds],
      props.matches.map((m) => ({ ...m, sets: [...m.sets] })),
    );
  }

  // ---- Getters ---------------------------------------------------------
  get format(): BracketFormat {
    return this._format;
  }
  get config(): BracketConfig {
    return this._config;
  }
  get status(): BracketStatus {
    return this._status;
  }
  get seeds(): ReadonlyArray<Seed> {
    return this._seeds;
  }
  get matches(): ReadonlyArray<Match> {
    return this._matches;
  }

  // ---- Setup -----------------------------------------------------------
  /**
   * Replace the seeded teams. Only allowed in setup state. Seed numbers
   * are reassigned 1..N in the order provided so the host can drag-reorder
   * without worrying about gaps.
   */
  seedTeams(entryIds: ReadonlyArray<EntryId>, pools?: ReadonlyArray<string | null>): void {
    if (this._status !== 'setup') {
      throw new InvariantViolation(
        'Cannot reseed after the bracket has been generated. Reset the bracket first.',
      );
    }
    if (new Set(entryIds).size !== entryIds.length) {
      throw new ConflictError('Each team can only be seeded once.');
    }
    this._seeds = entryIds.map((entryId, i) => ({
      entryId,
      seed: i + 1,
      pool: pools?.[i] ?? null,
    }));
  }

  /** Generate the match graph. Transitions setup → active. */
  generate(idFactory: () => MatchId): void {
    if (this._status !== 'setup') {
      throw new InvariantViolation('Bracket has already been generated.');
    }
    if (this._seeds.length < 2) {
      throw new InvariantViolation('Need at least 2 seeded teams to generate.');
    }
    let matches: Match[];
    switch (this._format) {
      case 'single_elimination':
        matches = generateSingleElimination(this._seeds, idFactory);
        break;
      case 'double_elimination':
        matches = generateDoubleElimination(this._seeds, idFactory);
        break;
      case 'round_robin':
        matches = generateRoundRobin(this._seeds, idFactory);
        break;
      case 'pool_play_playoff': {
        // Snake distribution gives each pool floor(N/poolCount) or
        // ceil(N/poolCount) teams. For the playoff to be generable later,
        // even the smallest pool needs at least `advancePerPool` teams,
        // i.e. seeds.length >= poolCount * advancePerPool. Fail here so
        // the host can fix the config before pool matches are played —
        // otherwise the error only surfaces at `generatePlayoff` time
        // with a cryptic "missing position N" message.
        const { poolCount, advancePerPool } = this._config;
        const minTeams = poolCount * advancePerPool;
        if (this._seeds.length < minTeams) {
          throw new ValidationError(
            `Pool play with ${poolCount} pools advancing ${advancePerPool} per pool needs ` +
              `at least ${minTeams} teams; have ${this._seeds.length}. ` +
              `Reduce the pool count or advance-per-pool, or add more teams.`,
            {
              poolCount,
              advancePerPool,
              teamCount: this._seeds.length,
              minTeams,
            },
          );
        }
        matches = generatePoolPlay(
          this._seeds,
          poolCount,
          {
            schedule: this._config.poolSchedule,
            gamesPerTeam: this._config.poolGamesPerTeam,
            assignWorkTeam: this._config.requireWorkTeam,
            courtLabels: this._config.courtLabels,
            courtsByPool: this._config.courtsByPool,
          },
          idFactory,
        );
        break;
      }
      default:
        generateNotImplemented(this._format);
    }
    this._matches = matches;
    this._status = 'active';
    this.raise(new BracketGenerated(this.id, matches.length));
  }

  /**
   * For pool_play_playoff: once every pool match is completed, append
   * the single-elim playoff bracket built from pool standings. Idempotent
   * — a second call is rejected if playoff matches already exist.
   */
  generatePlayoff(idFactory: () => MatchId): void {
    if (this._format !== 'pool_play_playoff') {
      throw new InvariantViolation(
        'Playoff generation is only supported for pool play → playoff format.',
      );
    }
    if (this._status !== 'active') {
      throw new InvariantViolation('Bracket is not active.');
    }
    if (this._matches.some((m) => m.bracketSide === 'final')) {
      throw new ConflictError('Playoff bracket has already been generated.');
    }
    const poolMatches = this._matches.filter((m) => m.pool !== null);
    if (poolMatches.length === 0) {
      throw new InvariantViolation('No pool play matches found.');
    }
    const allDone = poolMatches.every((m) => m.status === 'completed' || m.status === 'bye');
    if (!allDone) {
      throw new InvariantViolation(
        'All pool play matches must be completed before generating the playoff.',
      );
    }
    const pools = distinctPools(poolMatches);
    const standingsByPool = pools.map((p) =>
      computePoolStandings(this._matches, p).map((s) => s.entryId),
    );
    const maxPoolRound = poolMatches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const playoff = generatePlayoffFromStandings(
      standingsByPool,
      this._config.advancePerPool,
      idFactory,
      maxPoolRound,
    );
    this._matches = [...this._matches, ...playoff];
    this.raise(new BracketGenerated(this.id, playoff.length));
  }

  /**
   * Reorder the matches within a single pool to a host-specified sequence.
   * Reassigns `matchNumber` 1..N in the order given and re-runs the
   * court/slot solver across all pool matches so the schedule stays
   * conflict-free. See ADR 0018 Phase 1b.
   *
   * Constraints:
   * - Bracket must be `active` and use `pool_play_playoff` format.
   * - `newOrder` must list every match currently in `pool`, no extras.
   * - No match in the pool may have started (status must be `pending`
   *   or `bye`) — once results are recorded, the schedule is frozen.
   *
   * @throws {InvariantViolation} bad status or wrong format.
   * @throws {NotFoundError} pool doesn't exist, or a listed match id
   *   isn't in the pool.
   * @throws {ValidationError} duplicate or missing match ids.
   * @throws {ConflictError} pool has matches in progress or completed.
   */
  reorderPoolMatches(pool: string, newOrder: ReadonlyArray<MatchId>): void {
    if (this._status !== 'active') {
      throw new InvariantViolation('Can only reorder matches on an active bracket.');
    }
    if (this._format !== 'pool_play_playoff') {
      throw new InvariantViolation('Reorder is only supported for pool play.');
    }
    const poolMatches = this._matches.filter((m) => m.pool === pool);
    if (poolMatches.length === 0) {
      throw new NotFoundError('pool', pool);
    }
    if (new Set(newOrder.map(String)).size !== newOrder.length) {
      throw new ValidationError('Duplicate match id in reorder list.');
    }
    if (poolMatches.length !== newOrder.length) {
      throw new ValidationError('Reorder must include every match in the pool.', {
        expected: poolMatches.length,
        got: newOrder.length,
      });
    }
    const byId = new Map(poolMatches.map((m) => [String(m.id), m]));
    for (const id of newOrder) {
      if (!byId.has(String(id))) {
        throw new NotFoundError('match', String(id));
      }
    }
    for (const m of poolMatches) {
      if (m.status !== 'pending' && m.status !== 'bye') {
        throw new ConflictError('Cannot reorder a pool that has matches in progress or completed.');
      }
    }
    // Assign 1..N matchNumber in new order. `matchNumber` is declared
    // readonly on the Match interface (the generator owns the initial
    // value); cast to mutate here.
    for (let i = 0; i < newOrder.length; i++) {
      const m = byId.get(String(newOrder[i]!))!;
      (m as { matchNumber: number }).matchNumber = i + 1;
    }
    // Re-run court/slot solver across all pool matches in their new
    // (pool, matchNumber) order so slots reflect the new sequence.
    const hasAnyCourts =
      this._config.courtLabels.length > 0 ||
      Object.values(this._config.courtsByPool).some((l) => l.length > 0);
    if (hasAnyCourts) {
      const allPoolMatches = this._matches
        .filter((m) => m.pool !== null)
        .sort((a, b) => {
          if (a.pool !== b.pool) return (a.pool ?? '') < (b.pool ?? '') ? -1 : 1;
          return a.matchNumber - b.matchNumber;
        });
      for (const m of allPoolMatches) {
        m.court = null;
        m.slot = null;
      }
      assignCourtsAndSlots(allPoolMatches, this._config.courtLabels, this._config.courtsByPool);
    }
  }

  /**
   * Throw out the generated matches and return to setup so the host can
   * reseed and re-generate. Existing seeds are preserved.
   */
  reset(): void {
    if (this._status === 'completed') {
      throw new InvariantViolation('Cannot reset a completed bracket.');
    }
    this._matches = [];
    this._status = 'setup';
    this.raise(new BracketReset(this.id));
  }

  // ---- Match operations -----------------------------------------------
  recordResult(input: RecordResultInput): void {
    if (this._status !== 'active') {
      throw new InvariantViolation('Bracket is not active.');
    }
    const match = this.matchOrThrow(input.matchId);
    if (match.status === 'bye') {
      throw new InvariantViolation('Cannot record a result for a bye match.');
    }
    if (!match.entryAId || !match.entryBId) {
      throw new InvariantViolation('Both teams must be set before recording a result.');
    }
    // Validate sets.
    for (const s of input.sets) {
      if (s.teamAScore < 0 || s.teamBScore < 0) {
        throw new ValidationError('Set scores must be non-negative.');
      }
      if (s.teamAScore === s.teamBScore) {
        throw new ValidationError('Sets cannot be tied.');
      }
    }
    const winner = determineWinner(input.sets, match.entryAId, match.entryBId, this._config.bestOf);

    // Reverting an existing wired-forward result first.
    if (match.winnerEntryId && match.winnerEntryId !== winner) {
      this.unwireAdvancement(match);
    }

    match.sets = input.sets.map((s) => ({ ...s }));
    if (winner) {
      match.winnerEntryId = winner as EntryId;
      match.status = 'completed';
      this.applyAdvancement(match);
      this.raise(new MatchResultRecorded(this.id, match.id, winner));
      this.maybeComplete();
    } else {
      match.winnerEntryId = null;
      match.status = input.sets.length > 0 ? 'in_progress' : 'pending';
    }
  }

  /** Wipe a match's result (and its forward advancement). */
  resetMatch(matchId: MatchId): void {
    if (this._status === 'completed') {
      throw new InvariantViolation('Cannot edit a completed bracket.');
    }
    const match = this.matchOrThrow(matchId);
    if (match.status === 'bye') return;
    if (match.winnerEntryId) this.unwireAdvancement(match);
    match.sets = [];
    match.winnerEntryId = null;
    match.status = match.entryAId && match.entryBId ? 'pending' : 'pending';
    this.raise(new MatchReset(this.id, match.id));
  }

  // ---- Internals -------------------------------------------------------
  private matchOrThrow(matchId: MatchId): Match {
    const m = this._matches.find((x) => x.id === matchId);
    if (!m) throw new NotFoundError('match', matchId);
    return m;
  }

  private applyAdvancement(match: Match): void {
    if (!match.advancesToMatchId || !match.advancesToSlot || !match.winnerEntryId) return;
    const next = this._matches.find((m) => m.id === match.advancesToMatchId);
    if (!next) return;
    if (match.advancesToSlot === 'a') next.entryAId = match.winnerEntryId;
    else next.entryBId = match.winnerEntryId;
  }

  private unwireAdvancement(match: Match): void {
    // Walk forward and clear the slot we previously placed our winner in,
    // then cascade through any downstream matches that consumed that team.
    if (!match.advancesToMatchId || !match.advancesToSlot) return;
    const visited = new Set<string>();
    const queue: { matchId: MatchId; slot: 'a' | 'b' }[] = [
      { matchId: match.advancesToMatchId, slot: match.advancesToSlot },
    ];
    while (queue.length > 0) {
      const { matchId, slot } = queue.shift()!;
      if (visited.has(matchId)) continue;
      visited.add(matchId);
      const m = this._matches.find((x) => x.id === matchId);
      if (!m) continue;
      const removed = slot === 'a' ? m.entryAId : m.entryBId;
      if (slot === 'a') m.entryAId = null;
      else m.entryBId = null;
      // If this downstream match had a result, that result is now stale.
      if (m.winnerEntryId === removed) {
        m.winnerEntryId = null;
        m.sets = [];
        m.status = 'pending';
        if (m.advancesToMatchId && m.advancesToSlot) {
          queue.push({
            matchId: m.advancesToMatchId,
            slot: m.advancesToSlot,
          });
        }
      }
    }
  }

  private maybeComplete(): void {
    const allDone = this._matches.every((m) => m.status === 'completed' || m.status === 'bye');
    if (!allDone || this._status !== 'active') return;
    // For pool_play_playoff, only complete once the playoff has been
    // generated; otherwise we'd flip to 'completed' the moment the last
    // pool match wraps up, before the host can build the playoff.
    if (
      this._format === 'pool_play_playoff' &&
      !this._matches.some((m) => m.bracketSide === 'final')
    ) {
      return;
    }
    this._status = 'completed';
    this.raise(new BracketCompleted(this.id));
  }
}
