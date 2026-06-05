/**
 * Read-side port for public user profiles (architecture audit P2-1).
 *
 * The web layer reads `profiles` / `profiles_public` in ~40 places with the
 * same column subsets inlined over and over and no test seam. This port gives
 * those reads a home. Writes (profile edits) stay with the `UserProfile`
 * aggregate / `UserRepository`; this is purely the display/read side.
 *
 * Adapters read the PII-safe `profiles_public` view. The Supabase adapter
 * takes the caller's client so the read runs under the same auth/RLS context
 * the call site already had (anon directory pages, the viewer's session, …) —
 * the port doesn't impose a client.
 */
export interface ProfileQueries {
  /** Free-text search over public profiles, shaped for pickers. */
  searchCards(query: ProfileSearchQuery): Promise<ProfileCard[]>;

  /**
   * Paginated, counted, name-ordered directory listing (the `/players` index).
   * Returns the page of cards plus the total match count for pagination.
   */
  searchDirectory(query: ProfileDirectoryQuery): Promise<ProfileDirectoryPage>;

  /**
   * Batch-fetch public profile cards by id, keyed by id for O(1) lookup —
   * for member/attendee/roster lists that resolve a set of user ids to cards.
   * Missing ids are simply absent from the map.
   */
  findCardsByIds(ids: ReadonlyArray<string>): Promise<Map<string, ProfileCard>>;

  /** A single public profile card by id (null when missing). */
  findCardById(id: string): Promise<ProfileCard | null>;

  /** A single public profile card by vanity handle (e.g. for page metadata). */
  findCardByHandle(handle: string): Promise<ProfileCard | null>;

  /** The full public player-profile projection by handle (the profile page). */
  findPlayerByHandle(handle: string): Promise<PlayerProfile | null>;

  /** Just the public social links by id (null when missing) — for surfaces that
   * render a host/player's socials without the rest of the profile. */
  findSocialLinksById(id: string): Promise<ProfileSocialLinks | null>;
}

/** A profile's public social links (no other profile fields). */
export interface ProfileSocialLinks {
  instagramHandle: string | null;
  tiktokHandle: string | null;
  twitterHandle: string | null;
  facebookHandle: string | null;
  youtubeHandle: string | null;
  websiteUrl: string | null;
}

/** The common public "profile card" projection shared by directory/picker UIs. */
export interface ProfileCard {
  id: string;
  /** Vanity URL token (unique, slug-shape). */
  handle: string;
  displayName: string;
  homeCity: string | null;
  avatarUrl: string | null;
  /**
   * Ordered playing positions (primary → tertiary), nulls dropped. The
   * directory card's decision signal for "who plays what"; empty when the
   * player hasn't set any. Sourced from `profiles_public`.
   */
  positions: string[];
  /**
   * Distance in km from the directory's "near me" center, when a proximity
   * search is active (PL-5). Absent/undefined for non-geo listings; the
   * directory sorts by it and the card shows it when present.
   */
  distanceKm?: number | null;
}

export interface ProfileSearchQuery {
  /**
   * Case-insensitive substring match on display name. Raw user text — the
   * adapter escapes LIKE metacharacters, so callers pass it verbatim.
   */
  nameLike?: string;
  /** Max rows to return. */
  limit: number;
}

export interface ProfileDirectoryQuery {
  /** Case-insensitive substring match on display name (raw text; adapter escapes). */
  nameLike?: string;
  /** Case-insensitive substring match on home city (raw text; adapter escapes). */
  cityLike?: string;
  /**
   * Proximity filter (PL-5): restrict to profiles whose geocoded home location
   * falls within `radiusKm` of the center (a bounding-box approximation), with
   * `ProfileCard.distanceKm` populated for display. Profiles with no coords are
   * excluded. Ordering stays alphabetical (true nearest-first would need PostGIS
   * like the events stack — deferred).
   */
  near?: { latitude: number; longitude: number; radiusKm: number };
  /** Page size. */
  limit: number;
  /** Zero-based row offset for the page. */
  offset: number;
}

export interface ProfileDirectoryPage {
  cards: ProfileCard[];
  /** Total profiles matching the filters (across all pages). */
  total: number;
}

/**
 * The full public player-profile projection for the `/players/[handle]` page:
 * the card fields plus the display-only extras (positions, social handles,
 * pro-badge preference). All PII-safe — sourced from `profiles_public`.
 */
export interface PlayerProfile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  homeCity: string | null;
  showProBadge: boolean | null;
  primaryPosition: string | null;
  secondaryPosition: string | null;
  tertiaryPosition: string | null;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  twitterHandle: string | null;
  facebookHandle: string | null;
  youtubeHandle: string | null;
  websiteUrl: string | null;
}
