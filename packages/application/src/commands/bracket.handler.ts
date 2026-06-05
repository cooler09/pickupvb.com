import type {
  AddMatchInput,
  AnalyticsPort,
  BracketConfig,
  BracketFormat,
  BracketRepository,
  EventWriteStore,
  MatchPatch,
  MatchSet,
} from '@pickupvb/domain';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import {
  Bracket,
  DivisionId,
  EntryId,
  MatchId,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  validateTeamCountForFormat,
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

// ---- Manual-edit commands (ADR 0032) -------------------------------------
//
// All host-gated, division-scoped, and persisted through the host-only
// full-replace `save` (admin client). Structural edits to a bracket are a
// host privilege — distinct from the captain-reachable match-result writes
// (`RecordMatchResultCommand` / `ResetMatchCommand`) which route through
// `saveAsMatchActor` + the RLS-gated RPC. See AGENTS.md pattern #8.

export class PublishBracketCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReopenBracketCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
  ) {}
}

export class SetPoolsCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly assignments: ReadonlyArray<{ entryId: string; pool: string | null }>,
  ) {}
}

/** Match-field patch carrying plain strings; the handler brands the entry ids. */
export interface EditMatchPatchInput {
  entryAId?: string | null;
  entryBId?: string | null;
  workTeamId?: string | null;
  court?: string | null;
  slot?: number | null;
  scheduledAt?: Date | null;
  bestOf?: number | null;
  targetScore?: number | null;
}

export class EditMatchCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly matchId: string,
    public readonly patch: EditMatchPatchInput,
  ) {}
}

/** New-match shape carrying plain strings; the handler brands the entry ids. */
export interface AddMatchInputDto {
  pool?: string | null;
  bracketSide?: 'winners' | 'losers' | 'final' | null;
  entryAId?: string | null;
  entryBId?: string | null;
  workTeamId?: string | null;
  court?: string | null;
  slot?: number | null;
  bestOf?: number | null;
  targetScore?: number | null;
  scheduledAt?: Date | null;
  round?: number;
}

export class AddMatchCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly input: AddMatchInputDto,
  ) {}
}

export class RemoveMatchCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly matchId: string,
  ) {}
}

export class SeedPlayoffCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly orderedEntryIds: ReadonlyArray<string>,
  ) {}
}

export class ReplaceEntryCommand {
  constructor(
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly oldEntryId: string,
    public readonly newEntryId: string,
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
  // These handlers only run for event-scoped brackets; a null eventId means a
  // standalone bracket reached an event handler (which the route never wires).
  if (!bracket.eventId) {
    throw new NotFoundError('event', String(bracket.id));
  }
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

/**
 * Load a division's bracket and assert the requester is the event host —
 * the shared preamble for every host-gated structural mutation (ADR 0032).
 */
async function loadHostBracket(
  events: EventWriteStore,
  brackets: BracketRepository,
  divisionId: string,
  requesterId: string,
): Promise<Bracket> {
  const bracket = await loadBracketOrThrow(brackets, divisionId);
  const evt = await loadEventForBracket(events, bracket);
  assertHost(evt.hostId, requesterId);
  return bracket;
}

// ---- Handlers ------------------------------------------------------------

export class CreateBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: CreateBracketCommand): Promise<{ bracketId: string }> {
    const evt = await this.events.findById(cmd.eventId);
    if (!evt) throw new NotFoundError('event', cmd.eventId);
    assertHost(evt.hostId, cmd.requesterId);
    const existing = await this.brackets.findByDivisionId(DivisionId(cmd.divisionId));
    if (existing) return { bracketId: existing.id };
    // Full structural precondition, not just a count: double elimination also
    // needs a power-of-two field, so a 5/6/7-team division can't run it (TT-9).
    const teams = await this.brackets.listRegisteredTeams(evt.id, DivisionId(cmd.divisionId));
    const check = validateTeamCountForFormat(cmd.format, teams.length);
    if (!check.ok) {
      throw new ValidationError(check.reason, { teamCount: teams.length, format: cmd.format });
    }
    const bracket = Bracket.create(
      this.brackets.nextBracketId(),
      evt.id,
      DivisionId(cmd.divisionId),
      cmd.format,
      cmd.config,
    );
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
    return { bracketId: bracket.id };
  }
}

