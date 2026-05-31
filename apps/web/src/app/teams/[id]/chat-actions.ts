'use server';

import { DomainError, type MessagePage } from '@pickupvb/domain';
import {
  DeleteMessageCommand,
  EditMessageCommand,
  ListMessagesQuery,
  MarkConversationReadCommand,
  OpenConversationCommand,
  ReportMessageCommand,
  SendMessageCommand,
} from '@pickupvb/application';
import { getChatHandlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';

/**
 * Chat server actions for the team room (ADR 0028, Phase 1). All are invoked
 * from the `'use client'` {@link TeamChatPanel}, so each returns a typed
 * {@link ChatResult} (never throws across the React boundary) — the client
 * branches on `error` to render the right message. Authorization is RLS in the
 * adapters (a non-member surfaces as `UnauthorizedError` → `'forbidden'`).
 *
 * Deliberately no `revalidatePath`: chat reads are per-viewer and live (never
 * cached), and new rows reach every open client over the `chat:{id}` Realtime
 * Broadcast topic — page revalidation would be pure cost (AGENTS.md pitfall #1
 * exception, same spirit as the Stripe-redirect deferral).
 */

const PAGE_SIZE = 30;

export type ChatError = 'anon' | 'forbidden' | 'not_found' | 'invalid' | 'unknown';
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
 * Bootstrap the team room: get-or-create its conversation, load the most recent
 * page, and advance the caller's read cursor. One round-trip for the client to
 * mount against.
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

export async function sendChatMessage(
  conversationId: string,
  body: string,
): Promise<ChatResult<{ id: string }>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  if (!body.trim()) return { ok: false, error: 'invalid' };
  try {
    const h = await getChatHandlers();
    const out = await h.sendMessage.execute(
      new SendMessageCommand(conversationId, v.id, body, v.isAnon),
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

export async function editChatMessage(messageId: string, body: string): Promise<ChatResult<null>> {
  const v = await viewer();
  if (!v || v.isAnon) return { ok: false, error: 'anon' };
  try {
    const h = await getChatHandlers();
    await h.editMessage.execute(new EditMessageCommand(messageId, v.id, body));
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
