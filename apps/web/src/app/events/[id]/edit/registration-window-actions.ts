'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import { getServerSupabase } from '@/lib/supabase';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';

/**
 * Manually open/close registration on a published event — the host "Close
 * registration now / Reopen / Resume schedule" toggle on the manage dashboard.
 * Writes the `events.registration_override` flag, the highest-precedence input
 * to {@link VolleyballEvent.registrationIsClosed}:
 *   - `'closed'` → force-close regardless of the scheduled window;
 *   - `'open'`   → force-open until the event starts;
 *   - `null`     → clear the override and follow the scheduled window.
 *
 * Runs on the user-session client so the `events` RLS (host / co-host) enforces
 * — the read-model `canManage` re-check above is the primary gate (mirrors
 * cancelEventAction). Plain `<form action>` callsite, so it returns void; the
 * button is never rendered to a non-manager.
 */
export async function setRegistrationOverrideAction(
  eventId: string,
  override: 'open' | 'closed' | null,
  _formData?: FormData,
): Promise<void> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  let detail;
  try {
    detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, user.id));
  } catch {
    return;
  }
  if (!detail.canManage) return;

  await supabase
    .from('events')
    .update({ registration_override: override, updated_at: new Date().toISOString() })
    .eq('id', eventId);

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/manage`);
  updateTag(eventCacheTag(eventId));
}