export class SeedBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
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
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class GenerateBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: GenerateBracketCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    // ADR 0032: generate() lands in `draft` — the host reviews/edits the
    // generated schedule in the draft workspace, then publishes via
    // PublishBracketCommand. (The earlier auto-publish bridge was removed when
    // the draft UI shipped.)
    bracket.generate(() => this.brackets.nextMatchId());
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class GeneratePlayoffHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: GeneratePlayoffCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    bracket.generatePlayoff(() => this.brackets.nextMatchId());
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class ResetBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: ResetBracketCommand): Promise<void> {
    const bracket = await loadBracketOrThrow(this.brackets, cmd.divisionId);
    const evt = await loadEventForBracket(this.events, bracket);
    assertHost(evt.hostId, cmd.requesterId);
    bracket.reset();
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class ReorderPoolMatchesHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
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
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

// ---- Manual-edit handlers (ADR 0032) -------------------------------------
//
// Each follows the host-gated structural-mutation shape: load + assertHost
// (via loadHostBracket), mutate the aggregate, persist with the host-only
// `save`, then dispatch the analytics outbox. Built around the module-singleton
// admin-client bracketRepo in the composition root.

export class PublishBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: PublishBracketCommand): Promise<void> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    bracket.publish();
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class ReopenBracketHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: ReopenBracketCommand): Promise<void> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    bracket.reopen();
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class SetPoolsHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: SetPoolsCommand): Promise<void> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    bracket.setPools(cmd.assignments.map((a) => ({ entryId: EntryId(a.entryId), pool: a.pool })));
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class EditMatchHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: EditMatchCommand): Promise<void> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    bracket.editMatch(MatchId(cmd.matchId), buildMatchPatch(cmd.patch));
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class AddMatchHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: AddMatchCommand): Promise<{ matchId: string }> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    const id = bracket.addMatch(() => this.brackets.nextMatchId(), buildAddMatchInput(cmd.input));
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
    return { matchId: String(id) };
  }
}

export class RemoveMatchHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: RemoveMatchCommand): Promise<void> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    bracket.removeMatch(MatchId(cmd.matchId));
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class SeedPlayoffHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: SeedPlayoffCommand): Promise<void> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    bracket.seedPlayoff(
      () => this.brackets.nextMatchId(),
      cmd.orderedEntryIds.map((id) => EntryId(id)),
    );
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class ReplaceEntryHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: ReplaceEntryCommand): Promise<void> {
    const bracket = await loadHostBracket(
      this.events,
      this.brackets,
      cmd.divisionId,
      cmd.requesterId,
    );
    bracket.replaceEntry(EntryId(cmd.oldEntryId), EntryId(cmd.newEntryId));
    await this.brackets.save(bracket);
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

/** Brand entry-id strings and copy through only the keys the caller set
 *  (omitted ⇒ unchanged; `null` ⇒ clear). Mirrors the domain `MatchPatch`.
 *  Exported so the standalone manual-edit handlers reuse the same branding. */
export function buildMatchPatch(input: EditMatchPatchInput): MatchPatch {
  const patch: MatchPatch = {};
  if (input.entryAId !== undefined)
    patch.entryAId = input.entryAId === null ? null : EntryId(input.entryAId);
  if (input.entryBId !== undefined)
    patch.entryBId = input.entryBId === null ? null : EntryId(input.entryBId);
  if (input.workTeamId !== undefined)
    patch.workTeamId = input.workTeamId === null ? null : EntryId(input.workTeamId);
  if (input.court !== undefined) patch.court = input.court;
  if (input.slot !== undefined) patch.slot = input.slot;
  if (input.scheduledAt !== undefined) patch.scheduledAt = input.scheduledAt;
  if (input.bestOf !== undefined) patch.bestOf = input.bestOf;
  if (input.targetScore !== undefined) patch.targetScore = input.targetScore;
  return patch;
}

export function buildAddMatchInput(input: AddMatchInputDto): AddMatchInput {
  const out: AddMatchInput = {};
  if (input.pool !== undefined) out.pool = input.pool;
  if (input.bracketSide !== undefined) out.bracketSide = input.bracketSide;
  if (input.entryAId !== undefined)
    out.entryAId = input.entryAId === null ? null : EntryId(input.entryAId);
  if (input.entryBId !== undefined)
    out.entryBId = input.entryBId === null ? null : EntryId(input.entryBId);
  if (input.workTeamId !== undefined)
    out.workTeamId = input.workTeamId === null ? null : EntryId(input.workTeamId);
  if (input.court !== undefined) out.court = input.court;
  if (input.slot !== undefined) out.slot = input.slot;
  if (input.bestOf !== undefined) out.bestOf = input.bestOf;
  if (input.targetScore !== undefined) out.targetScore = input.targetScore;
  if (input.scheduledAt !== undefined) out.scheduledAt = input.scheduledAt;
  if (input.round !== undefined) out.round = input.round;
  return out;
}

export class RecordMatchResultHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

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
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}

export class ResetMatchHandler {
  constructor(
    private readonly brackets: BracketRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute(cmd: ResetMatchCommand): Promise<void> {
    // Same authorization model as RecordMatchResultHandler: clearing a
    // match's result is gated on host-or-captain-of-`cmd.matchId` by the
    // `record_bracket_match_result` RPC behind `saveAsMatchActor`.
    const bracket = await this.brackets.findByMatchId(MatchId(cmd.matchId));
    if (!bracket) throw new NotFoundError('bracket', cmd.matchId);
    bracket.resetMatch(MatchId(cmd.matchId));
    await this.brackets.saveAsMatchActor(bracket, MatchId(cmd.matchId));
    if (this.analytics) dispatchAnalyticsOutbox(bracket, this.analytics);
  }
}
