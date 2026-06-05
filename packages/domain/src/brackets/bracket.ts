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
  BracketPublished,
  BracketReopened,
  BracketReset,
  MatchReset,
  MatchResultRecorded,
} from './bracket-events.js';
import type { BracketFormat, BracketSide, BracketStatus, ByeStrategy } from './enums.js';
import {
  generateDoubleElimination,
  generateNotImplemented,
  generatePlayoffFromRanked,
  generatePoolPlay,
  generateRoundRobin,
  generateSingleElimination,
  assignCourtsAndSlots,
} from './generators.js';
import type { BracketId, Match, MatchId, MatchSet, Seed } from './match.js';
import { determineWinner, effectiveBestOf } from './match.js';
import { computePoolStandings, distinctPools, rankAcrossPools } from './standings.js';

export interface BracketConfig {
  bestOf: number;
  byeStrategy: ByeStrategy;
  /**
   * Points a game is played to (e.g. 25 / 21 / 15). Informational (shown +
   * stored, NOT enforced by scoring). `null` ⇒ not set. Pool-stage / global
   * default; the playoff stage can override via {@link playoffTargetScore}.
   * See ADR 0032.
   */
  targetScore: number | null;
  /**
   * `pool_play_playoff` only: best-of for the playoff stage. `null` ⇒ fall
   * back to {@link bestOf}. Lets pool play be best-of-1 while the playoff is
   * best-of-3. See ADR 0032.
   */
  playoffBestOf: number | null;
  /** `pool_play_playoff` only: target score for the playoff stage. `null` ⇒ {@link targetScore}. */
  playoffTargetScore: number | null;
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
  targetScore: null,
  playoffBestOf: null,
  playoffTargetScore: null,
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
 * Fields a host may patch on a single match via {@link Bracket.editMatch}
 * (ADR 0032). Every key is optional — omitted ⇒ unchanged; `null` clears a
 * nullable field. `entryAId`/`entryBId` change the matchup; `bestOf` /
 * `targetScore` override match length / point total.
 */
export interface MatchPatch {
  entryAId?: EntryId | null;
  entryBId?: EntryId | null;
  workTeamId?: EntryId | null;
  court?: string | null;
  slot?: number | null;
  scheduledAt?: Date | null;
  bestOf?: number | null;
  targetScore?: number | null;
}

/** Shape for {@link Bracket.addMatch} — all optional; sensible defaults applied. */
export interface AddMatchInput {
  pool?: string | null;
  bracketSide?: BracketSide | null;
  entryAId?: EntryId | null;
  entryBId?: EntryId | null;
  workTeamId?: EntryId | null;
  court?: string | null;
  slot?: number | null;
  bestOf?: number | null;
  targetScore?: number | null;
  scheduledAt?: Date | null;
  round?: number;
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
    if (merged.playoffBestOf !== null && !ALLOWED_BEST_OF.includes(merged.playoffBestOf)) {
      throw new ValidationError(
        `playoffBestOf must be one of ${ALLOWED_BEST_OF.join(', ')}; got ${merged.playoffBestOf}.`,
        { playoffBestOf: merged.playoffBestOf, allowed: ALLOWED_BEST_OF },
      );
    }
    for (const [k, v] of [
      ['targetScore', merged.targetScore],
      ['playoffTargetScore', merged.playoffTargetScore],
    ] as const) {
      if (v !== null && (!Number.isInteger(v) || v < 1)) {
        throw new ValidationError(`${k} must be a positive integer when set; got ${v}.`, {
          [k]: v,
        });
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

  /**
   * Generate (or re-generate) the match graph from the current seeds + config.
   * Transitions `setup → draft`, or rebuilds the draft when called again from
   * `draft` (e.g. after the host changes pool assignments). The draft is fully
   * editable; `publish()` takes it live. See ADR 0032.
   */
  generate(idFactory: () => MatchId): void {
    if (this._status !== 'setup' && this._status !== 'draft') {
      throw new InvariantViolation('Can only generate from setup or draft. Reset to re-seed.');
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
            // Every pool must field ≥ advancePerPool teams so the playoff can
            // cross-seed — catches a too-small hand-assigned pool here (TT-16).
            minAdvancePerPool: advancePerPool,
          },
          idFactory,
        );
        break;
      }
      default:
        generateNotImplemented(this._format);
    }
    this._matches = matches;
    this._status = 'draft';
    this.raise(new BracketGenerated(this.id, matches.length));
  }

