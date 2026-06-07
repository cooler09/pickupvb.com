import type { BracketConfig, BracketFormat, BracketRepository } from '@pickupvb/domain';
import {
  BracketStructuralHandler,
  buildAddMatchInput,
  buildMatchPatch,
  type AddMatchInputDto,
  type EditMatchPatchInput,
} from './bracket.handler.js';
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

/** Host-override of the auto cross-seed: rebuild the playoff from a chosen
 *  overall order (`orderedEntryIds[0]` = #1 seed). See {@link Bracket.seedPlayoff}. */
export class SeedStandalonePlayoffCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly orderedEntryIds: ReadonlyArray<string>,
  ) {}
}

export class ResetStandaloneBracketCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReopenStandaloneBracketCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
  ) {}
}

export class DeleteStandaloneBracketCommand {
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

// ---- Manual-edit commands (ADR 0032 / TT-11) -----------------------------
//
// Standalone parity for the event-path draft + live structural edits. Every
// command keys on the bracket id and is owner-gated in its handler. The DTO
// shapes (`EditMatchPatchInput` / `AddMatchInputDto`) and branding helpers
// (`buildMatchPatch` / `buildAddMatchInput`) are shared with the event path.

export class PublishStandaloneBracketCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
  ) {}
}

export class SetStandalonePoolsCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly assignments: ReadonlyArray<{ entryId: string; pool: string | null }>,
  ) {}
}

export class EditStandaloneMatchCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly matchId: string,
    public readonly patch: EditMatchPatchInput,
  ) {}
}

export class AddStandaloneMatchCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly input: AddMatchInputDto,
  ) {}
}

export class RemoveStandaloneMatchCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly matchId: string,
  ) {}
}

export class ReplaceStandaloneEntryCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly oldEntryId: string,
    public readonly newEntryId: string,
  ) {}
}

export class AddBracketTeamCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly name: string,
  ) {}
}

export class AddBracketTeamsCommand {
  constructor(
    public readonly bracketId: string,
    public readonly requesterId: string,
    public readonly names: ReadonlyArray<string>,
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
//
// Every owner-gated handler extends the shared `BracketStructuralHandler`
// (bracket.handler.ts): the base owns the `brackets`/`analytics` deps + the
// `runMutation` save+dispatch tail, so these bodies are just "resolve the
// owned bracket → mutate". The only difference from the event path is the
// resolver (`loadOwnedBracket` owner check vs. `loadHost` event-host check).
// Match-result recording/reset is NOT here — those reuse the event-path
// `RecordMatchResultHandler` / `ResetMatchHandler` (match-id routed through the
// owner-aware `record_bracket_match_result` RPC).

export class CreateStandaloneBracketHandler extends BracketStructuralHandler {
  async execute(cmd: CreateStandaloneBracketCommand): Promise<{ bracketId: string }> {
    const bracket = Bracket.createStandalone(
      this.brackets.nextBracketId(),
      UserId(cmd.requesterId),
      cmd.format,
      cmd.config,
    );
    return this.runMutation(bracket, (b) => ({ bracketId: b.id }));
  }
}

export class SeedStandaloneBracketHandler extends BracketStructuralHandler {
  async execute(cmd: SeedStandaloneBracketCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) =>
      b.seedTeams(
        cmd.entryIdsInOrder.map((t) => EntryId(t)),
        cmd.pools,
      ),
    );
  }
}

export class GenerateStandaloneBracketHandler extends BracketStructuralHandler {
  async execute(cmd: GenerateStandaloneBracketCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    // ADR 0032 / TT-11: generate() lands in `draft`. Standalone now has the
    // full draft workspace (review → edit → Publish), so the auto-publish
    // bridge was removed — the owner publishes explicitly via
    // PublishStandaloneBracketHandler. Mirrors GenerateBracketHandler.
    await this.runMutation(bracket, (b) => b.generate(() => this.brackets.nextMatchId()));
  }
}

export class GenerateStandalonePlayoffHandler extends BracketStructuralHandler {
  async execute(cmd: GenerateStandalonePlayoffCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) => b.generatePlayoff(() => this.brackets.nextMatchId()));
  }
}

export class SeedStandalonePlayoffHandler extends BracketStructuralHandler {
  async execute(cmd: SeedStandalonePlayoffCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) =>
      b.seedPlayoff(
        () => this.brackets.nextMatchId(),
        cmd.orderedEntryIds.map((id) => EntryId(id)),
      ),
    );
  }
}

export class ResetStandaloneBracketHandler extends BracketStructuralHandler {
  async execute(cmd: ResetStandaloneBracketCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) => b.reset());
  }
}

