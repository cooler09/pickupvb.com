import type {
  PlayerProfile,
  ProfileCard,
  ProfileDirectoryPage,
  ProfileDirectoryQuery,
  ProfileQueries,
  ProfileSearchQuery,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/** Escape LIKE/ILIKE metacharacters so user text is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

const CARD_COLUMNS = 'id, handle, display_name, home_city, avatar_url';

type CardRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  home_city: string | null;
  avatar_url: string | null;
};

function toCard(row: CardRow): ProfileCard {
  return {
    id: row.id,
    handle: row.handle ?? '',
    displayName: row.display_name ?? 'Player',
    homeCity: row.home_city,
    avatarUrl: row.avatar_url,
  };
}

const PLAYER_COLUMNS =
  'id, handle, display_name, avatar_url, hero_image_url, home_city, show_pro_badge, ' +
  'primary_position, secondary_position, tertiary_position, ' +
  'instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url';

type PlayerRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  hero_image_url: string | null;
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

function toPlayer(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    handle: row.handle ?? '',
    displayName: row.display_name ?? 'Player',
    avatarUrl: row.avatar_url,
    heroImageUrl: row.hero_image_url,
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
    let query = this.client.from('profiles_public').select(CARD_COLUMNS).limit(limit);
    if (nameLike) {
      query = query.ilike('display_name', `%${escapeLike(nameLike)}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`searchCards failed: ${error.message}`);
    return ((data as CardRow[] | null) ?? []).map(toCard);
  }

  async searchDirectory({
    nameLike,
    cityLike,
    limit,
    offset,
  }: ProfileDirectoryQuery): Promise<ProfileDirectoryPage> {
    let query = this.client
      .from('profiles_public')
      .select(CARD_COLUMNS, { count: 'exact' })
      .order('display_name', { ascending: true })
      .range(offset, offset + limit - 1);
    if (nameLike) {
      query = query.ilike('display_name', `%${escapeLike(nameLike)}%`);
    }
    if (cityLike) {
      query = query.ilike('home_city', `%${escapeLike(cityLike)}%`);
    }
    const { data, count, error } = await query;
    if (error) throw new Error(`searchDirectory failed: ${error.message}`);
    const cards = ((data as CardRow[] | null) ?? []).map(toCard);
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
}
