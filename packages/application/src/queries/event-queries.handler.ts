import type {
  EventReadModels,
  EventSearchQuery,
  EventWriteStore,
  VolleyballEventSummary,
} from '@pickupvb/domain';
import { NotFoundError, skillTierBand } from '@pickupvb/domain';
import { GetAttendingEventsQuery, GetEventByIdQuery, SearchEventsQuery } from '../messages/index';

export class SearchEventsHandler {
  constructor(private readonly repo: EventReadModels) {}

  execute({ viewerId, filters }: SearchEventsQuery): Promise<VolleyballEventSummary[]> {
    const query: EventSearchQuery = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined) (query as Record<string, unknown>)[k] = v;
    }
    if (viewerId) query.viewerId = viewerId;
    return this.repo.search(query);
  }
}

export class GetAttendingEventsHandler {
  constructor(private readonly repo: EventReadModels) {}

  execute({
    viewerId,
    startsAfter,
    limit,
  }: GetAttendingEventsQuery): Promise<VolleyballEventSummary[]> {
    return this.repo.listAttending(viewerId, {
      startsAfter,
      ...(limit !== undefined ? { limit } : {}),
    });
  }
}

export class GetEventByIdHandler {
  constructor(private readonly repo: EventWriteStore) {}

  async execute({ id }: GetEventByIdQuery) {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundError('event', id);
    const loc = event.location;
    const primary = event.divisions[0] ?? null;
    return {
      id: String(event.id),
      title: event.title,
      description: event.description,
      rules: event.rules,
      surface: event.surface,
      format: primary?.format ?? null,
      gender: primary?.gender ?? null,
      skillLevel: primary ? skillTierBand(primary.skillTier) : null,
      type: event.type,
      visibility: event.visibility,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      spotsRemaining: event.spotsRemaining,
      attendeeCount: event.attendees.size,
      teamCount: event.teams.size,
      location: {
        addressLine: loc.addressLine,
        city: loc.city,
        region: loc.region,
        postalCode: loc.postalCode,
        country: loc.country,
        latitude: loc.latitude,
        longitude: loc.longitude,
      },
    };
  }
}
