import type {
    EventRepository,
    EventSearchQuery,
    VolleyballEvent,
    VolleyballEventSummary,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

/**
 * Adapter implementing the domain EventRepository port using Supabase.
 *
 * NOTE: Stub showing the wiring — full read/write SQL is the next step
 * once the migration is applied (see supabase/migrations).
 */
export class SupabaseEventRepository implements EventRepository {
    private _client: ReturnType<typeof createSupabaseAdminClient> | null = null;

    private get client(): ReturnType<typeof createSupabaseAdminClient> {
        if (!this._client) this._client = createSupabaseAdminClient();
        return this._client;
    }

    async findById(_id: string): Promise<VolleyballEvent | null> {
        // TODO: hydrate VolleyballEvent from `events` + `event_attendees` rows.
        void this.client;
        return null;
    }

    async save(event: VolleyballEvent): Promise<void> {
        // TODO: upsert `events` row + diff attendees/teams.
        // Then publish pulled domain events (e.g. SpotFilled) onto a Realtime channel.
        void this.client;
        event.pullEvents();
    }

    async search(_query: EventSearchQuery): Promise<VolleyballEventSummary[]> {
        // TODO: call `search_events` Postgres function (see migration) for radius + filter.
        void this.client;
        return [];
    }
}
