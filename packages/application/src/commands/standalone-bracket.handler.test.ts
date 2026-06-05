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
  CreateStandaloneBracketCommand,
  CreateStandaloneBracketHandler,
  GenerateStandaloneBracketHandler,
  GenerateStandaloneBracketCommand,
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
}

function ownedSetupBracket(): Bracket {
  return Bracket.createStandalone('b-1' as BracketId, OWNER, 'single_elimination');
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
    // Generate so status flips to active.
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
