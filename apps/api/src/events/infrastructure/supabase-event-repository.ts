import { Injectable } from '@nestjs/common';
import {
    EventRepository,
    EventSearchQuery,
    VolleyballEvent,
    VolleyballEventSummary,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

/**
 * Adapter implementing the domain EventRepository port using Supabase.
 *
 * NOTE: This is a stub showing the wiring — full read/write SQL is left as
 * the next step once the migration is applied (see supabase/migrations).
 */
@Injectable()
export class SupabaseEventRepository implements EventRepository {
    private readonly client = createSupabaseAdminClient();

    async findById(_id: string): Promise<VolleyballEvent | null> {
        // TODO: hydrate VolleyballEvent from `events` + `event_attendees` rows.
        return null;
    }

    async save(_event: VolleyballEvent): Promise<void> {
        // TODO: upsert `events` row + diff attendees/teams.
        // Then publish pulled domain events (e.g. SpotFilled) onto a Realtime channel.
        _event.pullEvents();
    }

    async search(_query: EventSearchQuery): Promise<VolleyballEventSummary[]> {
        // TODO: call `search_events` Postgres function (see migration) for radius + filter.
        return [];
    }
}