  /**
   * Publish a draft: `draft → active`. Scoring goes live; structural editing
   * narrows to targeted live edits. See ADR 0032.
   */
  publish(): void {
    if (this._status !== 'draft') {
      throw new InvariantViolation('Only a draft bracket can be published.');
    }
    if (this._matches.length === 0) {
      throw new InvariantViolation('Generate the bracket before publishing.');
    }
    this._status = 'active';
    this.raise(new BracketPublished(this.id));
  }

  /**
   * Re-open a completed bracket: `completed → active`, so the host can fix a
   * mistaken result. See ADR 0032.
   */
  reopen(): void {
    if (this._status !== 'completed') {
      throw new InvariantViolation('Only a completed bracket can be re-opened.');
    }
    this._status = 'active';
    this.raise(new BracketReopened(this.id));
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
    const standingsByPool = pools.map((p) => computePoolStandings(this._matches, p));
    // Per-pool feasibility (TT-16, defense-in-depth): every pool must field at
    // least advancePerPool finishers, else the cross-seed can't fill the
    // bracket. Name the short pool rather than letting rankAcrossPools throw the
    // generic "missing position N". Normally already caught at generate() time.
    pools.forEach((p, i) => {
      const size = standingsByPool[i]?.length ?? 0;
      if (size < this._config.advancePerPool) {
        throw new ValidationError(
          `Pool ${p} has only ${size} team(s); can't advance ${this._config.advancePerPool} ` +
            `per pool. Lower advance-per-pool or rebalance the pools.`,
          { pool: p, size, advancePerPool: this._config.advancePerPool },
        );
      }
    });
    // Auto cross-seed: overall finish across pools (pool winners ranked above
    // runners-up, by record within a tier) → standard 1-vs-N bracket. The host
    // can override the result with `seedPlayoff`. See ADR 0032.
    const ranked = rankAcrossPools(standingsByPool, this._config.advancePerPool);
    const maxPoolRound = poolMatches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const playoff = generatePlayoffFromRanked(ranked, idFactory, maxPoolRound);
    this._matches = [...this._matches, ...playoff];
    this.raise(new BracketGenerated(this.id, playoff.length));
  }

  /**
   * Replace the playoff bracket with one seeded from a host-specified overall
   * order (`orderedEntryIds[0]` = #1 seed). Lets the host override the auto
   * cross-seed. `pool_play_playoff` only; allowed while `active` as long as no
   * playoff match has started. See ADR 0032.
   *
   * @throws {InvariantViolation} wrong format or status.
   * @throws {ConflictError} a playoff match already has a result.
   * @throws {ValidationError} fewer than 2 entries (from the generator).
   */
  seedPlayoff(idFactory: () => MatchId, orderedEntryIds: ReadonlyArray<EntryId>): void {
    if (this._format !== 'pool_play_playoff') {
      throw new InvariantViolation('Playoff seeding is only supported for pool play → playoff.');
    }
    if (this._status !== 'active') {
      throw new InvariantViolation('Bracket is not active.');
    }
    const final = this._matches.filter((m) => m.bracketSide === 'final');
    if (final.some((m) => m.status !== 'pending' && m.status !== 'bye')) {
      throw new ConflictError(
        'Cannot re-seed a playoff that has matches in progress or completed.',
      );
    }
    const poolMatches = this._matches.filter((m) => m.pool !== null);
    const maxPoolRound = poolMatches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const playoff = generatePlayoffFromRanked(orderedEntryIds, idFactory, maxPoolRound);
    this._matches = [...this._matches.filter((m) => m.bracketSide !== 'final'), ...playoff];
    this.raise(new BracketGenerated(this.id, playoff.length));
  }

  /**
   * Reorder the matches within a single pool to a host-specified sequence.
   * Reassigns `matchNumber` 1..N in the order given and re-runs the
   * court/slot solver across all pool matches so the schedule stays
   * conflict-free. See ADR 0018 Phase 1b.
   *
   * Constraints:
   * - Bracket must be `draft` or `active` and use `pool_play_playoff` format.
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
    if (this._status !== 'active' && this._status !== 'draft') {
      throw new InvariantViolation('Can only reorder matches on a draft or active bracket.');
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
    const winner = determineWinner(
      input.sets,
      match.entryAId,
      match.entryBId,
      effectiveBestOf(match, this._config),
    );

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

  // ---- Manual edits (ADR 0032) ----------------------------------------

  /**
   * Assign / override the pool each seeded team belongs to. Allowed in `setup`
   * and `draft`; labels-only — in `draft` follow with `generate()` to rebuild
   * the schedule from the new composition. Enables **uneven** pools (the
   * generator honors host-assigned labels). Seeds not listed keep their pool.
   */
  setPools(assignments: ReadonlyArray<{ entryId: EntryId; pool: string | null }>): void {
    if (this._status !== 'setup' && this._status !== 'draft') {
      throw new InvariantViolation('Pools can only be assigned before publishing.');
    }
    const byEntry = new Map(assignments.map((a) => [String(a.entryId), a.pool]));
    this._seeds = this._seeds.map((s) =>
      byEntry.has(String(s.entryId)) ? { ...s, pool: byEntry.get(String(s.entryId)) ?? null } : s,
    );
  }

