import { describe, expect, it } from 'vitest';
import {
  Bracket,
  DEFAULT_BRACKET_CONFIG,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  type BracketId,
  type BracketRepository,
  type BracketTeamLite,
  type DivisionId,
  type EntryId,
  type EventId,
  type EventWriteStore,
  type Match,
  type MatchId,
} from '@pickupvb/domain';
import {
  CreateBracketCommand,
  CreateBracketHandler,
  EditMatchCommand,
  EditMatchHandler,
  PublishBracketCommand,
  PublishBracketHandler,
  RecordMatchResultHandler,
  ResetMatchHandler,
  SetPoolsCommand,
  SetPoolsHandler,
} from './bracket.handler.js';

const BRACKET_ID = 'bracket-1' as BracketId;
const DIVISION_ID = 'div-1' as DivisionId;
const EVENT_ID = 'event-1' as EventId;
const MATCH_ID = 'm1' as MatchId;

function activeBracketWithOneMatch(): Bracket {
  const match: Match = {
    id: MATCH_ID,
    round: 1,
    matchNumber: 1,
    pool: null,
    bracketSide: null,
    entryAId: 'e1' as EntryId,
    entryBId: 'e2' as EntryId,
    winnerEntryId: null,
    workTeamId: null,
    status: 'pending',
    sets: [],
    court: null,
    slot: null,
    bestOf: null,
    targetScore: null,
    advancesToMatchId: null,
    advancesToSlot: null,
    loserAdvancesToMatchId: null,
    loserAdvancesToSlot: null,
    scheduledAt: null,
  };
  return Bracket.fromPersistence({
    id: BRACKET_ID,
    eventId: EVENT_ID,
    divisionId: DIVISION_ID,
    ownerUserId: null,
    format: 'single_elimination',
    config: { ...DEFAULT_BRACKET_CONFIG, bestOf: 1 },
    status: 'active',
    seeds: [],
    matches: [match],
  });
}

/**
 * Fake whose `save()` throws and whose `saveAsMatchActor()` records the call.
 * The host-only full-replace `save` runs through the service-role admin
 * client and bypasses RLS; the captain-reachable record/reset path MUST use
 * `saveAsMatchActor`, which routes through the authorization-gated
 * `record_bracket_match_result` RPC. These tests fail if a handler reverts
 * to `save` — re-opening the captain-RLS gap. See
 * docs/audits/event-data-model.md.
 */
class FakeBracketRepo implements BracketRepository {
  saveCount = 0;
  actorCalls: Array<{ bracketId: string; actorMatchId: string }> = [];

  constructor(private readonly bracket: Bracket | null) {}

  nextMatchId(): MatchId {
    return 'm-new' as MatchId;
  }
  nextBracketId(): BracketId {
    return 'b-new' as BracketId;
  }
  async findByDivisionId(): Promise<Bracket | null> {
    return this.bracket;
  }
  async findByMatchId(): Promise<Bracket | null> {
    return this.bracket;
  }
  async findById(): Promise<Bracket | null> {
    return this.bracket;
  }
  async save(): Promise<void> {
    this.saveCount += 1;
    throw new Error('save() bypasses RLS; captain-reachable writes must use saveAsMatchActor');
  }
  async deleteBracket(): Promise<void> {}
  async saveAsMatchActor(bracket: Bracket, actorMatchId: MatchId): Promise<void> {
    this.actorCalls.push({ bracketId: bracket.id, actorMatchId: String(actorMatchId) });
  }
  async listRegisteredTeams(): Promise<BracketTeamLite[]> {
    return [];
  }
  async listByOwner(): Promise<ReadonlyArray<never>> {
    return [];
  }
  async listStandaloneTeams(): Promise<BracketTeamLite[]> {
    return [];
  }
  async addBracketTeam(): Promise<{ entryId: string }> {
    return { entryId: 'entry-new' };
  }
  async addBracketTeams(): Promise<Array<{ entryId: string; name: string }>> {
    return [];
  }
}

