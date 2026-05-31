import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_MATCH_CONFIG,
  createLiveMatchScore,
  type LiveMatchScore,
  type LiveMatchScoreRepository,
  type MatchKind,
} from '@pickupvb/domain';
import {
  ClearLiveMatchScoreCommand,
  ClearLiveMatchScoreHandler,
  UpsertLiveMatchScoreCommand,
  UpsertLiveMatchScoreHandler,
} from './live-match-score.handler.js';

class FakeLiveScoreRepo implements LiveMatchScoreRepository {
  upserts: Array<{ matchId: string; kind: MatchKind; state: LiveMatchScore }> = [];
  cleared: string[] = [];

  async upsert(matchId: string, kind: MatchKind, state: LiveMatchScore): Promise<void> {
    this.upserts.push({ matchId, kind, state });
  }
  async clear(matchId: string): Promise<void> {
    this.cleared.push(matchId);
  }
  async findByMatchId(): Promise<LiveMatchScore | null> {
    return null;
  }
}

const state = createLiveMatchScore({ ...DEFAULT_LIVE_MATCH_CONFIG }, 0);

describe('UpsertLiveMatchScoreHandler', () => {
  it('persists the live score through the port with the match kind', async () => {
    const repo = new FakeLiveScoreRepo();
    const handler = new UpsertLiveMatchScoreHandler(repo);

    await handler.execute(new UpsertLiveMatchScoreCommand('match-1', 'bracket', state));

    expect(repo.upserts).toEqual([{ matchId: 'match-1', kind: 'bracket', state }]);
  });
});

describe('ClearLiveMatchScoreHandler', () => {
  it('clears the live score for the match', async () => {
    const repo = new FakeLiveScoreRepo();
    const handler = new ClearLiveMatchScoreHandler(repo);

    await handler.execute(new ClearLiveMatchScoreCommand('match-1'));

    expect(repo.cleared).toEqual(['match-1']);
  });
});
