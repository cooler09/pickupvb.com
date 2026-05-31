import { describe, it, expect } from 'vitest';
import {
  EventStatus,
  EventType,
  NotFoundError,
  type EventBracketMetaReadModel,
  type EventDetailReadModel,
  type EventReadModels,
  type EventSearchQuery,
  type VolleyballEventSummary,
} from '@pickupvb/domain';
import { GetEventBracketMetaHandler } from './event-detail.handler.js';
import { GetEventBracketMetaQuery } from '../messages.js';

const META: EventBracketMetaReadModel = {
  id: 'event-1',
  title: 'Spring Slam',
  type: EventType.Tournament,
  status: EventStatus.Published,
  timeZone: 'America/Los_Angeles',
  hostUserId: 'host-1',
  hostGroupId: null,
  divisions: [],
};

/** Fake read-model port that only implements `getBracketMeta`. */
function fakeRepo(meta: EventBracketMetaReadModel | null): EventReadModels {
  return {
    getBracketMeta: async () => meta,
    getDetail: async () => null as unknown as EventDetailReadModel,
    search: async (_q: EventSearchQuery) => [] as VolleyballEventSummary[],
    findIdByShortCode: async () => null,
  };
}

describe('GetEventBracketMetaHandler', () => {
  it('returns the lightweight metadata projection for an existing event', async () => {
    const handler = new GetEventBracketMetaHandler(fakeRepo(META));
    const result = await handler.execute(new GetEventBracketMetaQuery('event-1'));
    expect(result).toEqual(META);
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const handler = new GetEventBracketMetaHandler(fakeRepo(null));
    await expect(handler.execute(new GetEventBracketMetaQuery('missing'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