describe('RecordMatchResultHandler (captain-RLS routing)', () => {
  it('persists via saveAsMatchActor keyed on the recorded match, never the host-only save', async () => {
    const repo = new FakeBracketRepo(activeBracketWithOneMatch());
    const handler = new RecordMatchResultHandler(repo);

    await handler.execute({
      matchId: String(MATCH_ID),
      requesterId: 'captain',
      sets: [{ setNumber: 1, teamAScore: 25, teamBScore: 20 }],
    });

    expect(repo.saveCount).toBe(0);
    expect(repo.actorCalls).toEqual([
      { bracketId: String(BRACKET_ID), actorMatchId: String(MATCH_ID) },
    ]);
  });

  it('throws NotFoundError when the match resolves to no bracket', async () => {
    const repo = new FakeBracketRepo(null);
    const handler = new RecordMatchResultHandler(repo);

    await expect(
      handler.execute({ matchId: 'missing', requesterId: 'captain', sets: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ResetMatchHandler (captain-RLS routing)', () => {
  it('persists the reset via saveAsMatchActor keyed on the match, never the host-only save', async () => {
    const repo = new FakeBracketRepo(activeBracketWithOneMatch());
    const handler = new ResetMatchHandler(repo);

    await handler.execute({ matchId: String(MATCH_ID), requesterId: 'captain' });

    expect(repo.saveCount).toBe(0);
    expect(repo.actorCalls).toEqual([
      { bracketId: String(BRACKET_ID), actorMatchId: String(MATCH_ID) },
    ]);
  });
});

// ---- ADR 0032 host-gated structural edits ---------------------------

const HOST = 'host-1';

/** Minimal EventWriteStore exposing only the `findById` the bracket handlers
 *  call; returns an event with the given host so `assertHost` can run. */
function hostEvents(hostId = HOST): EventWriteStore {
  return {
    async findById() {
      return { id: EVENT_ID, hostId };
    },
  } as unknown as EventWriteStore;
}

/** Host-path repo whose `save` records the persisted aggregate (the host-gated
 *  structural mutations use `save`, not `saveAsMatchActor`). */
class HostBracketRepo implements BracketRepository {
  saveCount = 0;
  saved: Bracket | null = null;
  private idN = 0;

  constructor(private readonly bracket: Bracket | null) {}

  nextMatchId(): MatchId {
    return `mnew-${++this.idN}` as MatchId;
  }
  nextBracketId(): BracketId {
    return 'b-new' as BracketId;
  }
  async findByDivisionId(): Promise<Bracket | null> {
    return this.bracket;
  }
  async findByMatchId(): Promise<Bracket | null> {
    return this.bracket;
  }
  async findById(): Promise<Bracket | null> {
    return this.bracket;
  }
  async save(bracket: Bracket): Promise<void> {
    this.saveCount += 1;
    this.saved = bracket;
  }
  async saveAsMatchActor(): Promise<void> {
    throw new Error('host-gated structural edits must use save(), not saveAsMatchActor');
  }
  async deleteBracket(): Promise<void> {}
  async listRegisteredTeams(): Promise<BracketTeamLite[]> {
    return [];
  }
  async listByOwner(): Promise<ReadonlyArray<never>> {
    return [];
  }
  async listStandaloneTeams(): Promise<BracketTeamLite[]> {
    return [];
  }
  async addBracketTeam(): Promise<{ entryId: string }> {
    return { entryId: 'entry-new' };
  }
  async addBracketTeams(): Promise<Array<{ entryId: string; name: string }>> {
    return [];
  }
}

/** Host-path repo with no existing bracket and a configurable registered-team
 *  count — drives the CreateBracketHandler precondition tests (TT-9). */
class CountRepo extends HostBracketRepo {
  constructor(private readonly teamCount: number) {
    super(null);
  }
  override async listRegisteredTeams(): Promise<BracketTeamLite[]> {
    return Array.from({ length: this.teamCount }, (_, i) => ({
      teamId: null,
      entryId: `e${i}`,
      name: `Team ${i}`,
      captainId: null,
      forfeitedAt: null,
    }));
  }
}

function draftElim4(): Bracket {
  let n = 0;
  const b = Bracket.create(BRACKET_ID, EVENT_ID, DIVISION_ID, 'single_elimination', { bestOf: 1 });
  b.seedTeams(['e1', 'e2', 'e3', 'e4'] as EntryId[]);
  b.generate(() => `m-${++n}` as MatchId);
  return b; // status: draft
}

describe('Host-gated structural handlers (ADR 0032)', () => {
  it('PublishBracketHandler publishes a draft via the host save', async () => {
    const repo = new HostBracketRepo(draftElim4());
    await new PublishBracketHandler(hostEvents(), repo).execute(
      new PublishBracketCommand(String(DIVISION_ID), HOST),
    );
    expect(repo.saveCount).toBe(1);
    expect(repo.saved!.status).toBe('active');
  });

  it('rejects a non-host with UnauthorizedError and does not save', async () => {
    const repo = new HostBracketRepo(draftElim4());
    await expect(
      new PublishBracketHandler(hostEvents(), repo).execute(
        new PublishBracketCommand(String(DIVISION_ID), 'intruder'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.saveCount).toBe(0);
  });

  it('throws NotFoundError when the division has no bracket', async () => {
    const repo = new HostBracketRepo(null);
    await expect(
      new PublishBracketHandler(hostEvents(), repo).execute(
        new PublishBracketCommand(String(DIVISION_ID), HOST),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('EditMatchHandler applies a patch (court + per-match bestOf) and persists', async () => {
    const bracket = draftElim4();
    const matchId = bracket.matches.find((m) => m.entryAId && m.entryBId)!.id;
    const repo = new HostBracketRepo(bracket);
    await new EditMatchHandler(hostEvents(), repo).execute(
      new EditMatchCommand(String(DIVISION_ID), HOST, String(matchId), {
        court: 'Court 7',
        bestOf: 3,
      }),
    );
    expect(repo.saveCount).toBe(1);
    const m = repo.saved!.matches.find((x) => String(x.id) === String(matchId))!;
    expect(m.court).toBe('Court 7');
    expect(m.bestOf).toBe(3);
  });

  it('CreateBracketHandler rejects a double-elim field that is not a power of two (TT-9)', async () => {
    // 6 registered teams meets the old floor (3) but the v1 generator can't
    // build a non-power-of-two double-elim — reject at create, before save.
    const repo = new CountRepo(6);
    await expect(
      new CreateBracketHandler(hostEvents(), repo).execute(
        new CreateBracketCommand(String(EVENT_ID), String(DIVISION_ID), HOST, 'double_elimination'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.saveCount).toBe(0);
  });

  it('CreateBracketHandler accepts a power-of-two double-elim field', async () => {
    const repo = new CountRepo(8);
    const { bracketId } = await new CreateBracketHandler(hostEvents(), repo).execute(
      new CreateBracketCommand(String(EVENT_ID), String(DIVISION_ID), HOST, 'double_elimination'),
    );
    expect(bracketId).toBe('b-new');
    expect(repo.saveCount).toBe(1);
    expect(repo.saved!.status).toBe('setup');
  });

  it('CreateBracketHandler rejects pool play under-configured for advance-per-pool (TT-16)', async () => {
    // 5 teams, 2 pools advancing 3 each → needs 6; the floor (4) alone would
    // have let it through.
    const repo = new CountRepo(5);
    await expect(
      new CreateBracketHandler(hostEvents(), repo).execute(
        new CreateBracketCommand(String(EVENT_ID), String(DIVISION_ID), HOST, 'pool_play_playoff', {
          poolCount: 2,
          advancePerPool: 3,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.saveCount).toBe(0);
  });

  it('SetPoolsHandler brands entry ids and assigns pools', async () => {
    const bracket = Bracket.create(BRACKET_ID, EVENT_ID, DIVISION_ID, 'pool_play_playoff', {
      bestOf: 1,
    });
    bracket.seedTeams(['e1', 'e2', 'e3', 'e4'] as EntryId[]);
    const repo = new HostBracketRepo(bracket);
    await new SetPoolsHandler(hostEvents(), repo).execute(
      new SetPoolsCommand(String(DIVISION_ID), HOST, [
        { entryId: 'e1', pool: 'A' },
        { entryId: 'e2', pool: 'B' },
      ]),
    );
    expect(repo.saveCount).toBe(1);
    expect(repo.saved!.seeds.find((s) => String(s.entryId) === 'e1')!.pool).toBe('A');
    expect(repo.saved!.seeds.find((s) => String(s.entryId) === 'e2')!.pool).toBe('B');
  });
});
