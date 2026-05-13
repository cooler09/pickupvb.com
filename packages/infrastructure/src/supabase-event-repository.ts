import {
    Capacity,
    EventStatus,
    EventType,
    Format,
    Gender,
    Location,
    SkillLevel,
    Surface,
    Visibility,
    VolleyballEvent,
    type EventRepository,
    type EventSearchQuery,
    type VolleyballEventSummary,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type EventRow = {
    id: string;
    host_id: string;
    title: string;
    description: string;
    rules: string;
    surface: Surface;
    format: Format | null;
    gender: Gender | null;
    skill_level: SkillLevel;
    type: EventType;
    visibility: Visibility;
    status: EventStatus;
    address_line: string;
    city: string;
    region: string;
    postal_code: string;
    country: string;
    starts_at: string;
    ends_at: string;
    capacity_kind: 'fixed' | 'unlimited' | null;
    max_spots: number | null;
    latitude: number;
    longitude: number;
    attendee_count: number;
    team_count: number;
};

function rowToCapacity(row: EventRow): Capacity | null {
    if (row.capacity_kind === 'unlimited') return Capacity.unlimited();
    if (row.capacity_kind === 'fixed' && row.max_spots !== null) return Capacity.fixed(row.max_spots);
    return null;
}

export class SupabaseEventRepository implements EventRepository {
    private _client: SupabaseClient | null = null;

    private get client(): SupabaseClient {
        if (!this._client) this._client = createSupabaseAdminClient();
        return this._client;
    }

    async findById(id: string): Promise<VolleyballEvent | null> {
        const { data, error } = await this.client
            .from('events_view')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(`findById(${id}) failed: ${error.message}`);
        if (!data) return null;
        const row = data as unknown as EventRow;

        const [{ data: attendees, error: aErr }, { data: teams, error: tErr }] = await Promise.all([
            this.client.from('event_attendees').select('user_id').eq('event_id', id),
            this.client.from('event_teams').select('team_id').eq('event_id', id),
        ]);
        if (aErr) throw new Error(`findById attendees failed: ${aErr.message}`);
        if (tErr) throw new Error(`findById teams failed: ${tErr.message}`);

        return VolleyballEvent.fromPersistence({
            id: row.id as never,
            hostId: row.host_id as never,
            title: row.title,
            description: row.description,
            rules: row.rules,
            surface: row.surface,
            format: row.format,
            gender: row.gender,
            skillLevel: row.skill_level,
            type: row.type,
            visibility: row.visibility,
            location: Location.create({
                addressLine: row.address_line,
                city: row.city,
                region: row.region,
                postalCode: row.postal_code,
                country: row.country,
                latitude: row.latitude,
                longitude: row.longitude,
            }),
            startsAt: new Date(row.starts_at),
            endsAt: new Date(row.ends_at),
            capacity: rowToCapacity(row),
            status: row.status,
            attendees: ((attendees ?? []) as Array<{ user_id: string }>).map(
                (a) => a.user_id as never,
            ),
            teams: ((teams ?? []) as Array<{ team_id: string }>).map((t) => t.team_id as never),
        });
    }

    async save(event: VolleyballEvent): Promise<void> {
        const loc = event.location;
        const capacity = event.capacity;
        const wkt = `SRID=4326;POINT(${loc.longitude} ${loc.latitude})`;

        const row = {
            id: String(event.id),
            host_id: String(event.hostId),
            title: event.title,
            description: event.description,
            rules: event.rules,
            surface: event.surface,
            format: event.format,
            gender: event.gender,
            skill_level: event.skillLevel,
            type: event.type,
            visibility: event.visibility,
            status: event.status,
            address_line: loc.addressLine,
            city: loc.city,
            region: loc.region,
            postal_code: loc.postalCode,
            country: loc.country,
            geo: wkt,
            starts_at: event.startsAt.toISOString(),
            ends_at: event.endsAt.toISOString(),
            capacity_kind: capacity?.kind ?? null,
            max_spots: capacity?.kind === 'fixed' ? capacity.maxSpots : null,
            updated_at: new Date().toISOString(),
        };

        const { error } = await this.client.from('events').upsert(row as never, { onConflict: 'id' });
        if (error) throw new Error(`save(${event.id}) failed: ${error.message}`);

        // Reconcile attendees: clear then re-insert (sets are small enough).
        const userIds = Array.from(event.attendees).map((u) => String(u));
        const { error: delErr } = await this.client
            .from('event_attendees')
            .delete()
            .eq('event_id', String(event.id));
        if (delErr) throw new Error(`save attendees clear failed: ${delErr.message}`);
        if (userIds.length > 0) {
            const { error: insErr } = await this.client
                .from('event_attendees')
                .insert(
                    userIds.map((user_id) => ({ event_id: String(event.id), user_id })) as never,
                );
            if (insErr) throw new Error(`save attendees insert failed: ${insErr.message}`);
        }

        // Same pattern for teams.
        const teamIds = Array.from(event.teams).map((t) => String(t));
        const { error: delTErr } = await this.client
            .from('event_teams')
            .delete()
            .eq('event_id', String(event.id));
        if (delTErr) throw new Error(`save teams clear failed: ${delTErr.message}`);
        if (teamIds.length > 0) {
            const { error: insTErr } = await this.client
                .from('event_teams')
                .insert(
                    teamIds.map((team_id) => ({ event_id: String(event.id), team_id })) as never,
                );
            if (insTErr) throw new Error(`save teams insert failed: ${insTErr.message}`);
        }

        // Drain raised events so callers don't double-handle them.
        event.pullEvents();
    }

    async search(query: EventSearchQuery): Promise<VolleyballEventSummary[]> {
        type SearchRow = {
            id: string;
            title: string;
            surface: Surface;
            format: Format | null;
            gender: Gender | null;
            skill_level: SkillLevel;
            type: EventType;
            starts_at: string;
            city: string;
            region: string;
            spots_remaining: number | null;
            distance_km: number | null;
        };

        const args = {
            p_lat: query.near?.latitude ?? null,
            p_lng: query.near?.longitude ?? null,
            p_radius_km: query.near?.radiusKm ?? null,
            p_surface: query.surface ?? null,
            p_format: query.format ?? null,
            p_gender: query.gender ?? null,
            p_skill_level: query.skillLevel ?? null,
            p_type: query.type ?? null,
            p_starts_after: query.startsAfter?.toISOString() ?? null,
            p_starts_before: query.startsBefore?.toISOString() ?? null,
            p_limit: query.limit ?? 20,
        };

        const { data, error } = await this.client.rpc('search_events', args as never);
        if (error) throw new Error(`search failed: ${error.message}`);

        const rows = (data ?? []) as unknown as SearchRow[];
        return rows.map((r) => ({
            id: r.id,
            title: r.title,
            surface: r.surface,
            format: r.format,
            gender: r.gender,
            skillLevel: r.skill_level,
            type: r.type,
            startsAt: new Date(r.starts_at),
            city: r.city,
            region: r.region,
            spotsRemaining: r.spots_remaining,
            distanceKm: r.distance_km,
        }));
    }
}
