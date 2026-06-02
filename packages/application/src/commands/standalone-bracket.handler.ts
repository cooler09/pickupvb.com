import type {
  AnalyticsPort,
  BracketConfig,
  BracketFormat,
  BracketRepository,
} from '@pickupvb/domain';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import {
  Bracket,
  BracketId,
  EntryId,
  InvariantViolation,
  MatchId,
  NotFoundError,
  UnauthorizedError,
  UserId,
  ValidationError,
} from '@pickupvb/domain';

// ---- Commands ------------------------------------------------------------
//
// Standalone brackets (ADR 0025) are owned by a user, not an event division.
// Every command keys on the bracket id (there is no division to look up by)
// and is authorized against `bracket.ownerUserId === requesterId`.
//
// Match-result recording / reset is NOT here: those reuse the event-path
// `RecordMatchResultHandler` / `ResetMatchHandler`, which route by match id
// through the owner-aware `record_bracket_match_result` RPC.

export class CreateStandaloneBracketCommand {
  constructor(
    public readonly requesterId: string,
    public readonly format: BracketFormat,
    public readonly config?: Partial<BracketConfig>,
  ) {}
}

export class SeedStandaloneBracketCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly entryIdsInOrder: ReadonlyArray<string>,
    public readonly pools?: ReadonlyArray<string | null>,
  ) {}
}

export class GenerateStandaloneBracketCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
  ) {}
}

export class GenerateStandalonePlayoffCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
  ) {}
}

export class ResetStandaloneBracketCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReorderStandalonePoolMatchesCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly pool: string,
    public readonly matchIdsInOrder: ReadonlyArray<string>,
  ) {}
}

export class AddBracketTeamCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly name: string,
  ) {}
}

// ---- Helper --------------------------------------------------------------

/**
 * Load a standalone bracket and assert the requester owns it. Throws
 * {@link NotFoundError} when the bracket is unknown and {@link UnauthorizedError}
 * when the requester is not the owner (which also rejects an event-scoped
 * bracket — its `ownerUserId` is null). The owner-gated full-replace runs on
 * the service-role admin client (the app is the authority here; the
 * match-actor RPC path is what RLS guards — AGENTS.md gotcha #8).
 */
async function loadOwnedBracket(
  brackets: BracketRepository,
  bracketId: string,
  requesterId: string,
): Promise<Bracket> {
  const b = await brackets.findById(BracketId(bracketId));
  if (!b) throw new NotFoundError('bracket', bracketId);
  if (b.ownerUserId !== requesterId) {
    throw new UnauthorizedError('Only the bracket owner can manage this bracket.');
  }
  return b;
}

// ---- Handlers ------------------------------------------------------------

export class CreateStandaloneBracketHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: CreateStandaloneBracketCommand): Promise<{ bracketId: string }> {
    const bracket = Bracket.createStandalone(
      this.brackets.nextBracketId(),
      UserId(cmd.requesterId),
      cmd.format,
      cmd.config,
    );
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
    return { bracketId: bracket.id };
  }
}

export class SeedStandaloneBracketHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: SeedStandaloneBracketCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    bracket.seedTeams(
      cmd.entryIdsInOrder.map((t) => EntryId(t)),
      cmd.pools,
    );
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class GenerateStandaloneBracketHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: GenerateStandaloneBracketCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    bracket.generate(() => this.brackets.nextMatchId());
    // ADR 0032: generate() lands in `draft`; auto-publish to preserve the
    // current one-click standalone flow until the draft workspace ships
    // (Phase 4). See GenerateBracketHandler for the same bridge.
    bracket.publish();
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class GenerateStandalonePlayoffHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: GenerateStandalonePlayoffCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    bracket.generatePlayoff(() => this.brackets.nextMatchId());
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class ResetStandaloneBracketHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: ResetStandaloneBracketCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    bracket.reset();
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class ReorderStandalonePoolMatchesHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: ReorderStandalonePoolMatchesCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    bracket.reorderPoolMatches(
      cmd.pool,
      cmd.matchIdsInOrder.map((id) => MatchId(id)),
    );
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class AddBracketTeamHandler {
  constructor(private readonly brackets: BracketRepository) {}

  async execute(cmd: AddBracketTeamCommand): Promise<{ entryId: string }> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    if (bracket.status !== 'setup') {
      throw new InvariantViolation(
        'Teams can only be added before the bracket is generated. Reset the bracket first.',
      );
    }
    const name = cmd.name.trim();
    if (!name) throw new ValidationError('Team name is required.');
    return this.brackets.addBracketTeam(BracketId(cmd.bracketId), name);
  }
}
