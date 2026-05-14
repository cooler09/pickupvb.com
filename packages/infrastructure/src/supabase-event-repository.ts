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
    type AttendeeLite,
    type CoHostParty,
    type EventDetailReadModel,
    type EventRepository,
    type EventSearchQuery,
    type FollowingFeedFilters,
    type FollowingFeedItem,
    type FriendProfile,
    type GroupLite,
    type ProfileLite,
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

    // ----- Read-side: detail page -----------------------------------------

    /**
     * One conceptual call that returns everything the event detail page needs:
     * base event, hosts (primary user, primary group, co-hosts), attendees,
     * and viewer-specific bits (RSVP state, manage permission, friend ids,
     * hostable groups). Internally still N SQL roundtrips but the page
     * doesn't have to know.
     */
    async getDetail(
        id: string,
        viewerId: string | null,
    ): Promise<EventDetailReadModel | null> {
        const { data: ev, error } = await this.client
            .from('events_view')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(`getDetail(${id}) failed: ${error.message}`);
        if (!ev) return null;
        const row = ev as unknown as EventRow & { host_group_id: string | null };

        // Run independent queries in parallel.
        const [
            attendeeRowsRes,
            coHostRowsRes,
            primaryHostUserRes,
            primaryHostGroupRes,
        ] = await Promise.all([
            this.client
                .from('event_attendees')
                .select(
                    'user_id, joined_at, profiles:profiles!inner(display_name, first_name, last_name, avatar_url)',
                )
                .eq('event_id', id)
                .order('joined_at', { ascending: true }),
            this.client
                .from('event_co_hosts')
                .select('host_user_id, host_group_id')
                .eq('event_id', id),
            row.host_id
                ? this.client
                    .from('profiles')
                    .select('id, display_name, first_name, last_name, avatar_url')
                    .eq('id', row.host_id)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
            row.host_group_id
                ? this.client
                    .from('groups')
                    .select('id, slug, name, avatar_url')
                    .eq('id', row.host_group_id)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
        ]);

        type AttendeeRow = {
            user_id: string;
            joined_at: string;
            profiles: {
                display_name: string;
                first_name: string | null;
                last_name: string | null;
                avatar_url: string | null;
            } | null;
        };
        const attRows = (attendeeRowsRes.data as AttendeeRow[] | null) ?? [];
        const attendees: AttendeeLite[] = attRows.map((a) => ({
            userId: a.user_id,
            joinedAt: new Date(a.joined_at),
            profile: {
                id: a.user_id,
                displayName: a.profiles?.display_name ?? 'Player',
                firstName: a.profiles?.first_name ?? null,
                lastName: a.profiles?.last_name ?? null,
                avatarUrl: a.profiles?.avatar_url ?? null,
            },
        }));

        const coHostRows =
            (coHostRowsRes.data as { host_user_id: string | null; host_group_id: string | null }[] | null) ?? [];
        const coUserIds = coHostRows.map((c) => c.host_user_id).filter((v): v is string => !!v);
        const coGroupIds = coHostRows.map((c) => c.host_group_id).filter((v): v is string => !!v);

        // Co-host detail fetch + viewer-specific fetches in parallel.
        const [
            coHostUsersRes,
            coHostGroupsRes,
            viewerFriendsRes,
            viewerRoleRes,
            viewerHostableGroupsRes,
        ] = await Promise.all([
            coUserIds.length
                ? this.client
                    .from('profiles')
                    .select('id, display_name, first_name, last_name, avatar_url')
                    .in('id', coUserIds)
                : Promise.resolve({ data: [], error: null }),
            coGroupIds.length
                ? this.client
                    .from('groups')
                    .select('id, slug, name, avatar_url')
                    .in('id', coGroupIds)
                : Promise.resolve({ data: [], error: null }),
            viewerId
                ? this.client.from('friendships').select('friend_id').eq('user_id', viewerId)
                : Promise.resolve({ data: [], error: null }),
            viewerId && row.host_group_id
                ? this.client
                    .from('group_members')
                    .select('role')
                    .eq('group_id', row.host_group_id)
                    .eq('user_id', viewerId)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
            viewerId
                ? this.client
                    .from('group_members')
                    .select('groups:groups!inner(id, name)')
                    .eq('user_id', viewerId)
                    .in('role', ['owner', 'admin'])
                : Promise.resolve({ data: [], error: null }),
        ]);

        type ProfileRow = {
            id: string;
            display_name: string;
            first_name: string | null;
            last_name: string | null;
            avatar_url: string | null;
        };
        type GroupRow = { id: string; slug: string; name: string; avatar_url: string | null };
        const toProfile = (p: ProfileRow): ProfileLite => ({
            id: p.id,
            displayName: p.display_name,
            firstName: p.first_name,
            lastName: p.last_name,
            avatarUrl: p.avatar_url,
        });
        const toGroup = (g: GroupRow): GroupLite => ({
            id: g.id,
            slug: g.slug,
            name: g.name,
            avatarUrl: g.avatar_url,
        });

        const primaryHostUser = primaryHostUserRes.data
            ? toProfile(primaryHostUserRes.data as ProfileRow)
            : null;
        const primaryHostGroup = primaryHostGroupRes.data
            ? toGroup(primaryHostGroupRes.data as GroupRow)
            : null;
        const coHostUsers = ((coHostUsersRes.data as ProfileRow[] | null) ?? []).map(toProfile);
        const coHostGroups = ((coHostGroupsRes.data as GroupRow[] | null) ?? []).map(toGroup);

        const viewerFriendIds = (
            (viewerFriendsRes.data as { friend_id: string }[] | null) ?? []
        ).map((r) => r.friend_id);

        const isAttending = !!viewerId && attendees.some((a) => a.userId === viewerId);

        let canManage = false;
        if (viewerId) {
            if (viewerId === row.host_id) canManage = true;
            else {
                const role = (viewerRoleRes.data as { role: string } | null)?.role;
                canManage = role === 'owner' || role === 'admin';
            }
        }

        type HostableGroupRow = { groups: { id: string; name: string } | null };
        const viewerHostableGroups = ((viewerHostableGroupsRes.data as HostableGroupRow[] | null) ?? [])
            .map((r) => r.groups)
            .filter((g): g is { id: string; name: string } => g !== null)
            .filter((g) => g.id !== row.host_group_id && !coGroupIds.includes(g.id));

        const capacity = rowToCapacity(row);
        const spotsRemaining = !capacity
            ? null
            : capacity.kind === 'unlimited'
                ? null
                : Math.max(0, (capacity.maxSpots ?? 0) - row.attendee_count);

        return {
            id: row.id,
            title: row.title,
            description: row.description,
            rules: row.rules,
            surface: row.surface,
            format: row.format,
            gender: row.gender,
            skillLevel: row.skill_level,
            type: row.type,
            visibility: row.visibility,
            status: row.status,
            startsAt: new Date(row.starts_at),
            endsAt: new Date(row.ends_at),
            spotsRemaining,
            attendeeCount: row.attendee_count,
            location: {
                addressLine: row.address_line,
                city: row.city,
                region: row.region,
                postalCode: row.postal_code,
                country: row.country,
                latitude: row.latitude,
                longitude: row.longitude,
            },
            hostUserId: row.host_id ?? null,
            hostGroupId: row.host_group_id,
            primaryHostUser,
            primaryHostGroup,
            coHostUsers,
            coHostGroups,
            attendees,
            isAttending,
            canManage,
            viewerFriendIds,
            viewerHostableGroups,
        };
    }

    // ----- Read-side: following feed --------------------------------------

    async getViewerFriends(viewerId: string): Promise<FriendProfile[]> {
        const { data: rows, error } = await this.client
            .from('friendships')
            .select('friend_id, profiles:profiles!friendships_friend_id_fkey(id, display_name, first_name, last_name)')
            .eq('user_id', viewerId);
        if (error) throw new Error(`getViewerFriends failed: ${error.message}`);

        type Row = {
            friend_id: string;
            profiles: {
                id: string;
                display_name: string;
                first_name: string | null;
                last_name: string | null;
            } | null;
        };
        return ((rows as Row[] | null) ?? []).map((r) => {
            const p = r.profiles;
            const full = p ? [p.first_name, p.last_name].filter(Boolean).join(' ').trim() : '';
            return {
                id: r.friend_id,
                displayName: full || p?.display_name || 'Player',
            };
        });
    }

    async searchFollowingFeed(
        _viewerId: string,
        friendIds: ReadonlyArray<string>,
        filters: FollowingFeedFilters,
    ): Promise<FollowingFeedItem[]> {
        if (friendIds.length === 0) return [];

        // Find events where any friend is attending — used to build the OR
        // condition (host_id IN friends OR id IN friend-attended).
        const { data: aRows, error: aErr } = await this.client
            .from('event_attendees')
            .select('event_id, user_id')
            .in('user_id', friendIds as string[]);
        if (aErr) throw new Error(`searchFollowingFeed attendees failed: ${aErr.message}`);

        type AttRow = { event_id: string; user_id: string };
        const attRows = (aRows ?? []) as AttRow[];
        const attendingByEvent = new Map<string, string[]>();
        for (const r of attRows) {
            const arr = attendingByEvent.get(r.event_id) ?? [];
            arr.push(r.user_id);
            attendingByEvent.set(r.event_id, arr);
        }
        const attendeeEventIds = Array.from(attendingByEvent.keys());

        let q = this.client
            .from('events')
            .select('id, title, surface, skill_level, type, starts_at, city, region, host_id')
            .gte('starts_at', filters.startsAfter.toISOString())
            .order('starts_at', { ascending: true })
            .limit(filters.limit ?? 60);
        if (filters.surface) q = q.eq('surface', filters.surface);
        if (filters.type) q = q.eq('type', filters.type);
        if (filters.skillLevel) q = q.eq('skill_level', filters.skillLevel);

        const orParts = [`host_id.in.(${friendIds.join(',')})`];
        if (attendeeEventIds.length > 0) {
            orParts.push(`id.in.(${attendeeEventIds.join(',')})`);
        }
        q = q.or(orParts.join(','));

        const { data: rows, error: eErr } = await q;
        if (eErr) throw new Error(`searchFollowingFeed events failed: ${eErr.message}`);

        type EvRow = {
            id: string;
            title: string;
            surface: Surface;
            skill_level: SkillLevel;
            type: EventType;
            starts_at: string;
            city: string;
            region: string;
            host_id: string;
        };
        const friendIdSet = new Set(friendIds);
        return ((rows ?? []) as EvRow[]).map((r) => {
            const hostFriendId = friendIdSet.has(r.host_id) ? r.host_id : null;
            const attendingFriendIds = (attendingByEvent.get(r.id) ?? []).filter(
                (uid) => uid !== r.host_id,
            );
            return {
                id: r.id,
                title: r.title,
                surface: r.surface,
                skillLevel: r.skill_level,
                type: r.type,
                startsAt: new Date(r.starts_at),
                city: r.city,
                region: r.region,
                hostFriendId,
                attendingFriendIds,
            };
        });
    }

    // ----- Co-host management ---------------------------------------------

    async addCoHost(
        eventId: string,
        party: CoHostParty,
        addedBy: string,
    ): Promise<void> {
        const { error } = await this.client.from('event_co_hosts').insert({
            event_id: eventId,
            host_user_id: party.userId ?? null,
            host_group_id: party.groupId ?? null,
            added_by: addedBy,
        } as never);
        if (error) throw new Error(`addCoHost failed: ${error.message}`);
    }

    async removeCoHost(eventId: string, party: CoHostParty): Promise<void> {
        let q = this.client.from('event_co_hosts').delete().eq('event_id', eventId);
        if (party.userId) q = q.eq('host_user_id', party.userId);
        if (party.groupId) q = q.eq('host_group_id', party.groupId);
        const { error } = await q;
        if (error) throw new Error(`removeCoHost failed: ${error.message}`);
    }
}
