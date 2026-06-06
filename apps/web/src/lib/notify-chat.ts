/**
 * Chat-message notification fan-out (ADR 0028 follow-up).
 *
 * Sending a chat message used to notify the recipient on **no channel** — they
 * only discovered it by opening `/messages`. This closes that gap for both
 * direct messages **and** room (team/event/group) messages: a new message pings
 * each recipient's bell (in_app) and device (push), gated by their notification
 * preferences like any other kind.
 *
 * Recipients by kind:
 *   - **DM** — the other materialized participant (their two rows are the grant).
 *   - **Room** — derived from the source membership tables (team/event/group),
 *     not materialized, so resolved via the `list_room_recipients` RPC, which
 *     mirrors `can_access_conversation` and already excludes the sender + anyone
 *     who muted the room (notifications audit P2 #6).
 *
 * Coalescing / throttle: if a recipient already has an *unread* chat ping for
 * this conversation from the last few minutes, we skip — a rapid back-and-forth
 * (or a busy room) pings each person once, not per line. The check is a single
 * batched query over the recipient set, so a large room costs one lookup. Once
 * read (or the window lapses) the next message pings again. The push channel
 * additionally carries a per-window idempotency key as belt-and-suspenders.
 *
 * Best-effort: runs on the service-role client (session-less fan-out, the
 * sanctioned admin-client case per AGENTS.md pitfall #8) and swallows errors —
 * a failed ping must never affect the send it follows. Sender names are read
 * from `profiles_public`, never base `profiles` (pitfall #13).
 */
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import type { ConversationKind } from '@pickupvb/domain';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';

const THROTTLE_MS = 5 * 60 * 1000;
const PREVIEW_MAX = 140;

export function buildPreview(body: string, attachmentsCount: number): string {
  const trimmed = body.trim();
  if (trimmed) {
    return trimmed.length > PREVIEW_MAX ? `${trimmed.slice(0, PREVIEW_MAX - 1)}…` : trimmed;
  }
  return attachmentsCount > 0 ? '📷 Photo' : '';
}

export async function notifyChatMessage(args: {
  conversationId: string;
  senderId: string;
  body: string;
  attachmentsCount: number;
  kind: ConversationKind;
}): Promise<void> {
  const { conversationId, senderId, body, attachmentsCount, kind } = args;
  try {
    const admin = createSupabaseAdminClient();

    // Recipients depend on the conversation kind.
    let recipientIds: string[];
    if (kind === 'dm') {
      // The other materialized participant(s) of the DM (a DM has exactly two).
      const { data: parts } = await admin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', senderId);
      recipientIds = ((parts as { user_id: string }[] | null) ?? []).map((p) => p.user_id);
    } else {
      // Room membership is derived from the source tables, not materialized, so
      // resolve it via the RPC (excludes the sender + muted members in SQL).
      const { data: rows } = await admin.rpc('list_room_recipients', {
        p_conversation_id: conversationId,
        p_exclude: senderId,
      });
      recipientIds = ((rows as { user_id: string }[] | null) ?? []).map((r) => r.user_id);
    }
    if (recipientIds.length === 0) return;

    const { data: senderRow } = await admin
      .from('profiles_public')
      .select('display_name')
      .eq('id', senderId)
      .maybeSingle();
    const senderName =
      (senderRow as { display_name: string | null } | null)?.display_name ?? 'Someone';

    const preview = buildPreview(body, attachmentsCount);
    const href = `/messages/${conversationId}`;
    const since = new Date(Date.now() - THROTTLE_MS).toISOString();
    const bucket = Math.floor(Date.now() / THROTTLE_MS);

    // Coalesce in one batched lookup: recipients with an unread ping for this
    // thread in the window are skipped (a busy room pings each person once).
    const { data: pending } = await admin
      .from('notifications')
      .select('user_id')
      .in('user_id', recipientIds)
      .eq('kind', 'chat.message.received')
      .eq('href', href)
      .is('read_at', null)
      .gte('created_at', since);
    const alreadyPinged = new Set(
      ((pending as { user_id: string }[] | null) ?? []).map((p) => p.user_id),
    );

    for (const recipientId of recipientIds) {
      if (alreadyPinged.has(recipientId)) continue;
      await notify(
        'chat.message.received',
        recipientId,
        { conversationId, senderId, senderName, preview },
        { idempotencyKey: `${conversationId}:${recipientId}:${bucket}` },
      );
    }
  } catch (err) {
    await log.warn('[notify-chat] dispatch failed', {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
