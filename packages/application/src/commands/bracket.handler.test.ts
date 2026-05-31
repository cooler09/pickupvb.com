import { describe, expect, it } from 'vitest';
import {
  Bracket,
  DEFAULT_BRACKET_CONFIG,
  NotFoundError,
  type BracketId,
  type BracketRepository,
  type BracketTeamLite,
  type DivisionId,
  type EntryId,
  type EventId,
  type Match,
  type MatchId,
} from '@pickupvb/domain';
import { RecordMatchResultHandler, ResetMatchHandler } from './bracket.handler.js';

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
