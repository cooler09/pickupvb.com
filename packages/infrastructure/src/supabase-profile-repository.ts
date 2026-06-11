import type {
  PlayerProfile,
  ProfileCard,
  ProfileDirectoryPage,
  ProfileDirectoryQuery,
  ProfileQueries,
  ProfileSearchQuery,
  ProfileSocialLinks,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/** Escape LIKE/ILIKE metacharacters so user text is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

/** Great-circle distance in km between two lat/lng points (PL-5 distance chip). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // mean Earth radius, km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const CARD_COLUMNS =
  'id, handle, display_name, home_city, avatar_url, primary_position, secondary_position, tertiary_position, discoverable';

type CardRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  home_city: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  discoverable: boolean | null;
};

function toCard(row: CardRow): ProfileCard {
  return {
    id: row.id,
    handle: row.handle ?? '',
    displayName: row.display_name ?? 'Player',
    homeCity: row.home_city,
    avatarUrl: row.avatar_url,
    positions: [row.primary_position, row.secondary_position, row.tertiary_position].filter(
      (p): p is string => Boolean(p),
    ),
    // Null (column unset) defaults to discoverable — only an explicit `false`
    // de-indexes the public page / drops the handle from the sitemap.
    discoverable: row.discoverable ?? true,
  };
}

const PLAYER_COLUMNS =
  'id, handle, display_name, avatar_url, hero_image_url, created_at, discoverable, home_city, show_pro_badge, ' +
  'primary_position, secondary_position, tertiary_position, ' +
  'instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url';

type PlayerRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  hero_image_url: string | null;
  created_at: string | null;
  discoverable: boolean | null;
  home_city: string | null;
  show_pro_badge: boolean | null;
  primary_position: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
};

const SOCIAL_COLUMNS =
  'instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url';

type SocialRow = {
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
};

function toPlayer(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    handle: row.handle ?? '',
    displayName: row.display_name ?? 'Player',
    avatarUrl: row.avatar_url,
    heroImageUrl: row.hero_image_url,
    createdAt: row.created_at,
    discoverable: row.discoverable,
    homeCity: row.home_city,
    showProBadge: row.show_pro_badge,
    primaryPosition: row.primary_position,
    secondaryPosition: row.secondary_position,
    tertiaryPosition: row.tertiary_position,
    instagramHandle: row.instagram_handle,
    tiktokHandle: row.tiktok_handle,
    twitterHandle: row.twitter_handle,
    facebookHandle: row.facebook_handle,
    youtubeHandle: row.youtube_handle,
    websiteUrl: row.website_url,
  };
}

/**
 * Supabase adapter for public profile reads (architecture audit P2-1).
 *
 * Reads the PII-safe `profiles_public` view. Unlike the module-singleton
 * repositories, this one **requires** a client — public-profile reads run
 * under whatever auth context the call site already has (anon directory page,
 * the viewer's session, …), so the caller passes its own client rather than
 * silently defaulting to the service-role admin client.
 */
export class SupabaseProfileRepository implements ProfileQueries {
  constructor(private readonly client: SupabaseClient) {}

  async searchCards({ nameLike, limit }: ProfileSearchQuery): Promise<ProfileCard[]> {
    // Discovery read: only surface players who opted into discovery. Private
    // players (`discoverable = false`) are excluded from the picker/typeahead so
    // they can't be searched for or added to a team/group. Card-by-id lookups
    // below stay unfiltered, so they still resolve on rosters/chips they're part of.
    let query = this.client
      .from('profiles_public')
      .select(CARD_COLUMNS)
      .eq('discoverable', true)
      .limit(limit);
    if (nameLike) {
      query = query.ilike('display_name', `%${escapeLike(nameLike)}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`searchCards failed: ${error.message}`);
    return ((data as CardRow[] | null) ?? []).map(toCard);
  }

  async searchDirectory({
    nameLike,
    position,
    near,
    limit,
    offset,
  }: ProfileDirectoryQuery): Promise<ProfileDirectoryPage> {
    // Only fetch coords when a proximity filter is active (PL-5).
    const columns = near ? `${CARD_COLUMNS}, latitude, longitude` : CARD_COLUMNS;
    let query = this.client
      .from('profiles_public')
      .select(columns, { count: 'exact' })
      // Discovery read: private players (`discoverable = false`) are kept out of
      // the /players directory listing + count.
      .eq('discoverable', true)
      .order('display_name', { ascending: true })
      .range(offset, offset + limit - 1);
    if (nameLike) {
      query = query.ilike('display_name', `%${escapeLike(nameLike)}%`);
    }
    if (position) {
      // PL-7 position filter: match any of the three position slots. `position`
      // is a validated enum token (the page checks it against POSITION_LABEL),
      // so it's safe to interpolate into the PostgREST `or` filter.
      query = query.or(
        `primary_position.eq.${position},secondary_position.eq.${position},tertiary_position.eq.${position}`,
      );
    }
    if (near) {
      // Bounding box from the radius: ~111.32 km per degree of latitude;
      // longitude degrees shrink by cos(latitude). Profiles with NULL coords
      // fail the `gte`/`lte` comparisons and are excluded — intended.
      const dLat = near.radiusKm / 111.32;
      const dLng =
        near.radiusKm / (111.32 * Math.max(Math.cos((near.latitude * Math.PI) / 180), 0.01));
      query = query
        .gte('latitude', near.latitude - dLat)
        .lte('latitude', near.latitude + dLat)
        .gte('longitude', near.longitude - dLng)
        .lte('longitude', near.longitude + dLng);
    }
    const { data, count, error } = await query;
    if (error) throw new Error(`searchDirectory failed: ${error.message}`);
    type DirectoryRow = CardRow & { latitude: number | null; longitude: number | null };
    // `data` is loosely typed because the select column list is built
    // dynamically (CARD_COLUMNS ± coords), so supabase-js can't infer the row.
    const rows = (data as unknown as DirectoryRow[] | null) ?? [];
    const cards = rows.map((r) => {
      const card = toCard(r);
      if (near && r.latitude != null && r.longitude != null) {
        card.distanceKm = haversineKm(near.latitude, near.longitude, r.latitude, r.longitude);
      }
      return card;
    });
    return { cards, total: count ?? cards.length };
  }

  async findCardsByIds(ids: ReadonlyArray<string>): Promise<Map<string, ProfileCard>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.client
      .from('profiles_public')
      .select(CARD_COLUMNS)
      .in('id', ids as string[]);
    if (error) throw new Error(`findCardsByIds failed: ${error.message}`);
    const out = new Map<string, ProfileCard>();
    for (const row of (data as CardRow[] | null) ?? []) {
      out.set(row.id, toCard(row));
    }
    return out;
  }

  async findCardById(id: string): Promise<ProfileCard | null> {
    const { data, error } = await this.client
      .from('profiles_public')
      .select(CARD_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`findCardById failed: ${error.message}`);
    return data ? toCard(data as CardRow) : null;
  }

  async findCardByHandle(handle: string): Promise<ProfileCard | null> {
    const { data, error } = await this.client
      .from('profiles_public')
      .select(CARD_COLUMNS)
      .eq('handle', handle)
      .maybeSingle();
    if (error) throw new Error(`findCardByHandle failed: ${error.message}`);
    return data ? toCard(data as CardRow) : null;
  }

  async findPlayerByHandle(handle: string): Promise<PlayerProfile | null> {
    const { data, error } = await this.client
      .from('profiles_public')
      .select(PLAYER_COLUMNS)
      .eq('handle', handle)
      .maybeSingle();
    if (error) throw new Error(`findPlayerByHandle failed: ${error.message}`);
    return data ? toPlayer(data as unknown as PlayerRow) : null;
  }

  async findSocialLinksById(id: string): Promise<ProfileSocialLinks | null> {
    const { data, error } = await this.client
      .from('profiles_public')
      .select(SOCIAL_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`findSocialLinksById failed: ${error.message}`);
    if (!data) return null;
    const r = data as unknown as SocialRow;
    return {
      instagramHandle: r.instagram_handle,
      tiktokHandle: r.tiktok_handle,
      twitterHandle: r.twitter_handle,
      facebookHandle: r.facebook_handle,
      youtubeHandle: r.youtube_handle,
      websiteUrl: r.website_url,
    };
  }
}
