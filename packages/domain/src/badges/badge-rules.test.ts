import { describe, expect, it } from 'vitest';
import { SYSTEM_BADGES } from './badge-catalog.js';
import { badgesForStats } from './badge-rules.js';
import { emptyPlayerBadgeStats, type PlayerBadgeStats } from './player-badge-stats.js';

const stats = (overrides: Partial<PlayerBadgeStats>): PlayerBadgeStats => ({
  ...emptyPlayerBadgeStats(),
  ...overrides,
});

describe('badgesForStats', () => {
  it('awards nothing to a brand-new account', () => {
    expect(badgesForStats(emptyPlayerBadgeStats())).toEqual([]);
  });

  it('awards First Whistle the moment a host publishes one event', () => {
    expect(badgesForStats(stats({ publishedEventCount: 1 }))).toContain('first-host');
  });

  it('awards Champion for a bracket win', () => {
    expect(badgesForStats(stats({ tournamentChampionships: 1 }))).toContain('champion');
  });

  it('awards Podium for a top-3 finish', () => {
    expect(badgesForStats(stats({ tournamentPodiums: 1 }))).toContain('podium');
  });

  it('awards Seasoned for finishing a league season', () => {
    expect(badgesForStats(stats({ leaguesCompleted: 1 }))).toContain('seasoned');
  });

  it('awards All-Rounder only at three distinct positions', () => {
    expect(badgesForStats(stats({ distinctPositionsPlayed: 2 }))).not.toContain('all-rounder');
    expect(badgesForStats(stats({ distinctPositionsPlayed: 3 }))).toContain('all-rounder');
  });

  describe('attendance milestones gate on the exact threshold', () => {
    it('Regular needs 10 attended events', () => {
      expect(badgesForStats(stats({ attendedEventCount: 9 }))).not.toContain('regular');
      expect(badgesForStats(stats({ attendedEventCount: 10 }))).toContain('regular');
    });

    it('Veteran needs 50 attended events and implies Regular', () => {
      const earned = badgesForStats(stats({ attendedEventCount: 50 }));
      expect(earned).toEqual(expect.arrayContaining(['regular', 'veteran']));
    });
  });

  it('awards Loyal at 5 events with a single host', () => {
    expect(badgesForStats(stats({ maxEventsWithSingleHost: 4 }))).not.toContain('loyal');
    expect(badgesForStats(stats({ maxEventsWithSingleHost: 5 }))).toContain('loyal');
  });

  it('returns badges in catalog (display) order, not stats order', () => {
    const everything = stats({
      publishedEventCount: 3,
      attendedEventCount: 50,
      distinctPositionsPlayed: 6,
      tournamentChampionships: 2,
      tournamentPodiums: 4,
      leaguesCompleted: 1,
      maxEventsWithSingleHost: 9,
    });
    const earned = badgesForStats(everything);
    // every catalog badge is earned by the maxed-out snapshot...
    expect(earned).toHaveLength(SYSTEM_BADGES.length);
    // ...and the order matches the catalog declaration order exactly.
    expect(earned).toEqual(SYSTEM_BADGES.map((b) => b.key));
  });
});
