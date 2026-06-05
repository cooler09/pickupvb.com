/**
 * Chat-message notification fan-out (ADR 0028 follow-up).
 *
 * Sending a chat message used to notify the recipient on **no channel** — they
 * only discovered it by opening `/messages`. This closes that gap for direct
 * messages: a new DM pings the recipient's bell (in_app) and their device
 * (push), gated by their notification preferences like any other kind.
 *
 * Scope (P1): **direct messages only.** Room (team/event/group) pings are
 * deferred — enumerating room recipients means fanning out across the
 * source-membership tables, and a naive per-line fan-out would spam a whole
 * roster. DMs are the acute case (1:1; the recipient has no other live signal).
 *
 * Coalescing: if the recipient already has an *unread* chat ping for this
 * conversation from the last few minutes, we skip — a rapid back-and-forth
 * pings once, not per line. Once they read it (or the window lapses) the next
 * message pings again. This throttles both channels with one rule, using the
 * existing `notifications` feed (no new table). The push channel additionally
 * carries a per-window idempotency key as belt-and-suspenders.
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
  if (kind !== 'dm') return; // rooms deferred (audit: notifications-messaging P2)
  try {
    const admin = createSupabaseAdminClient();

    // Recipient(s): the other materialized participant(s) of the DM. (A DM has
    // exactly two; the loop tolerates any non-room conversation with rows.)
    const { data: parts } = await admin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', senderId);
    const recipientIds = ((parts as { user_id: string }[] | null) ?? []).map((p) => p.user_id);
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

    for (const recipientId of recipientIds) {
      // Coalesce: skip if an unread ping for this thread is already waiting.
      const { data: recent } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', recipientId)
        .eq('kind', 'chat.message.received')
        .eq('href', href)
        .is('read_at', null)
        .gte('created_at', since)
        .limit(1);
      if (recent && recent.length > 0) continue;

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
