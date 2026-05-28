'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

  // Insert the broadcast row — RLS enforces host-only.
  const { data: inserted, error: insErr } = await supabase
    .from('broadcasts')
    .insert({
      sender_id: user.id,
      audience_type: 'event_attendees',
      audience_id: eventId,
      subject: subject || null,
      body,
      channels: ['email', 'in_app'],
    } as never)
    .select('id')
    .single();
  if (insErr) {
    return { error: insErr.message };
  }
  const broadcastId = (inserted as { id: string } | null)?.id ?? '';

  // Fan out using admin client (RLS bypass) since we need to notify every
  // attendee. Inserter authorization was already enforced above.
  const admin = getAdminSupabase();
  const [{ data: attRows }, { data: senderRow }] = await Promise.all([
    admin
      .from('event_participants')
      .select('user_id, division:event_divisions!inner(event_id)')
      .eq('role', 'attendee')
      .eq('division.event_id', eventId),
    admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const attendees = (attRows as { user_id: string }[] | null) ?? [];
  const senderName =
    (senderRow as { display_name: string | null } | null)?.display_name ?? 'Your host';

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

  await admin
    .from('broadcasts')
    .update({ sent_at: new Date().toISOString() } as never)
    .eq('id', broadcastId);

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?broadcast=sent`);
}
