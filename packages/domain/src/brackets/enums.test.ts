import { describe, expect, it } from 'vitest';
import { minTeamsForFormat, validateTeamCountForFormat } from './enums.js';

describe('minTeamsForFormat', () => {
  it('floors double elimination at 4 (the generator needs ≥4 + power-of-two)', () => {
    // Regression for TT-9: the floor said 3 while generateDoubleElimination
    // requires at least 4 — letting a host commit a field that only failed at
    // generate time.
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

  it('requires a power-of-two field for double elimination', () => {
    // Below the floor → min message, not the power-of-two message.
    const below = validateTeamCountForFormat('double_elimination', 3);
    expect(below.ok).toBe(false);
    if (!below.ok) expect(below.reason).toMatch(/at least 4/);

    // Power-of-two counts pass.
    for (const n of [4, 8, 16, 32]) {
      expect(validateTeamCountForFormat('double_elimination', n).ok).toBe(true);
    }

    // The common "stuck" counts are rejected with an actionable hint.
    for (const n of [5, 6, 7, 9, 15]) {
      const res = validateTeamCountForFormat('double_elimination', n);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/power-of-two/);
    }

    // 6 → suggest dropping to 4 or adding 2 to reach 8.
    const six = validateTeamCountForFormat('double_elimination', 6);
    expect(six.ok).toBe(false);
    if (!six.ok) {
      expect(six.reason).toContain('drop to 4');
      expect(six.reason).toContain('reach 8');
    }
  });
});
