/**
 * Read-side queries for the groups subdomain (CQRS read port; architecture
 * audit P2-1, ADR 0021). Writes go through `GroupRepository` + the `Group`
 * aggregate; this is purely the display/read side, so the shapes are plain
 * camelCase read models with no behavior.
 */

/** A group as shown in lists, cards, and directory results. */
export interface GroupCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  homeCity: string | null;
  region: string | null;
}

/** A group's full public profile (detail page, edit form, OG image). The card
 * fields plus the hero image and the creator id. */
export interface GroupDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  heroImageUrl: string | null;
  homeCity: string | null;
  region: string | null;
  createdBy: string | null;
}

export interface GroupDirectoryQuery {
  /** Free-text term matched (case-insensitive) against name / slug / home city. */
  search?: string;
  limit: number;
  offset: number;
}

export interface GroupDirectoryPage {
  cards: GroupCard[];
  total: number;
}

export interface GroupQueries {
  /** Paginated public directory, optionally filtered by a search term. */
  searchDirectory(query: GroupDirectoryQuery): Promise<GroupDirectoryPage>;
  /** Up to `limit` group cards ordered by name (e.g. the home-page rail). */
  listCards(limit: number): Promise<GroupCard[]>;
  /** The full public profile for a group by its slug, or `null` if missing /
   * soft-deleted. Backs the detail page, metadata, OG image, and edit form. */
  findDetailBySlug(slug: string): Promise<GroupDetail | null>;
}
