import { describe, expect, it } from 'vitest';
import {
  emptyPlayerBadgeStats,
  type BadgeGrantInput,
  type BadgeRepository,
  type GrantedBadge,
  type PlayerBadgeStats,
} from '@pickupvb/domain';
import { ReconcileUserBadgesHandler } from './badge.handler.js';

/**
 * In-memory fake that enforces the real idempotency contract: a second grant of
 * a badge the user already holds returns `false`. That is what the handler's
 * "newly granted" return value depends on.
 */
class FakeBadgeRepository implements BadgeRepository {
  readonly granted = new Set<string>();
  constructor(private readonly stats: PlayerBadgeStats) {}

  grant(input: BadgeGrantInput): Promise<boolean> {
    const id = `${input.userId}:${input.badgeKey}`;
    if (this.granted.has(id)) return Promise.resolve(false);
    this.granted.add(id);
    return Promise.resolve(true);
  }
  hasBadge(userId: string, badgeKey: string): Promise<boolean> {
    return Promise.resolve(this.granted.has(`${userId}:${badgeKey}`));
  }
  loadStats(): Promise<PlayerBadgeStats> {
    return Promise.resolve(this.stats);
  }
  listForUser(): Promise<GrantedBadge[]> {
    return Promise.resolve([]);
  }
}

describe('ReconcileUserBadgesHandler', () => {
  it('grants nothing for a brand-new account', async () => {
    const repo = new FakeBadgeRepository(emptyPlayerBadgeStats());
    const handler = new ReconcileUserBadgesHandler(repo);
    expect(await handler.execute('user-1')).toEqual([]);
    expect(repo.granted.size).toBe(0);
  });

  it('grants the qualifying badges and reports them as newly granted', async () => {
    const repo = new FakeBadgeRepository({
      ...emptyPlayerBadgeStats(),
      publishedEventCount: 1,
      attendedEventCount: 12,
    });
    const handler = new ReconcileUserBadgesHandler(repo);
    const newly = await handler.execute('user-1');
    expect(newly).toEqual(expect.arrayContaining(['first-host', 'regular']));
    expect(repo.granted.has('user-1:first-host')).toBe(true);
  });

  it('is idempotent — a second run reports no new badges', async () => {
    const repo = new FakeBadgeRepository({
      ...emptyPlayerBadgeStats(),
      tournamentChampionships: 1,
    });
    const handler = new ReconcileUserBadgesHandler(repo);
    const first = await handler.execute('user-1');
    expect(first).toEqual(['champion']);
    const second = await handler.execute('user-1');
    expect(second).toEqual([]);
  });
});
