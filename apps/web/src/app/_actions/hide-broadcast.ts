'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import { NotFoundError, UnauthorizedError } from '@pickupvb/domain';
import { SupabaseBroadcastRepository } from '@pickupvb/infrastructure';
import { requireRealUser } from '@/lib/server-auth';
import { getAdminSupabase } from '@/lib/supabase-admin';

type State = { error?: string; ok?: boolean };

/**
 * Hide a broadcast from the sender's audit list. Sender-only.
 *
 * This is a cosmetic "retract" — `notification_outbox` rows have
 * already been generated and (if `sent_at` is set) delivered. The
 * broadcast row is soft-deleted via `broadcasts.deleted_at`; the
 * `broadcasts_select_sender` RLS policy filters `deleted_at is null`
 * so the row disappears from any future host history surface.
 *
 * Today there is no host history UI to call this from — see the
 * follow-ups list in docs/journal/2026-05-26-bundle-93.md. The action
 * is shipped now so the schema and the UI can land in the same bundle
 * later.
 *
 * `eventOrTeamPath` is the page that surfaces broadcast history (e.g.
 * `/events/<slug>` or `/teams/<slug>`); we revalidate it so the
 * deleted row falls out of the next render. `eventId` is optional
 * tag-cache busting for event detail pages.
 */
export async function hideBroadcastAction(
  broadcastId: string,
  eventOrTeamPath: string,
  eventId: string | null,
): Promise<State> {
  const { user, supabase } = await requireRealUser(eventOrTeamPath);

  try {
    // Authorize via the sender_id column. We can't rely on the soft-deleted
    // SELECT policy because that filters the row out for everyone, including
    // the sender; we need to read it first (on the user client) to confirm
    // ownership before marking it deleted.
    const broadcast = await new SupabaseBroadcastRepository(supabase).findSender(broadcastId);
    if (!broadcast) throw new NotFoundError('broadcast', broadcastId);
    if (broadcast.senderId !== user.id)
      throw new UnauthorizedError('You can only hide broadcasts you sent.');

    // RLS quirk: `broadcasts_select_sender` filters `deleted_at is null`,
    // which Postgres applies as an implicit WITH CHECK on UPDATE — flipping
    // deleted_at through the user-scoped client fails because the after-image
    // would be invisible to the sender. Sender check is enforced above, so the
    // admin-client soft-delete is the sanctioned bypass (pitfall #8).
    await new SupabaseBroadcastRepository(getAdminSupabase()).softDelete(broadcastId);

    revalidatePath(eventOrTeamPath);
    if (eventId) updateTag(eventCacheTag(eventId));
    return { ok: true };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    if (err instanceof NotFoundError) return { error: 'Broadcast not found.' };
    throw err;
  }
}
