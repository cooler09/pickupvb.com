import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolate the cap rule from the repo + Pro-status reads (same sibling-mock
// approach as analytics.test.ts / event-pricing.test.ts).
const hasProBenefitsMock = vi.fn<(id: string) => Promise<boolean>>();
vi.mock('./admin', () => ({ hasProBenefits: (id: string) => hasProBenefitsMock(id) }));

const listByOwnerMock = vi.fn<(ownerId: unknown) => Promise<unknown[]>>();
vi.mock('./handlers', () => ({
  repositories: { bracketRepo: { listByOwner: (id: unknown) => listByOwnerMock(id) } },
}));

import { validateActiveBracketCap } from './standalone-bracket-cap';

const summary = (status: string) => ({
  id: 'b',
  format: 'single_elimination' as const,
  status,
  teamCount: 0,
  createdAt: new Date(),
});

describe('validateActiveBracketCap — Free runs 1 active standalone bracket, Pro unlimited (R-3)', () => {
  beforeEach(() => {
    hasProBenefitsMock.mockReset();
    listByOwnerMock.mockReset();
  });

  it('never caps a Pro host, and does not even count their brackets', async () => {
    hasProBenefitsMock.mockResolvedValue(true);
    const res = await validateActiveBracketCap('pro-user');
    expect(res.ok).toBe(true);
    expect(listByOwnerMock).not.toHaveBeenCalled();
  });

  it('blocks a Free host who already has an active (non-completed) bracket', async () => {
    hasProBenefitsMock.mockResolvedValue(false);
    listByOwnerMock.mockResolvedValue([summary('active')]);
    const res = await validateActiveBracketCap('free-user');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Pro/);
  });

  it('does not count completed brackets — a Free host keeps history and can start anew', async () => {
    hasProBenefitsMock.mockResolvedValue(false);
    listByOwnerMock.mockResolvedValue([summary('completed'), summary('completed')]);
    expect((await validateActiveBracketCap('free-user')).ok).toBe(true);
  });

  it('allows a Free host with no brackets', async () => {
    hasProBenefitsMock.mockResolvedValue(false);
    listByOwnerMock.mockResolvedValue([]);
    expect((await validateActiveBracketCap('free-user')).ok).toBe(true);
  });
});
