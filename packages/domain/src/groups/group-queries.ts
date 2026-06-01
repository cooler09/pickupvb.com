/**
 * Read-side queries for the groups subdomain (CQRS read port; architecture
 * audit P2-1, ADR 0021). Writes go through `GroupRepository` + the `Group`
 * aggregate; this is purely the display/read side, so the shapes are plain
 * camelCase read models with no behavior.
 */
import type { GroupRole } from './group.js';
import type { ProfileCard } from '../users/profile-queries.js';

/** A group as shown in lists, cards, and directory results. */
export interface GroupCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  homeCity: string | null;
  region: string | null;
  /**
   * Member count for the directory's social-proof chip. Optional + additive:
   * only the directory listing populates it (via an aggregate over
   * `group_members`); other card sources (home peek, "my groups") leave it
   * undefined and the card hides the chip.
   */
  memberCount?: number;
}

/** A group's full public profile (detail page, edit form, OG image). The card
 * fields plus the creator id. */
export interface GroupDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
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

/** A roster entry joined to the member's public profile card. */
export interface GroupMemberCard {
  userId: string;
  role: GroupRole;
  profile: ProfileCard | null;
}

/** A group the viewer belongs to, with their role (the "my groups" section). */
export interface GroupMembership {
  group: GroupCard;
  role: GroupRole;
}

/** Minimal entry for the sitemap. */
export interface GroupSlugEntry {
  slug: string;
  updatedAt: string | null;
}

export interface GroupQueries {
  /** Paginated public directory, optionally filtered by a search term. */
  searchDirectory(query: GroupDirectoryQuery): Promise<GroupDirectoryPage>;
  /** Up to `limit` group cards ordered by name (e.g. the home-page rail). */
  listCards(limit: number): Promise<GroupCard[]>;
  /** The full public profile for a group by its slug, or `null` if missing /
   * soft-deleted. Backs the detail page, metadata, OG image, and edit form. */
  findDetailBySlug(slug: string): Promise<GroupDetail | null>;
  /** The group's roster (ordered by join date) joined to each member's public
   * profile card. */
  listMembers(groupId: string): Promise<GroupMemberCard[]>;
  /** The viewer's role in the group, or `null` if not a member — for the
   * owner/admin gates on the manage/edit pages. */
  findViewerRole(groupId: string, userId: string): Promise<GroupRole | null>;
  /** Every group the user is a member of, with their role (profile "my groups"). */
  listMembershipsForUser(userId: string): Promise<GroupMembership[]>;
  /** Groups the user can host events under (owner/admin only). */
  listManageableGroups(userId: string): Promise<GroupCard[]>;
  /** All public (non-deleted) group slugs + last-modified, for the sitemap. */
  listSlugs(): Promise<GroupSlugEntry[]>;
}
