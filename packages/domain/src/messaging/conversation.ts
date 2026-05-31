import { idConstructor, type Brand } from '../shared/brand.js';
import type { UserId } from '../events/volleyball-event.js';

export type { UserId };

export type ConversationId = Brand<string, 'ConversationId'>;
export const ConversationId = idConstructor<'ConversationId'>();

/**
 * What a conversation is anchored to. The three room kinds derive their
 * participant set from the matching source-membership table (team_members /
 * event_participants / group_members); a `dm` is a 1:1 thread between two users
 * whose two `conversation_participants` rows ARE the access grant.
 */
export type ConversationKind = 'team' | 'event' | 'group' | 'dm';

/** Context-room kinds — everything except DMs (what `get_or_create_conversation` accepts). */
export type RoomKind = Exclude<ConversationKind, 'dm'>;

/**
 * Write port for conversations. These are focused, RPC-backed edge operations
 * (no aggregate load) — the same shape as `GroupRepository.addFollowEdge`. A
 * conversation carries no app-layer invariant of its own: room membership is
 * enforced server-side by the `get_or_create_conversation` SECURITY DEFINER RPC,
 * and the read cursor is self-scoped state. The invariants that justify the
 * `messaging` aggregate live on {@link Message}.
 */
export interface ConversationRepository {
  /**
   * Get-or-create the single room conversation for a context, returning its id.
   * Idempotent (resolves the open-simultaneously race to the existing row).
   * A non-member surfaces as `UnauthorizedError`.
   */
  getOrCreateRoom(kind: RoomKind, contextId: string): Promise<ConversationId>;
  /**
   * Get-or-create the canonical 1:1 DM with another user. Anonymous callers and
   * blocked pairs surface as `UnauthorizedError`. (Wired in Phase 3.)
   */
  getOrCreateDm(otherUserId: UserId): Promise<ConversationId>;
  /** Advance the caller's read cursor (self-scoped `last_read_at` upsert). */
  markRead(conversationId: ConversationId, userId: UserId): Promise<void>;
}