  /**
   * Patch a single match's structural / scheduling fields. Omitted keys are
   * left unchanged; `null` clears a nullable field.
   *
   * - `draft`: every field editable (teams A/B/work, court, slot, scheduledAt,
   *   bestOf, targetScore).
   * - `active`: scheduling + length edits always allowed; changing a team slot
   *   on a match that already has a result first clears that result and unwires
   *   its advancement so downstream matches stay consistent.
   * - `completed`: rejected — `reopen()` first.
   *
   * @throws {InvariantViolation} bracket completed or still in setup.
   * @throws {NotFoundError} unknown match.
   * @throws {ValidationError} bestOf not in the allowed set.
   */
  editMatch(matchId: MatchId, patch: MatchPatch): void {
    if (this._status === 'completed') {
      throw new InvariantViolation('Re-open the bracket before editing a match.');
    }
    if (this._status === 'setup') {
      throw new InvariantViolation('Generate the bracket before editing matches.');
    }
    const m = this.matchOrThrow(matchId);
    if (patch.bestOf != null && !ALLOWED_BEST_OF.includes(patch.bestOf)) {
      throw new ValidationError(`bestOf must be one of ${ALLOWED_BEST_OF.join(', ')}.`, {
        bestOf: patch.bestOf,
      });
    }
    const changesTeam =
      (patch.entryAId !== undefined && patch.entryAId !== m.entryAId) ||
      (patch.entryBId !== undefined && patch.entryBId !== m.entryBId);
    if (changesTeam && (m.winnerEntryId || m.sets.length > 0)) {
      // A scored match whose participants change loses its now-meaningless
      // result; cascade the unwire so downstream placements clear too.
      if (m.winnerEntryId) this.unwireAdvancement(m);
      m.winnerEntryId = null;
      m.sets = [];
      m.status = 'pending';
    }
    if (patch.entryAId !== undefined) m.entryAId = patch.entryAId;
    if (patch.entryBId !== undefined) m.entryBId = patch.entryBId;
    if (patch.workTeamId !== undefined) m.workTeamId = patch.workTeamId;
    if (patch.court !== undefined) m.court = patch.court;
    if (patch.slot !== undefined) m.slot = patch.slot;
    if (patch.scheduledAt !== undefined) m.scheduledAt = patch.scheduledAt;
    if (patch.bestOf !== undefined) m.bestOf = patch.bestOf;
    if (patch.targetScore !== undefined) m.targetScore = patch.targetScore;
  }

  /**
   * Append a new, empty (pending) match — e.g. add a game to a pool for more
   * play time, or a consolation match. No advancement wiring. Returns the new
   * match id. Allowed in `draft` and `active`. `round` / `matchNumber` default
   * to slotting after the last match in the same pool / bracket-side.
   *
   * @throws {InvariantViolation} bracket in setup / completed.
   * @throws {ValidationError} bestOf not in the allowed set.
   */
  addMatch(idFactory: () => MatchId, input: AddMatchInput): MatchId {
    if (this._status !== 'draft' && this._status !== 'active') {
      throw new InvariantViolation('Can only add matches to a draft or active bracket.');
    }
    if (input.bestOf != null && !ALLOWED_BEST_OF.includes(input.bestOf)) {
      throw new ValidationError(`bestOf must be one of ${ALLOWED_BEST_OF.join(', ')}.`, {
        bestOf: input.bestOf,
      });
    }
    const pool = input.pool ?? null;
    const bracketSide = input.bracketSide ?? null;
    const sameGroup = this._matches.filter((m) => m.pool === pool && m.bracketSide === bracketSide);
    const round = input.round ?? (sameGroup.reduce((acc, m) => Math.max(acc, m.round), 0) || 1);
    const matchNumber = sameGroup.reduce((acc, m) => Math.max(acc, m.matchNumber), 0) + 1;
    const id = idFactory();
    this._matches.push({
      id,
      round,
      matchNumber,
      pool,
      bracketSide,
      entryAId: input.entryAId ?? null,
      entryBId: input.entryBId ?? null,
      winnerEntryId: null,
      workTeamId: input.workTeamId ?? null,
      court: input.court ?? null,
      slot: input.slot ?? null,
      bestOf: input.bestOf ?? null,
      targetScore: input.targetScore ?? null,
      status: 'pending',
      sets: [],
      advancesToMatchId: null,
      advancesToSlot: null,
      loserAdvancesToMatchId: null,
      loserAdvancesToSlot: null,
      scheduledAt: input.scheduledAt ?? null,
    });
    return id;
  }

