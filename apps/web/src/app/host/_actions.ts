'use server';

import { cancelEventAction } from '@/app/events/[id]/edit/cancel-actions';

/**
 * Adapter so the dashboard's `ConfirmDialog` can cancel an event with a clean
 * `(eventId, reason)` signature. Delegates to the canonical `cancelEventAction`
 * — which re-authorizes the host, sets `status='cancelled'`, refunds paid
 * attendees, notifies everyone, and on success `redirect()`s to the event page
 * (so the host sees the cancelled state). We only return here on the error
 * branch; `/host` is dynamic (cookie-scoped) so it re-renders fresh on the
 * host's next visit — no extra `revalidatePath` needed.
 */
export async function cancelEventFromDashboard(
  eventId: string,
  reason: string | null,
): Promise<{ error?: string }> {
  const formData = new FormData();
  if (reason) formData.set('reason', reason);
  const result = await cancelEventAction(eventId, {}, formData);
  return result?.error ? { error: result.error } : {};
}
