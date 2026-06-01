import type { EventType, SkillLevel, Surface } from '../events/enums.js';
import type { ProfileCard } from './profile-queries.js';

/**
 * Read-side port for the social graph (friends + the friend-activity feed).
 *
 * ADR 0019 follow-up / architecture audit P2-2: these reads used to hang off
 * `EventRepository`, but the friend graph and following feed are not the event
 * aggregate's concern — they belong to the `UserProfile` side of the domain.
 * Splitting them into their own port shrinks the `EventRepository` god-port
 * (ISP) and gives the social graph a home of its own. The Supabase adapter may
 * still query event tables to assemble the feed; the *port* is what callers
 * depend on.
 */
export interface SocialGraphQueries {
  /** The viewer's accepted friends, shaped for display. */
  getViewerFriends(viewerId: string): Promise<FriendProfile[]>;

  /**
   * The viewer's outgoing friend edges as full profile cards, plus the set of
   * incoming-edge user ids (people who follow the viewer) for mutual-friend
   * flagging in the UI. One round-trip via the adapter; cards are resolved
   * through `ProfileQueries`.
   */
  getFriendEdges(viewerId: string): Promise<FriendEdges>;

  /**
   * Public upcoming events hosted by — or attended by — the viewer's friends.
   * `friendIds` is supplied by the caller (it already has the friend list on
   * hand), so this method doesn't re-derive the graph.
   */
  searchFollowingFeed(
    viewerId: string,
    friendIds: ReadonlyArray<string>,
    filters: FollowingFeedFilters,
  ): Promise<FollowingFeedItem[]>;
}

export interface FriendProfile {
  id: string;
  displayName: string;
}

export interface FriendEdges {
  /** Profiles the viewer follows (outgoing edges). */
  friends: ProfileCard[];
  /** User ids who follow the viewer (incoming edges) — for mutual flagging. */
  mutualIds: Set<string>;
}

export interface FollowingFeedFilters {
  surface?: Surface;
  type?: EventType;
  skillLevel?: SkillLevel;
  startsAfter: Date;
  limit?: number;
}

export interface FollowingFeedItem {
  id: string;
  title: string;
  surface: Surface;
  skillLevel: SkillLevel;
  type: EventType;
  startsAt: Date;
  timeZone: string | null;
  city: string;
  region: string;
  /** Friend who is hosting this event (if any). */
  hostFriendId: string | null;
  /** Friend ids attending (excluding the host). */
  attendingFriendIds: ReadonlyArray<string>;
  /**
   * Spots left on the primary division when it has a fixed capacity
   * (`max_spots − attendee_count`); null for open-ended capacity. Mirrors
   * `spots_remaining` from the `search_events` RPC so the event card renders
   * the same capacity badge here as on the Upcoming/Past tabs.
   */
  spotsRemaining: number | null;
  /** Public hero image URL for the discovery-card thumbnail; null when unset. */
  heroImageUrl: string | null;
  /**
   * Per-division price cents (one entry per division, in `sort_order`), so the
   * card can render the same Free / `$X` / `From $X` chip as the search tabs.
   */
  priceCents: ReadonlyArray<number | null>;
  /** Primary division's price unit (`per_player` / `per_team`) for the chip. */
  priceUnit: string | null;
}
