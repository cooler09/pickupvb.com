import { describe, it, expect, vi } from 'vitest';

import {
  runLeagueReminderSweep,
  type DueFixture,
  type LeagueReminderPayload,
  type LeagueReminderPort,
} from './sweep';

/** A dispatch spy whose `.mock.calls` are typed as the 4-arg tuple. */
function spyDispatch(impl: (kind: 'league.match.reminder', userId: string) => void = () => {}) {
  return vi.fn(
    async (
      kind: 'league.match.reminder',
      userId: string,
      _payload: LeagueReminderPayload,
      _opts: { idempotencyKey: string },
    ) => {
      impl(kind, userId);
    },
  );
}

/**
 * The league reminder sweep pings both teams' rostered players ~24h before a
 * fixture. These pin the decisions that would silently regress: each side is
 * reminded with the *other* team as the opponent, a walk-in (no roster) side
 * yields no recipients but is still named as the opponent, a player is pinged
 * once per fixture, and every pulled fixture is marked reminded (dedupe).
 */
function fixture(over: Partial<DueFixture> = {}): DueFixture {
  return {
    matchId: 'm1',
    eventId: 'e1',
    eventTitle: 'Tuesday League',
    scheduledAt: '2026-06-08T01:00:00.000Z',
    courtLabel: 'Court 1',
    home: { teamName: 'Spikers', userIds: ['h1', 'h2'] },
    away: { teamName: 'Diggers', userIds: ['a1'] },
    ...over,
  };
}

function makePort(fixtures: DueFixture[]): {
  port: LeagueReminderPort;
  marked: string[];
} {
  const marked: string[] = [];
  return {
    marked,
    port: {
      findDueFixtures: async () => fixtures,
      markReminded: async (ids) => {
        marked.push(...ids);
      },
    },
  };
}

describe('runLeagueReminderSweep', () => {
  it('reminds each side with the opposing team as the opponent', async () => {
    const { port, marked } = makePort([fixture()]);
    const dispatch = spyDispatch();

    const result = await runLeagueReminderSweep(port, dispatch, new Date('2026-06-07T00:00:00Z'));

    expect(result).toEqual({ fixtures: 1, reminders: 3 });
    const byUser = Object.fromEntries(
      dispatch.mock.calls.map((c) => [c[1], (c[2] as { opponentName: string }).opponentName]),
    );
    expect(byUser).toEqual({ h1: 'Diggers', h2: 'Diggers', a1: 'Spikers' });
    // Idempotency key is per match + recipient.
    expect(dispatch.mock.calls[0]![3]).toEqual({ idempotencyKey: 'm1:h1' });
    expect(marked).toEqual(['m1']);
  });

  it('still reminds the rostered side when the opponent is a walk-in with no roster', async () => {
    const { port } = makePort([fixture({ away: { teamName: 'Host Walk-ins', userIds: [] } })]);
    const dispatch = spyDispatch();

    const result = await runLeagueReminderSweep(port, dispatch, new Date());

    expect(result.reminders).toBe(2); // only the two home players
    expect(
      dispatch.mock.calls.every(
        (c) => (c[2] as { opponentName: string }).opponentName === 'Host Walk-ins',
      ),
    ).toBe(true);
  });

  it('pings a player on both rosters of the same fixture only once', async () => {
    const { port } = makePort([
      fixture({ home: { teamName: 'A', userIds: ['x'] }, away: { teamName: 'B', userIds: ['x'] } }),
    ]);
    const dispatch = spyDispatch();

    const result = await runLeagueReminderSweep(port, dispatch, new Date());

    expect(result.reminders).toBe(1);
  });

  it('marks every fixture reminded even if a recipient dispatch throws', async () => {
    const { port, marked } = makePort([fixture()]);
    const dispatch = spyDispatch((_kind, userId) => {
      if (userId === 'h1') throw new Error('boom');
    });

    const result = await runLeagueReminderSweep(port, dispatch, new Date());

    expect(result.reminders).toBe(2); // h1 failed, h2 + a1 delivered
    expect(marked).toEqual(['m1']); // still marked (best-effort per recipient)
  });
});
