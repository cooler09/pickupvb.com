import { describe, expect, it } from 'vitest';
import { minTeamsForFormat, validateTeamCountForFormat } from './enums.js';

describe('minTeamsForFormat', () => {
  it('floors double elimination at 4', () => {
    expect(minTeamsForFormat('double_elimination')).toBe(4);
  });

  it('keeps the other format floors', () => {
    expect(minTeamsForFormat('single_elimination')).toBe(2);
    expect(minTeamsForFormat('round_robin')).toBe(3);
    expect(minTeamsForFormat('pool_play_playoff')).toBe(4);
  });
});

describe('validateTeamCountForFormat', () => {
  it('enforces the simple minimum for non-double-elim formats', () => {
    expect(validateTeamCountForFormat('single_elimination', 1).ok).toBe(false);
    expect(validateTeamCountForFormat('single_elimination', 2).ok).toBe(true);
    expect(validateTeamCountForFormat('round_robin', 2).ok).toBe(false);
    expect(validateTeamCountForFormat('round_robin', 3).ok).toBe(true);
    expect(validateTeamCountForFormat('pool_play_playoff', 3).ok).toBe(false);
    expect(validateTeamCountForFormat('pool_play_playoff', 4).ok).toBe(true);
  });

  it('accounts for pool config (poolCount × advancePerPool) when opts are passed (TT-16)', () => {
    // 2 pools advancing 3 each → needs 6, not just the floor of 4.
    const five = validateTeamCountForFormat('pool_play_playoff', 5, {
      poolCount: 2,
      advancePerPool: 3,
    });
    expect(five.ok).toBe(false);
    if (!five.ok) expect(five.reason).toMatch(/at least 6/);
    expect(
      validateTeamCountForFormat('pool_play_playoff', 6, { poolCount: 2, advancePerPool: 3 }).ok,
    ).toBe(true);
    // Without opts only the format floor (4) applies.
    expect(validateTeamCountForFormat('pool_play_playoff', 4).ok).toBe(true);
  });

  it('accepts any double-elimination field of 4+ (non-power-of-two gets byes)', () => {
    // Below the floor is still rejected.
    const below = validateTeamCountForFormat('double_elimination', 3);
    expect(below.ok).toBe(false);
    if (!below.ok) expect(below.reason).toMatch(/at least 4/);

    // Power-of-two AND non-power-of-two counts all pass now (the generator
    // handles odd sizes with winners-round-1 byes).
    for (const n of [4, 5, 6, 7, 8, 9, 15, 16]) {
      expect(validateTeamCountForFormat('double_elimination', n).ok).toBe(true);
    }
  });
});
