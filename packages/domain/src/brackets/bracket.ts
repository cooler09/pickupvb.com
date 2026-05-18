import type { DivisionId } from '../events/division.js';
import type { EventId, TeamId } from '../events/volleyball-event.js';
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
}

export const DEFAULT_BRACKET_CONFIG: BracketConfig = {
  bestOf: 3,
  byeStrategy: 'top_seeds',
  poolCount: 2,
  advancePerPool: 2,
};

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
    public readonly eventId: EventId,
    public readonly divisionId: DivisionId,
    private _format: BracketFormat,
    private _config: BracketConfig,
    private _status: BracketStatus,
    private _seeds: Seed[],
    private _matches: Match[],
  ) {
    super(id);
  }

  static create(
    id: BracketId,
    eventId: EventId,
    divisionId: DivisionId,
    format: BracketFormat,
    config: Partial<BracketConfig> = {},
  ): Bracket {
    const merged: BracketConfig = { ...DEFAULT_BRACKET_CONFIG, ...config };
    if (merged.bestOf < 1 || merged.bestOf % 2 === 0) {
      throw new ValidationError('bestOf must be a positive odd number.');
    }
    const b = new Bracket(id, eventId, divisionId, format, merged, 'setup', [], []);
    b.raise(new BracketCreated(b.id));
    return b;
  }

  static fromPersistence(props: {
    id: BracketId;
    eventId: EventId;
    divisionId: DivisionId;
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
  seedTeams(teamIds: ReadonlyArray<TeamId>, pools?: ReadonlyArray<string | null>): void {
    if (this._status !== 'setup') {
      throw new InvariantViolation(
        'Cannot reseed after the bracket has been generated. Reset the bracket first.',
      );
    }
    if (new Set(teamIds).size !== teamIds.length) {
      throw new ConflictError('Each team can only be seeded once.');
    }
    this._seeds = teamIds.map((teamId, i) => ({
      teamId,
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
      case 'pool_play_playoff':
        matches = generatePoolPlay(this._seeds, this._config.poolCount, idFactory);
        break;
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
      computePoolStandings(this._matches, p).map((s) => s.teamId),
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
    if (!match.teamAId || !match.teamBId) {
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
    const winner = determineWinner(input.sets, match.teamAId, match.teamBId, this._config.bestOf);

    // Reverting an existing wired-forward result first.
    if (match.winnerTeamId && match.winnerTeamId !== winner) {
      this.unwireAdvancement(match);
    }

    match.sets = input.sets.map((s) => ({ ...s }));
    if (winner) {
      match.winnerTeamId = winner as TeamId;
      match.status = 'completed';
      this.applyAdvancement(match);
      this.raise(new MatchResultRecorded(this.id, match.id, winner));
      this.maybeComplete();
    } else {
      match.winnerTeamId = null;
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
    if (match.winnerTeamId) this.unwireAdvancement(match);
    match.sets = [];
    match.winnerTeamId = null;
    match.status = match.teamAId && match.teamBId ? 'pending' : 'pending';
    this.raise(new MatchReset(this.id, match.id));
  }

  // ---- Internals -------------------------------------------------------
  private matchOrThrow(matchId: MatchId): Match {
    const m = this._matches.find((x) => x.id === matchId);
    if (!m) throw new NotFoundError('match', matchId);
    return m;
  }

  private applyAdvancement(match: Match): void {
    if (!match.advancesToMatchId || !match.advancesToSlot || !match.winnerTeamId) return;
    const next = this._matches.find((m) => m.id === match.advancesToMatchId);
    if (!next) return;
    if (match.advancesToSlot === 'a') next.teamAId = match.winnerTeamId;
    else next.teamBId = match.winnerTeamId;
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
      const removed = slot === 'a' ? m.teamAId : m.teamBId;
      if (slot === 'a') m.teamAId = null;
      else m.teamBId = null;
      // If this downstream match had a result, that result is now stale.
      if (m.winnerTeamId === removed) {
        m.winnerTeamId = null;
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
