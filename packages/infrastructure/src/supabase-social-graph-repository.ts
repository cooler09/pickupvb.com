import {
  EventType,
  SkillLevel,
  SkillTier,
  Surface,
  skillBandTiers,
  skillTierBand,
  type FollowingFeedFilters,
  type FollowingFeedItem,
  type FriendEdges,
  type FriendProfile,
  type ProfileCard,
  type ProfileQueries,
  type SkillBand,
  type SocialGraphQueries,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { SupabaseProfileRepository } from './supabase-profile-repository.js';

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
  private _profiles: ProfileQueries | null = null;

  constructor(client?: SupabaseClient, profiles?: ProfileQueries) {
    this._client = client ?? null;
    this._profiles = profiles ?? null;
  }

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  /** Profile-card reads are delegated to ProfileQueries (same client). */
  private get profiles(): ProfileQueries {
    if (!this._profiles) this._profiles = new SupabaseProfileRepository(this.client);
    return this._profiles;
  }

  async getFriendEdges(viewerId: string): Promise<FriendEdges> {
    const [outRes, inRes] = await Promise.all([
      this.client.from('friendships').select('friend_id').eq('user_id', viewerId),
      this.client.from('friendships').select('user_id').eq('friend_id', viewerId),
    ]);
    if (outRes.error) throw new Error(`getFriendEdges (outgoing) failed: ${outRes.error.message}`);
    if (inRes.error) throw new Error(`getFriendEdges (incoming) failed: ${inRes.error.message}`);

    const friendIds = ((outRes.data as { friend_id: string }[] | null) ?? []).map(
      (r) => r.friend_id,
    );
    const cards = await this.profiles.findCardsByIds(friendIds);
    // Preserve edge order; drop any id without a public profile.
    const friends = friendIds
      .map((id) => cards.get(id))
      .filter((c): c is ProfileCard => c !== undefined);
    const mutualIds = new Set(
      ((inRes.data as { user_id: string }[] | null) ?? []).map((r) => r.user_id),
    );
    return { friends, mutualIds };
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
      // events_view (not base events) so we get the computed attendee_count
      // for the capacity badge; everything else is e.* so the filters below
      // are unchanged.
      .from('events_view')
      .select(
        'id, title, surface, type, starts_at, time_zone, city, region, host_id, attendee_count, hero_image_url',
      )
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
      attendee_count: number | null;
      hero_image_url: string | null;
    };
    const evRows = (rows ?? []) as unknown as EvRow[];

    // Hydrate per-event skill + capacity from the primary (lowest sort_order)
    // division. Capacity drives the card's "spots left" badge, computed the
    // same way as the search_events RPC: fixed capacity → max_spots minus the
    // view's attendee_count; open-ended capacity → null.
    const eventIds = evRows.map((r) => r.id);
    const skillByEvent = new Map<string, SkillLevel>();
    const capacityByEvent = new Map<
      string,
      { capacityKind: string | null; maxSpots: number | null }
    >();
    // Prices: every division (for the Free / $X / From $X chip); unit: primary.
    const pricesByEvent = new Map<string, (number | null)[]>();
    const priceUnitByEvent = new Map<string, string>();
    if (eventIds.length > 0) {
      const { data: dRows, error: dErr } = await this.client
        .from('event_divisions')
        .select(
          'event_id, skill_tier, sort_order, capacity_kind, max_spots, price_cents, price_unit',
        )
        .in('event_id', eventIds)
        .order('sort_order', { ascending: true });
      if (dErr) throw new Error(`searchFollowingFeed skill hydrate failed: ${dErr.message}`);
      type DRow = {
        event_id: string;
        skill_tier: SkillTier;
        sort_order: number;
        capacity_kind: string | null;
        max_spots: number | null;
        price_cents: number | null;
        price_unit: string;
      };
      for (const d of (dRows ?? []) as DRow[]) {
        const prices = pricesByEvent.get(d.event_id) ?? [];
        prices.push(d.price_cents);
        pricesByEvent.set(d.event_id, prices);
        // skill / capacity / price unit come from the primary (first) division.
        if (!skillByEvent.has(d.event_id)) {
          skillByEvent.set(d.event_id, skillTierBand(d.skill_tier) as unknown as SkillLevel);
          capacityByEvent.set(d.event_id, {
            capacityKind: d.capacity_kind,
            maxSpots: d.max_spots,
          });
          priceUnitByEvent.set(d.event_id, d.price_unit);
        }
      }
    }

    const friendIdSet = new Set(friendIds);
    return evRows.map((r) => {
      const hostFriendId = friendIdSet.has(r.host_id) ? r.host_id : null;
      const attendingFriendIds = (attendingByEvent.get(r.id) ?? []).filter(
        (uid) => uid !== r.host_id,
      );
      const cap = capacityByEvent.get(r.id);
      const spotsRemaining =
        cap && cap.capacityKind === 'fixed' && cap.maxSpots !== null
          ? cap.maxSpots - (r.attendee_count ?? 0)
          : null;
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
        spotsRemaining,
        heroImageUrl: r.hero_image_url,
        priceCents: pricesByEvent.get(r.id) ?? [],
        priceUnit: priceUnitByEvent.get(r.id) ?? null,
      };
    });
  }
}
