import { describe, it, expect } from 'vitest';
import type {
  EventDetailReadModel,
  EventReadModels,
  EventSearchQuery,
  VolleyballEventSummary,
} from '@pickupvb/domain';
import { GetAttendingEventsHandler } from './event-queries.handler.js';
import { GetAttendingEventsQuery } from '../messages.js';

type Call = { userId: string; opts?: { startsAfter?: Date; limit?: number } };

/** Fake read-model port that records every `listAttending` call. */
function fakeRepo(result: VolleyballEventSummary[], calls: Call[]): EventReadModels {
  return {
    search: async (_q: EventSearchQuery) => [] as VolleyballEventSummary[],
    getDetail: async () => null as unknown as EventDetailReadModel,
    getBracketMeta: async () => null,
    findIdByShortCode: async () => null,
    listAttending: async (userId, opts) => {
      calls.push({ userId, ...(opts ? { opts } : {}) });
      return result;
    },
  };
}

describe('GetAttendingEventsHandler', () => {
  const startsAfter = new Date('2026-06-01T00:00:00.000Z');

  it('delegates to listAttending with the viewer id + startsAfter and returns the projection', async () => {
    const calls: Call[] = [];
    const result = [{ id: 'e1' }] as unknown as VolleyballEventSummary[];
    const handler = new GetAttendingEventsHandler(fakeRepo(result, calls));

    const out = await handler.execute(new GetAttendingEventsQuery('user-1', startsAfter));

    expect(out).toBe(result);
    expect(calls).toEqual([{ userId: 'user-1', opts: { startsAfter } }]);
  });

  it('forwards an explicit limit, and omits the key entirely when unset (exactOptionalPropertyTypes)', async () => {
    const calls: Call[] = [];
    const handler = new GetAttendingEventsHandler(fakeRepo([], calls));

    await handler.execute(new GetAttendingEventsQuery('user-2', startsAfter, 5));
    await handler.execute(new GetAttendingEventsQuery('user-2', startsAfter));

    expect(calls[0]?.opts).toEqual({ startsAfter, limit: 5 });
    expect(calls[1]?.opts).toEqual({ startsAfter });
    // The spread must not pass `limit: undefined` through — the omission is the contract.
    expect('limit' in (calls[1]?.opts ?? {})).toBe(false);
  });
});
