import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { EventRepository, VolleyballEventSummary } from '@pickupvb/domain';
import { SearchEventsQuery } from '../messages';
import { EVENT_REPOSITORY } from '../tokens';

@QueryHandler(SearchEventsQuery)
export class SearchEventsHandler
    implements IQueryHandler<SearchEventsQuery, VolleyballEventSummary[]> {
    constructor(@Inject(EVENT_REPOSITORY) private readonly repo: EventRepository) { }

    execute({ viewerId, filters }: SearchEventsQuery): Promise<VolleyballEventSummary[]> {
        return this.repo.search({ ...filters, viewerId: viewerId ?? undefined });
    }
}
