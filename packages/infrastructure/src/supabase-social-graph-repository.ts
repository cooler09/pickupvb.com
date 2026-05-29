import {
  EventType,
  SkillLevel,
  SkillTier,
  Surface,
  skillBandTiers,
  skillTierBand,
  type FollowingFeedFilters,
  type FollowingFeedItem,
  type FriendProfile,
  type SkillBand,
  type SocialGraphQueries,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Supabase adapter for the social graph (friends + following feed).
 *
 * Architecture audit P2-2: extracted out of `SupabaseEventRepository`, which
 * had grown to host these friend-graph reads even though they aren't the event
 * aggregate's concern. The feed query still reads event tables to assemble the
 * result — that's an adapter detail; the application layer depends only on the
 * `SocialGraphQueries` port.
 */
export class SupabaseSocialGraphRepository implements SocialGraphQueries {
  private _client: SupabaseClient | null = null;

  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  async getViewerFriends(viewerId: string): Promise<FriendProfile[]> {
    const { data: rows, error } = await this.client
      .from('friendships')
      .select(
        'friend_id, profiles:profiles!friendships_friend_id_fkey(id, display_name, first_name, last_name)',
      )
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
      .from('event_participants')
      .select('user_id, division:event_divisions!inner(event_id)')
      .eq('role', 'attendee')
      .in('user_id', friendIds as string[]);
    if (aErr) throw new Error(`searchFollowingFeed attendees failed: ${aErr.message}`);

    type AttRow = { user_id: string; division: { event_id: string } | null };
    const attRows = (aRows ?? []) as unknown as AttRow[];
    const attendingByEvent = new Map<string, string[]>();
    for (const r of attRows) {
      if (!r.division) continue;
      const arr = attendingByEvent.get(r.division.event_id) ?? [];
      arr.push(r.user_id);
      attendingByEvent.set(r.division.event_id, arr);
    }
    const attendeeEventIds = Array.from(attendingByEvent.keys());

    let q = this.client
      .from('events')
      .select('id, title, surface, type, starts_at, time_zone, city, region, host_id')
      .eq('visibility', 'public')
      .gte('starts_at', filters.startsAfter.toISOString())
      .order('starts_at', { ascending: true })
      .limit(filters.limit ?? 60);
    if (filters.surface) q = q.eq('surface', filters.surface);
    if (filters.type) q = q.eq('type', filters.type);

    // Skill filter now reads through event_divisions (ADR 0006 Phase 9c).
    // Resolve the requested level to its underlying tier set and restrict
    // to events that have a division matching one of those tiers.
    if (filters.skillLevel) {
      const tiers = skillBandTiers(filters.skillLevel as unknown as SkillBand);
      const { data: divRows, error: dErr } = await this.client
        .from('event_divisions')
        .select('event_id')
        .in(
          'skill_tier',
          tiers as unknown as readonly ('c' | 'b' | 'bb' | 'bb3' | 'a' | 'aa' | 'open')[],
        );
      if (dErr) throw new Error(`searchFollowingFeed divisions failed: ${dErr.message}`);
      const skillEventIds = Array.from(
        new Set(((divRows ?? []) as { event_id: string }[]).map((r) => r.event_id)),
      );
      if (skillEventIds.length === 0) return [];
      q = q.in('id', skillEventIds);
    }

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
      type: EventType;
      starts_at: string;
      time_zone: string | null;
      city: string;
      region: string;
      host_id: string;
    };
    const evRows = (rows ?? []) as EvRow[];

    // Hydrate per-event skill from the primary (lowest sort_order) division.
    const eventIds = evRows.map((r) => r.id);
    const skillByEvent = new Map<string, SkillLevel>();
    if (eventIds.length > 0) {
      const { data: dRows, error: dErr } = await this.client
        .from('event_divisions')
        .select('event_id, skill_tier, sort_order')
        .in('event_id', eventIds)
        .order('sort_order', { ascending: true });
      if (dErr) throw new Error(`searchFollowingFeed skill hydrate failed: ${dErr.message}`);
      type DRow = { event_id: string; skill_tier: SkillTier; sort_order: number };
      for (const d of (dRows ?? []) as DRow[]) {
        if (!skillByEvent.has(d.event_id)) {
          skillByEvent.set(d.event_id, skillTierBand(d.skill_tier) as unknown as SkillLevel);
        }
      }
    }

    const friendIdSet = new Set(friendIds);
    return evRows.map((r) => {
      const hostFriendId = friendIdSet.has(r.host_id) ? r.host_id : null;
      const attendingFriendIds = (attendingByEvent.get(r.id) ?? []).filter(
        (uid) => uid !== r.host_id,
      );
      return {
        id: r.id,
        title: r.title,
        surface: r.surface,
        skillLevel: skillByEvent.get(r.id) ?? SkillLevel.Intermediate,
        type: r.type,
        startsAt: new Date(r.starts_at),
        timeZone: r.time_zone,
        city: r.city,
        region: r.region,
        hostFriendId,
        attendingFriendIds,
      };
    });
  }
}
