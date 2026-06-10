import { describe, expect, it } from 'vitest';
import {
  Bracket,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  type BracketId,
  type BracketRepository,
  type BracketSummary,
  type BracketTeamLite,
  type EntryId,
  type MatchId,
  type UserId,
} from '@pickupvb/domain';
import {
  AddBracketTeamCommand,
  AddBracketTeamHandler,
  AddBracketTeamsCommand,
  AddBracketTeamsHandler,
  AddStandaloneMatchCommand,
  AddStandaloneMatchHandler,
  CreateStandaloneBracketCommand,
  CreateStandaloneBracketHandler,
  DeleteStandaloneBracketCommand,
  DeleteStandaloneBracketHandler,
  EditStandaloneMatchCommand,
  EditStandaloneMatchHandler,
  GenerateStandaloneBracketHandler,
  GenerateStandaloneBracketCommand,
  PublishStandaloneBracketCommand,
  PublishStandaloneBracketHandler,
  ReopenStandaloneBracketCommand,
  ReopenStandaloneBracketHandler,
  ReplaceStandaloneEntryCommand,
  ReplaceStandaloneEntryHandler,
  SeedStandaloneBracketCommand,
  SeedStandaloneBracketHandler,
} from './standalone-bracket.handler.js';

const OWNER = 'owner-1' as UserId;
const OTHER = 'owner-2';

/** Minimal fake: serves a single bracket from findById, records saves and
 *  team inserts. The owner-gated full-replace uses `save` (admin client) — no
 *  saveAsMatchActor routing constraint here (that's the match-result path). */
class FakeRepo implements BracketRepository {
  saved: Bracket[] = [];
  addedTeams: Array<{ bracketId: string; name: string }> = [];
  deletedIds: string[] = [];
  private idSeq = 0;

  constructor(private readonly bracket: Bracket | null) {}

  nextMatchId(): MatchId {
    return `m-${++this.idSeq}` as MatchId;
  }
  nextBracketId(): BracketId {
    return 'b-new' as BracketId;
  }
  async findByDivisionId(): Promise<Bracket | null> {
    return null;
  }
  async findByMatchId(): Promise<Bracket | null> {
    return this.bracket;
  }
  async findById(): Promise<Bracket | null> {
    return this.bracket;
  }
  async save(bracket: Bracket): Promise<void> {
    this.saved.push(bracket);
  }
  async saveAsMatchActor(): Promise<void> {}
  async listRegisteredTeams(): Promise<BracketTeamLite[]> {
    return [];
  }
  async listDivisionStatuses(): Promise<ReadonlyArray<never>> {
    return [];
  }
  async listByOwner(): Promise<ReadonlyArray<BracketSummary>> {
    return [];
  }
  async listStandaloneTeams(): Promise<BracketTeamLite[]> {
    return [];
  }
  async addBracketTeam(bracketId: BracketId, name: string): Promise<{ entryId: string }> {
    this.addedTeams.push({ bracketId: String(bracketId), name });
    return { entryId: `entry-${this.addedTeams.length}` };
  }
  async addBracketTeams(
    bracketId: BracketId,
    names: ReadonlyArray<string>,
  ): Promise<Array<{ entryId: string; name: string }>> {
    return names.map((name) => {
      this.addedTeams.push({ bracketId: String(bracketId), name });
      return { entryId: `entry-${this.addedTeams.length}`, name };
    });
  }
  async deleteBracket(bracketId: BracketId): Promise<void> {
    this.deletedIds.push(String(bracketId));
  }
}

function ownedSetupBracket(): Bracket {
  return Bracket.createStandalone('b-1' as BracketId, OWNER, 'single_elimination');
}

/** Owned 4-team single-elim bracket in `draft` (generated, not published). */
function ownedDraftBracket(): Bracket {
  const b = Bracket.createStandalone('b-1' as BracketId, OWNER, 'single_elimination', {
    bestOf: 1,
  });
  b.seedTeams(['e1', 'e2', 'e3', 'e4'] as EntryId[]);
  let n = 0;
  b.generate(() => `m-${++n}` as MatchId);
  return b;
}

/** Owned 2-team single-elim bracket played to completion (status `completed`). */
function ownedCompletedBracket(): Bracket {
  const b = Bracket.createStandalone('b-1' as BracketId, OWNER, 'single_elimination', {
    bestOf: 1,
  });
  b.seedTeams(['e1', 'e2'] as EntryId[]);
  let n = 0;
  b.generate(() => `m-${++n}` as MatchId);
  b.publish();
  const matchId = b.matches[0]!.id;
  b.recordResult({ matchId, sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 10 }] });
  return b;
}

