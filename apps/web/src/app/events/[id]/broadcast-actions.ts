'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SupabaseBroadcastRepository, SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { notify } from '@/lib/notify';

type State = { ok?: boolean; error?: string };

/**
 * Send a host broadcast to all attendees of an event.
 *
 * RLS on `broadcasts` enforces that only the event host can insert an
 * `event_attendees` broadcast — we still record the row first via the
 * user-session client, then fan out via the admin client (because we need
 * to reach every attendee regardless of who's signed in).
 */
export async function sendEventBroadcast(
  eventId: string,
  _prev: State,
  formData: FormData,
): Promise<State> {
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!body || body.length < 3) {
    return { error: 'Message body is required.' };
  }
  if (body.length > 2000) {
    return { error: 'Message is too long (max 2,000 characters).' };
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be signed in.' };

  // Insert the broadcast row on the user client — RLS enforces host-only.
  let broadcastId: string;
  try {
    const created = await new SupabaseBroadcastRepository(supabase).create({
      senderId: user.id,
      audienceType: 'event_attendees',
      audienceId: eventId,
      subject: subject || null,
      body,
      channels: ['email', 'in_app'],
    });
    broadcastId = created.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not send broadcast.' };
  }

  // Fan out using admin client (RLS bypass) since we need to notify every
  // attendee. Inserter authorization was already enforced above. The
  // event_participants read is an events-subdomain concern (left raw); the
  // sender's name comes from the profile read port.
  const admin = getAdminSupabase();
  const [{ data: attRows }, senderCard] = await Promise.all([
    admin
      .from('event_participants')
      .select('user_id, division:event_divisions!inner(event_id)')
      .eq('role', 'attendee')
      .eq('division.event_id', eventId),
    new SupabaseProfileRepository(admin).findCardById(user.id),
  ]);
  const attendees = (attRows as { user_id: string }[] | null) ?? [];
  const senderName = senderCard?.displayName ?? 'Your host';

  for (const a of attendees) {
    if (a.user_id === user.id) continue; // don't notify the sender
    await notify(
      'broadcast.host_message',
      a.user_id,
      {
        eventId,
        subject: subject || 'Message from your host',
        body,
        senderName,
      },
      { idempotencyKey: `broadcast:${broadcastId}:${a.user_id}` },
    );
  }

  await new SupabaseBroadcastRepository(admin).markSent(broadcastId);

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?broadcast=sent`);
}
