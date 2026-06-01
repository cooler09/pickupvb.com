'use server';

import {
  DomainError,
  UserId,
  type ConversationKind,
  type MessageAttachment,
  type MessagePage,
} from '@pickupvb/domain';
import {
  DeleteMessageCommand,
  EditMessageCommand,
  ListMessagesQuery,
  MarkConversationReadCommand,
  OpenConversationCommand,
  OpenDmCommand,
  ReportMessageCommand,
  SendMessageCommand,
} from '@pickupvb/application';
import { SupabaseUserBlockRepository } from '@pickupvb/infrastructure';
import { getChatHandlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit';

/**
 * Universal cost-control cap on chat **image uploads** (monetization R-2, Path A
 * — _not_ a Pro paywall; chat is a community surface). A user may send at most
 * this many attachment-bearing messages per rolling 24h. Text-only messages are
 * never throttled. Each message already caps at 10 images × 10 MB (bucket-
 * enforced), so this bounds per-user upload volume against a runaway / abuse
 * loop without touching legitimate chatting. Counting messages (not images)
 * keeps it on the existing 1-per-call fixed-window limiter — no migration. The
 * limiter fails open, so a DB blip never blocks a real send.
 */
const CHAT_ATTACHMENT_MESSAGES_PER_DAY = 40;
const CHAT_ATTACHMENT_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Chat server actions (ADR 0028). Shared across the team-room panel (Phase 1)
 * and the DM thread (Phase 3) — all are invoked from `'use client'` and return
 * a typed {@link ChatResult} (never throw across the React boundary). The client
 * branches on `error`. Authorization is RLS in the adapters (a non-member /
 * blocked pair surfaces as `UnauthorizedError` → `'forbidden'`).
 *
 * Deliberately no `revalidatePath`: chat reads are per-viewer and live (never
 * cached), and new rows reach every open client over the `chat:{id}` Realtime
 * Broadcast topic — page revalidation would be pure cost (AGENTS.md pitfall #1
 * exception, same spirit as the Stripe-redirect deferral).
 */

const PAGE_SIZE = 30;

export type ChatError = 'anon' | 'forbidden' | 'not_found' | 'invalid' | 'rate_limited' | 'unknown';
export type ChatResult<T> = { ok: true; value: T } | { ok: false; error: ChatError };

function toChatError(e: unknown): ChatError {
  if (e instanceof DomainError) {
    switch (e.code) {
      case 'UNAUTHORIZED':
        return 'forbidden';
      case 'NOT_FOUND':
        return 'not_found';
      case 'VALIDATION':
      case 'CONFLICT':
        return 'invalid';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}

async function viewer(): Promise<{ id: string; isAnon: boolean } | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, isAnon: Boolean(user.is_anonymous) };
}

/**
 * Bootstrap a team room: get-or-create its conversation, load the most recent
 * page, and advance the caller's read cursor. One round-trip for the
 * `TeamChatPanel` island to mount against.
 */
export async function openTeamChat(
  teamId: string,
): Promise<ChatResult<{ conversationId: string; viewerId: string; page: MessagePage }>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const h = await getChatHandlers();
    const { id: conversationId } = await h.openConversation.execute(
      new OpenConversationCommand('team', teamId),
    );
    const page = await h.listMessages.execute(new ListMessagesQuery(conversationId, PAGE_SIZE));
    await h.markConversationRead.execute(new MarkConversationReadCommand(conversationId, v.id));
    return { ok: true, value: { conversationId, viewerId: v.id, page } };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

/** Get-or-create the 1:1 DM with another user (Phase 3). Returns the
 * conversation id so the caller can navigate to `/messages/{id}`. */
export async function startDmWithUser(
  otherUserId: string,
): Promise<ChatResult<{ conversationId: string }>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const h = await getChatHandlers();
    const { id } = await h.openDm.execute(new OpenDmCommand(otherUserId));
    return { ok: true, value: { conversationId: id } };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

export async function sendChatMessage(
  conversationId: string,
  body: string,
  attachments: MessageAttachment[] = [],
  /** Surface kind, set server-side at render (mask rooms vs block-extreme DMs,
   * ADR 0030). Defaults to the stricter room treatment. */
  kind: ConversationKind = 'team',
): Promise<ChatResult<{ id: string }>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  if (!body.trim() && attachments.length === 0) return { ok: false, error: 'invalid' };
  // Cost-control: throttle image uploads per user/day (R-2 Path A). Only counts
  // attachment-bearing sends; text chat is never limited. Fails open.
  if (attachments.length > 0) {
    const { allowed } = await consumeRateLimit({
      key: rateLimitKey('chat-attach', 'user', v.id),
      limit: CHAT_ATTACHMENT_MESSAGES_PER_DAY,
      windowSeconds: CHAT_ATTACHMENT_WINDOW_SECONDS,
    });
    if (!allowed) return { ok: false, error: 'rate_limited' };
  }
  try {
    const h = await getChatHandlers();
    const out = await h.sendMessage.execute(
      new SendMessageCommand(conversationId, v.id, body, v.isAnon, attachments, kind),
    );
    return { ok: true, value: out };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

export async function loadOlderChatMessages(
  conversationId: string,
  before: string,
): Promise<ChatResult<MessagePage>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const h = await getChatHandlers();
    const page = await h.listMessages.execute(
      new ListMessagesQuery(conversationId, PAGE_SIZE, before),
    );
    return { ok: true, value: page };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

export async function editChatMessage(
  messageId: string,
  body: string,
  kind: ConversationKind = 'team',
): Promise<ChatResult<null>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const h = await getChatHandlers();
    await h.editMessage.execute(new EditMessageCommand(messageId, v.id, body, kind));
    return { ok: true, value: null };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

export async function deleteChatMessage(messageId: string): Promise<ChatResult<null>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const h = await getChatHandlers();
    await h.deleteMessage.execute(new DeleteMessageCommand(messageId, v.id));
    return { ok: true, value: null };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

export async function reportChatMessage(
  messageId: string,
  reason: string | null,
): Promise<ChatResult<null>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const h = await getChatHandlers();
    await h.reportMessage.execute(new ReportMessageCommand(messageId, v.id, reason));
    return { ok: true, value: null };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

/** Advance the caller's read cursor (best-effort; failures are swallowed). */
export async function markChatRead(conversationId: string): Promise<void> {
  const v = await viewer();
  if (!v || v.isAnon) return;
  try {
    const h = await getChatHandlers();
    await h.markConversationRead.execute(new MarkConversationReadCommand(conversationId, v.id));
  } catch {
    // Non-critical — the unread cursor will catch up on the next open.
  }
}

/** Block a user (Phase 3). No invariant beyond the DB not-self CHECK, so the
 * action drives the edge port directly (AGENTS.md pattern #10). */
export async function blockUser(otherUserId: string): Promise<ChatResult<null>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const supabase = await getServerSupabase();
    await new SupabaseUserBlockRepository(supabase).block(UserId(v.id), UserId(otherUserId));
    return { ok: true, value: null };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}

export async function unblockUser(otherUserId: string): Promise<ChatResult<null>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const supabase = await getServerSupabase();
    await new SupabaseUserBlockRepository(supabase).unblock(UserId(v.id), UserId(otherUserId));
    return { ok: true, value: null };
  } catch (e) {
    return { ok: false, error: toChatError(e) };
  }
}