  /**
   * Remove a match. In `draft` any match may be removed; in `active` only a
   * match with no result. Clears forward-advancement references other matches
   * hold to it and unwires its own placed winner.
   *
   * @throws {InvariantViolation} bracket in setup / completed.
   * @throws {NotFoundError} unknown match.
   * @throws {ConflictError} active bracket and the match is already scored.
   */
  removeMatch(matchId: MatchId): void {
    if (this._status !== 'draft' && this._status !== 'active') {
      throw new InvariantViolation('Can only remove matches from a draft or active bracket.');
    }
    const m = this.matchOrThrow(matchId);
    if (this._status === 'active' && (m.status === 'completed' || m.sets.length > 0)) {
      throw new ConflictError('Clear the match result before removing it.');
    }
    if (m.winnerEntryId) this.unwireAdvancement(m);
    // Sever inbound wiring from any feeder pointing at this match.
    for (const other of this._matches) {
      const mut = other as {
        advancesToMatchId: MatchId | null;
        advancesToSlot: 'a' | 'b' | null;
        loserAdvancesToMatchId: MatchId | null;
        loserAdvancesToSlot: 'a' | 'b' | null;
      };
      if (other.advancesToMatchId === matchId) {
        mut.advancesToMatchId = null;
        mut.advancesToSlot = null;
      }
      if (other.loserAdvancesToMatchId === matchId) {
        mut.loserAdvancesToMatchId = null;
        mut.loserAdvancesToSlot = null;
      }
    }
    this._matches = this._matches.filter((x) => x.id !== matchId);
  }

  /**
   * Swap one entry for another everywhere it appears — seeds and every match
   * slot (A / B / work / winner) — for a dropped team or substitution. Allowed
   * in `draft` and `active`.
   */
  replaceEntry(oldEntryId: EntryId, newEntryId: EntryId): void {
    if (this._status !== 'draft' && this._status !== 'active') {
      throw new InvariantViolation('Can only replace entries on a draft or active bracket.');
    }
    if (oldEntryId === newEntryId) return;
    this._seeds = this._seeds.map((s) =>
      s.entryId === oldEntryId ? { ...s, entryId: newEntryId } : s,
    );
    for (const m of this._matches) {
      if (m.entryAId === oldEntryId) m.entryAId = newEntryId;
      if (m.entryBId === oldEntryId) m.entryBId = newEntryId;
      if (m.workTeamId === oldEntryId) m.workTeamId = newEntryId;
      if (m.winnerEntryId === oldEntryId) m.winnerEntryId = newEntryId;
    }
  }

  // ---- Internals -------------------------------------------------------

  private matchOrThrow(matchId: MatchId): Match {
    const m = this._matches.find((x) => x.id === matchId);
    if (!m) throw new NotFoundError('match', matchId);
    return m;
  }

  /**
   * When `match` is the double-elimination grand final — a `final` match whose
   * winner edge points at another `final` match (the reset) — return that reset
   * match; otherwise null. Guards on the format so a pool-play playoff (whose
   * matches are all `bracketSide: 'final'`) never trips the reset logic.
   */
  private grandFinalResetFor(match: Match): Match | null {
    if (this._format !== 'double_elimination') return null;
    if (match.bracketSide !== 'final' || !match.advancesToMatchId) return null;
    const target = this._matches.find((m) => m.id === match.advancesToMatchId);
    return target && target.bracketSide === 'final' ? target : null;
  }

  /** Return the grand-final reset to a clean, unplayed-and-unvoided slate. */
  private clearGrandFinalReset(reset: Match): void {
    reset.entryAId = null;
    reset.entryBId = null;
    reset.sets = [];
    reset.winnerEntryId = null;
    reset.status = 'pending';
  }