export class ReorderStandalonePoolMatchesHandler extends BracketStructuralHandler {
  async execute(cmd: ReorderStandalonePoolMatchesCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) =>
      b.reorderPoolMatches(
        cmd.pool,
        cmd.matchIdsInOrder.map((id) => MatchId(id)),
      ),
    );
  }
}

export class ReopenStandaloneBracketHandler extends BracketStructuralHandler {
  async execute(cmd: ReopenStandaloneBracketCommand): Promise<void> {
    // TT-10: re-open a completed standalone bracket so the owner can fix a
    // mis-entered result. Mirrors the event-path ReopenBracketHandler;
    // owner-gated rather than host-gated. The domain `reopen()` rejects
    // anything but a completed bracket.
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) => b.reopen());
  }
}

export class DeleteStandaloneBracketHandler extends BracketStructuralHandler {
  async execute(cmd: DeleteStandaloneBracketCommand): Promise<void> {
    // TT-12: abandon a standalone bracket (freeing the free-tier active-bracket
    // slot). Owner-gated via loadOwnedBracket — an event bracket (ownerUserId
    // null) is rejected, so this path only ever deletes standalone brackets.
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.brackets.deleteBracket(bracket.id);
  }
}

// ---- Manual-edit handlers (ADR 0032 / TT-11) -----------------------------
//
// Each loads the owned bracket, mutates the aggregate, persists via the
// owner-gated host `save`, and dispatches the analytics outbox — the standalone
// twin of the event-path host-gated structural handlers.

export class PublishStandaloneBracketHandler extends BracketStructuralHandler {
  async execute(cmd: PublishStandaloneBracketCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) => b.publish());
  }
}

export class SetStandalonePoolsHandler extends BracketStructuralHandler {
  async execute(cmd: SetStandalonePoolsCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) =>
      b.setPools(cmd.assignments.map((a) => ({ entryId: EntryId(a.entryId), pool: a.pool }))),
    );
  }
}

export class EditStandaloneMatchHandler extends BracketStructuralHandler {
  async execute(cmd: EditStandaloneMatchCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) =>
      b.editMatch(MatchId(cmd.matchId), buildMatchPatch(cmd.patch)),
    );
  }
}

export class AddStandaloneMatchHandler extends BracketStructuralHandler {
  async execute(cmd: AddStandaloneMatchCommand): Promise<{ matchId: string }> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    const id = await this.runMutation(bracket, (b) =>
      b.addMatch(() => this.brackets.nextMatchId(), buildAddMatchInput(cmd.input)),
    );
    return { matchId: String(id) };
  }
}

export class RemoveStandaloneMatchHandler extends BracketStructuralHandler {
  async execute(cmd: RemoveStandaloneMatchCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) => b.removeMatch(MatchId(cmd.matchId)));
  }
}

export class ReplaceStandaloneEntryHandler extends BracketStructuralHandler {
  async execute(cmd: ReplaceStandaloneEntryCommand): Promise<void> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    await this.runMutation(bracket, (b) =>
      b.replaceEntry(EntryId(cmd.oldEntryId), EntryId(cmd.newEntryId)),
    );
  }
}

export class AddBracketTeamHandler extends BracketStructuralHandler {
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

/** Upper bound on a single paste-a-list batch — generous for a real
 *  tournament, but a guard against a pathological paste. */
const MAX_BULK_TEAMS = 128;

export class AddBracketTeamsHandler extends BracketStructuralHandler {
  async execute(cmd: AddBracketTeamsCommand): Promise<Array<{ entryId: string; name: string }>> {
    const bracket = await loadOwnedBracket(this.brackets, cmd.bracketId, cmd.requesterId);
    if (bracket.status !== 'setup') {
      throw new InvariantViolation(
        'Teams can only be added before the bracket is generated. Reset the bracket first.',
      );
    }
    // Trim, drop blanks, and collapse exact (case-insensitive) duplicates within
    // the batch so an accidental repeated line doesn't create twin teams. Names
    // that merely collide with an already-registered team are allowed through —
    // the single-add path imposes no uniqueness, so we keep parity here.
    const seen = new Set<string>();
    const names: string[] = [];
    for (const raw of cmd.names) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    if (names.length === 0) throw new ValidationError('Add at least one team name.');
    if (names.length > MAX_BULK_TEAMS) {
      throw new ValidationError(`Add at most ${MAX_BULK_TEAMS} teams at a time.`);
    }
    return this.brackets.addBracketTeams(BracketId(cmd.bracketId), names);
  }
}
