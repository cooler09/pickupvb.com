import type {
  BracketConfig,
  BracketFormat,
  BracketRepository,
  EventWriteStore,
  MatchSet,
} from '@pickupvb/domain';
import {
  Bracket,
  DivisionId,
  EntryId,
  MatchId,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  minTeamsForFormat,
} from '@pickupvb/domain';

// ---- Commands ------------------------------------------------------------
//
// All bracket commands are scoped to a single division (ADR-0006 Phase 7).
// `eventId` is retained on the per-match commands because the route boundary
// has it on hand for revalidation; it isn't trusted for authorization.

export class CreateBracketCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly format: BracketFormat,
    public readonly config?: Partial<BracketConfig>,
  ) {}
}

export class SeedBracketCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly entryIdsInOrder: ReadonlyArray<string>,
    public readonly pools?: ReadonlyArray<string | null>,
  ) {}
}

export class GenerateBracketCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
  ) {}
}

export class GeneratePlayoffCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
  ) {}
}

export class ResetBracketCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReorderPoolMatchesCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly pool: string,
    public readonly matchIdsInOrder: ReadonlyArray<string>,
  ) {}
}

export class RecordMatchResultCommand {
  constructor(
    public readonly matchId: string,
    public readonly requesterId: string,
    public readonly sets: ReadonlyArray<MatchSet>,
  ) {}
}

export class ResetMatchCommand {
  constructor(
    public readonly matchId: string,
    public readonly requesterId: string,
  ) {}
}

// ---- Helpers -------------------------------------------------------------

async function loadBracketOrThrow(
  brackets: BracketRepository,
  divisionId: string,
): Promise<Bracket> {
  const b = await brackets.findByDivisionId(DivisionId(divisionId));
  if (!b) throw new NotFoundError('bracket', divisionId);
  return b;
}

async function loadEventForBracket(events: EventWriteStore, bracket: Bracket) {
  const evt = await events.findById(bracket.eventId);
  if (!evt) throw new NotFoundError('event', String(bracket.eventId));
  return evt;
}

function assertHost(eventHostId: string, requesterId: string): void {
  // Co-host check happens at the route boundary (no domain port for it
  // yet); this guard catches the trivial "non-host trying to mutate".
  if (eventHostId !== requesterId) {
    throw new UnauthorizedError('Only the event host can manage the bracket.');
  }
}

// ---- Handlers ------------------------------------------------------------

export class CreateBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
  ) {}

  async execute(cmd: CreateBracketCommand): Promise<{ bracketId: string }> {
    const evt = await this.events.findById(cmd.eventId);
    if (!evt) throw new NotFoundError('event', cmd.eventId);
    assertHost(evt.hostId, cmd.requesterId);
    const existing = await this.brackets.findByDivisionId(DivisionId(cmd.divisionId));
    if (existing) return { bracketId: existing.id };
    const min = minTeamsForFormat(cmd.format);
    const teams = await this.brackets.listRegisteredTeams(evt.id, DivisionId(cmd.divisionId));
    if (teams.length < min) {
      throw new ValidationError(
        `This format needs at least ${min} registered teams (only ${teams.length} so far).`,
        { teamCount: teams.length, minTeams: min, format: cmd.format },
      );
    }
    const bracket = Bracket.create(
      this.brackets.nextBracketId(),
      evt.id,
      DivisionId(cmd.divisionId),
      cmd.format,
      cmd.config,
    );
    await this.brackets.save(bracket);
    return { bracketId: bracket.id };
  }
}

export class SeedBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
  ) {}

  async execute(cmd: SeedBracketCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    bracket.seedTeams(
      cmd.entryIdsInOrder.map((t) => EntryId(t)),
      cmd.pools,
    );
    await this.brackets.save(bracket);
  }
}

export class GenerateBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
  ) {}

  async execute(cmd: GenerateBracketCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    bracket.generate(() => this.brackets.nextMatchId());
    await this.brackets.save(bracket);
  }
}

export class GeneratePlayoffHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
  ) {}

  async execute(cmd: GeneratePlayoffCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    bracket.generatePlayoff(() => this.brackets.nextMatchId());
    await this.brackets.save(bracket);
  }
}

export class ResetBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
  ) {}

  async execute(cmd: ResetBracketCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    bracket.reset();
    await this.brackets.save(bracket);
  }
}

export class ReorderPoolMatchesHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
  ) {}

  async execute(cmd: ReorderPoolMatchesCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    bracket.reorderPoolMatches(
      cmd.pool,
      cmd.matchIdsInOrder.map((id) => MatchId(id)),
    );
    await this.brackets.save(bracket);
  }
}

export class RecordMatchResultHandler {
  constructor(private readonly brackets: BracketRepository) {}

  async execute(cmd: RecordMatchResultCommand): Promise<void> {
    // Permissions for "host or captain of either team" are enforced by
    // Postgres RLS at the persistence boundary — but only because the write
    // goes through `saveAsMatchActor`, which routes the domain-computed
    // bracket through the authorization-gated `record_bracket_match_result`
    // RPC (keyed on `cmd.matchId`) via a user-scoped client. The plain
    // host-only `save` would bypass that gate. The domain enforces the
    // match state-machine guards; the DB has the final say on who may write.
    const bracket = await this.brackets.findByMatchId(MatchId(cmd.matchId));
    if (!bracket) throw new NotFoundError('bracket', cmd.matchId);
    bracket.recordResult({
      matchId: MatchId(cmd.matchId),
      sets: cmd.sets,
    });
    await this.brackets.saveAsMatchActor(bracket, MatchId(cmd.matchId));
  }
}

export class ResetMatchHandler {
  constructor(private readonly brackets: BracketRepository) {}

  async execute(cmd: ResetMatchCommand): Promise<void> {
    // Same authorization model as RecordMatchResultHandler: clearing a
    // match's result is gated on host-or-captain-of-`cmd.matchId` by the
    // `record_bracket_match_result` RPC behind `saveAsMatchActor`.
    const bracket = await this.brackets.findByMatchId(MatchId(cmd.matchId));
    if (!bracket) throw new NotFoundError('bracket', cmd.matchId);
    bracket.resetMatch(MatchId(cmd.matchId));
    await this.brackets.saveAsMatchActor(bracket, MatchId(cmd.matchId));
  }
}