  private applyAdvancement(match: Match): void {
    if (!match.winnerEntryId) return;
    // Double-elimination grand-final → reset. The grand final's winner edge
    // points at the reset, but the reset is a *conditional* game: only the
    // losers-bracket team (slot b) forces it. If the winners-bracket team
    // (slot a) wins the grand final it has the title (the LB side now has two
    // losses), so the reset is voided as a bye to let the bracket complete.
    const gfReset = this.grandFinalResetFor(match);
    if (gfReset) {
      if (match.winnerEntryId === match.entryAId) {
        // WB champion — void the reset.
        gfReset.entryAId = null;
        gfReset.entryBId = null;
        gfReset.sets = [];
        gfReset.winnerEntryId = null;
        gfReset.status = 'bye';
      } else {
        // LB champion — both teams have one loss; play the deciding reset.
        gfReset.entryAId = match.entryAId;
        gfReset.entryBId = match.entryBId;
        gfReset.sets = [];
        gfReset.winnerEntryId = null;
        gfReset.status = 'pending';
      }
      return;
    }
    // Winner advances to its next match.
    if (match.advancesToMatchId && match.advancesToSlot) {
      const next = this._matches.find((m) => m.id === match.advancesToMatchId);
      if (next) {
        if (match.advancesToSlot === 'a') next.entryAId = match.winnerEntryId;
        else next.entryBId = match.winnerEntryId;
      }
    }
    // Loser drops to its losers-bracket match (double elimination). Without
    // this, the losers bracket + grand final never receive teams and stay
    // unplayable — a double-elim degenerates into a single-elim. The generator
    // wires `loserAdvancesTo*` on every winners-bracket match (generators.ts).
    if (match.loserAdvancesToMatchId && match.loserAdvancesToSlot) {
      const loser = match.winnerEntryId === match.entryAId ? match.entryBId : match.entryAId;
      const dest = this._matches.find((m) => m.id === match.loserAdvancesToMatchId);
      if (dest && loser) {
        if (match.loserAdvancesToSlot === 'a') dest.entryAId = loser;
        else dest.entryBId = loser;
      }
    }
  }

  private unwireAdvancement(match: Match): void {
    // Double-elim grand final → reset: clearing the grand final's result fully
    // resets the (conditional) reset game, not just one of its slots.
    const directReset = this.grandFinalResetFor(match);
    if (directReset) {
      this.clearGrandFinalReset(directReset);
      return;
    }
    // Walk forward and clear every slot this match's result fed — the winner's
    // advancement AND (double elim) the loser's drop — cascading through any
    // downstream match whose own result consumed a now-removed team. Slots are
    // keyed `matchId:slot` so a match fed on both sides (e.g. a grand final) has
    // each side cleared independently.
    const visited = new Set<string>();
    const queue: { matchId: MatchId; slot: 'a' | 'b' }[] = [];
    if (match.advancesToMatchId && match.advancesToSlot) {
      queue.push({ matchId: match.advancesToMatchId, slot: match.advancesToSlot });
    }
    if (match.loserAdvancesToMatchId && match.loserAdvancesToSlot) {
      queue.push({ matchId: match.loserAdvancesToMatchId, slot: match.loserAdvancesToSlot });
    }
    while (queue.length > 0) {
      const { matchId, slot } = queue.shift()!;
      const key = `${matchId}:${slot}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const m = this._matches.find((x) => x.id === matchId);
      if (!m) continue;
      const removed = slot === 'a' ? m.entryAId : m.entryBId;
      if (slot === 'a') m.entryAId = null;
      else m.entryBId = null;
      // If this downstream match had a result built on the removed team, that
      // result is now stale — clear it and cascade through BOTH its forward
      // edges (winner advance + loser drop).
      if (removed && m.winnerEntryId === removed) {
        m.winnerEntryId = null;
        m.sets = [];
        m.status = 'pending';
        // If the cleared match is the grand final, fully reset its reset game
        // rather than pushing the generic forward edge (which would clear only
        // one reset slot).
        const cascadeReset = this.grandFinalResetFor(m);
        if (cascadeReset) {
          this.clearGrandFinalReset(cascadeReset);
          continue;
        }
        if (m.advancesToMatchId && m.advancesToSlot) {
          queue.push({ matchId: m.advancesToMatchId, slot: m.advancesToSlot });
        }
        if (m.loserAdvancesToMatchId && m.loserAdvancesToSlot) {
          queue.push({ matchId: m.loserAdvancesToMatchId, slot: m.loserAdvancesToSlot });
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