describe('CreateStandaloneBracketHandler', () => {
  it('creates an owner-scoped bracket and saves it', async () => {
    const repo = new FakeRepo(null);
    const handler = new CreateStandaloneBracketHandler(repo);

    const { bracketId } = await handler.execute(
      new CreateStandaloneBracketCommand(String(OWNER), 'single_elimination'),
    );

    expect(bracketId).toBe('b-new');
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]!.ownerUserId).toBe(OWNER);
    expect(repo.saved[0]!.eventId).toBeNull();
  });
});

describe('owner gate (loadOwnedBracket)', () => {
  it('throws UnauthorizedError when the requester is not the owner', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    const handler = new SeedStandaloneBracketHandler(repo);

    await expect(
      handler.execute(new SeedStandaloneBracketCommand('b-1', OTHER, ['e1', 'e2'])),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFoundError when the bracket is unknown', async () => {
    const repo = new FakeRepo(null);
    const handler = new SeedStandaloneBracketHandler(repo);

    await expect(
      handler.execute(new SeedStandaloneBracketCommand('missing', String(OWNER), ['e1', 'e2'])),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('SeedStandaloneBracketHandler', () => {
  it('seeds the owned bracket and persists', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    const handler = new SeedStandaloneBracketHandler(repo);

    await handler.execute(
      new SeedStandaloneBracketCommand('b-1', String(OWNER), ['e1', 'e2', 'e3']),
    );

    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]!.seeds.map((s) => s.entryId)).toEqual(['e1', 'e2', 'e3'] as EntryId[]);
  });
});

describe('Standalone draft + manual edits (TT-11)', () => {
  it('GenerateStandaloneBracketHandler lands the bracket in draft, not active (no auto-publish)', async () => {
    const b = ownedSetupBracket();
    b.seedTeams(['e1', 'e2'] as EntryId[]);
    const repo = new FakeRepo(b);
    await new GenerateStandaloneBracketHandler(repo).execute(
      new GenerateStandaloneBracketCommand('b-1', String(OWNER)),
    );
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]!.status).toBe('draft');
  });

  it('PublishStandaloneBracketHandler publishes a draft to active', async () => {
    const repo = new FakeRepo(ownedDraftBracket());
    await new PublishStandaloneBracketHandler(repo).execute(
      new PublishStandaloneBracketCommand('b-1', String(OWNER)),
    );
    expect(repo.saved[0]!.status).toBe('active');
  });

  it('PublishStandaloneBracketHandler rejects a non-owner', async () => {
    const repo = new FakeRepo(ownedDraftBracket());
    await expect(
      new PublishStandaloneBracketHandler(repo).execute(
        new PublishStandaloneBracketCommand('b-1', OTHER),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.saved).toHaveLength(0);
  });

  it('EditStandaloneMatchHandler patches a match (court + bestOf) and persists', async () => {
    const b = ownedDraftBracket();
    const matchId = b.matches.find((m) => m.entryAId && m.entryBId)!.id;
    const repo = new FakeRepo(b);
    await new EditStandaloneMatchHandler(repo).execute(
      new EditStandaloneMatchCommand('b-1', String(OWNER), String(matchId), {
        court: 'Court 3',
        bestOf: 3,
      }),
    );
    const m = repo.saved[0]!.matches.find((x) => String(x.id) === String(matchId))!;
    expect(m.court).toBe('Court 3');
    expect(m.bestOf).toBe(3);
  });

  it('EditStandaloneMatchHandler rejects a non-owner', async () => {
    const b = ownedDraftBracket();
    const matchId = b.matches[0]!.id;
    const repo = new FakeRepo(b);
    await expect(
      new EditStandaloneMatchHandler(repo).execute(
        new EditStandaloneMatchCommand('b-1', OTHER, String(matchId), { court: 'X' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.saved).toHaveLength(0);
  });

  it('AddStandaloneMatchHandler appends a match and returns its id', async () => {
    const repo = new FakeRepo(ownedDraftBracket());
    const { matchId } = await new AddStandaloneMatchHandler(repo).execute(
      new AddStandaloneMatchCommand('b-1', String(OWNER), { entryAId: 'e1', entryBId: 'e2' }),
    );
    expect(matchId).toBeTruthy();
    expect(repo.saved[0]!.matches.some((m) => String(m.id) === matchId)).toBe(true);
  });

  it('ReplaceStandaloneEntryHandler swaps an entry everywhere it appears', async () => {
    const b = ownedDraftBracket();
    const repo = new FakeRepo(b);
    await new ReplaceStandaloneEntryHandler(repo).execute(
      new ReplaceStandaloneEntryCommand('b-1', String(OWNER), 'e1', 'e9'),
    );
    const saved = repo.saved[0]!;
    expect(saved.seeds.some((s) => String(s.entryId) === 'e9')).toBe(true);
    expect(saved.seeds.some((s) => String(s.entryId) === 'e1')).toBe(false);
  });
});

describe('ReopenStandaloneBracketHandler (TT-10)', () => {
  it('re-opens a completed bracket to active and persists', async () => {
    const repo = new FakeRepo(ownedCompletedBracket());
    await new ReopenStandaloneBracketHandler(repo).execute(
      new ReopenStandaloneBracketCommand('b-1', String(OWNER)),
    );
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]!.status).toBe('active');
  });

  it('rejects a non-owner with UnauthorizedError', async () => {
    const repo = new FakeRepo(ownedCompletedBracket());
    await expect(
      new ReopenStandaloneBracketHandler(repo).execute(
        new ReopenStandaloneBracketCommand('b-1', OTHER),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.saved).toHaveLength(0);
  });
});

describe('DeleteStandaloneBracketHandler (TT-12)', () => {
  it('deletes the owned bracket', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    await new DeleteStandaloneBracketHandler(repo).execute(
      new DeleteStandaloneBracketCommand('b-1', String(OWNER)),
    );
    expect(repo.deletedIds).toEqual(['b-1']);
  });

  it('rejects a non-owner and deletes nothing', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    await expect(
      new DeleteStandaloneBracketHandler(repo).execute(
        new DeleteStandaloneBracketCommand('b-1', OTHER),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.deletedIds).toHaveLength(0);
  });

  it('throws NotFoundError when the bracket is unknown', async () => {
    const repo = new FakeRepo(null);
    await expect(
      new DeleteStandaloneBracketHandler(repo).execute(
        new DeleteStandaloneBracketCommand('missing', String(OWNER)),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.deletedIds).toHaveLength(0);
  });
});

describe('AddBracketTeamHandler', () => {
  it('adds a team while the bracket is in setup', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    const handler = new AddBracketTeamHandler(repo);

    const { entryId } = await handler.execute(
      new AddBracketTeamCommand('b-1', String(OWNER), '  Spikers  '),
    );

    expect(entryId).toBe('entry-1');
    expect(repo.addedTeams).toEqual([{ bracketId: 'b-1', name: 'Spikers' }]);
  });

  it('rejects adding a team after the bracket is generated', async () => {
    const bracket = ownedSetupBracket();
    bracket.seedTeams(['e1', 'e2'] as EntryId[]);
    const repo = new FakeRepo(bracket);
    // Generate so status leaves `setup` (lands in `draft` post-TT-11).
    await new GenerateStandaloneBracketHandler(repo).execute(
      new GenerateStandaloneBracketCommand('b-1', String(OWNER)),
    );

    const handler = new AddBracketTeamHandler(repo);
    await expect(
      handler.execute(new AddBracketTeamCommand('b-1', String(OWNER), 'Late team')),
    ).rejects.toBeInstanceOf(InvariantViolation);
    expect(repo.addedTeams).toHaveLength(0);
  });
});

describe('AddBracketTeamsHandler (paste-a-list bulk add)', () => {
  it('trims blanks and collapses case-insensitive duplicate lines', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    const handler = new AddBracketTeamsHandler(repo);

    const added = await handler.execute(
      new AddBracketTeamsCommand('b-1', String(OWNER), [
        '  Spikers  ',
        '',
        'Block Party',
        'spikers', // duplicate of "Spikers" (case-insensitive)
        '   ',
      ]),
    );

    expect(added.map((t) => t.name)).toEqual(['Spikers', 'Block Party']);
    expect(repo.addedTeams).toEqual([
      { bracketId: 'b-1', name: 'Spikers' },
      { bracketId: 'b-1', name: 'Block Party' },
    ]);
  });

  it('rejects a batch with no usable names', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    const handler = new AddBracketTeamsHandler(repo);

    await expect(
      handler.execute(new AddBracketTeamsCommand('b-1', String(OWNER), ['', '  '])),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.addedTeams).toHaveLength(0);
  });

  it('rejects adding teams after the bracket is generated', async () => {
    const bracket = ownedSetupBracket();
    bracket.seedTeams(['e1', 'e2'] as EntryId[]);
    const repo = new FakeRepo(bracket);
    await new GenerateStandaloneBracketHandler(repo).execute(
      new GenerateStandaloneBracketCommand('b-1', String(OWNER)),
    );

    const handler = new AddBracketTeamsHandler(repo);
    await expect(
      handler.execute(new AddBracketTeamsCommand('b-1', String(OWNER), ['Late team'])),
    ).rejects.toBeInstanceOf(InvariantViolation);
    expect(repo.addedTeams).toHaveLength(0);
  });

  it('rejects a batch from a non-owner', async () => {
    const repo = new FakeRepo(ownedSetupBracket());
    const handler = new AddBracketTeamsHandler(repo);

    await expect(
      handler.execute(new AddBracketTeamsCommand('b-1', OTHER, ['Spikers'])),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.addedTeams).toHaveLength(0);
  });
});
