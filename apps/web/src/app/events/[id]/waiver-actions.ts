'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { requireSession } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { getEventWaiver } from '@/lib/waivers';
import { field } from '@/lib/form-data';

/**
 * Attendee e-signs an event's waiver (monetization O-9, click-wrap). Records the
 * typed name + the waiver version agreed to + timestamp on the signer's own row
 * (RLS self-insert/update). Soft: this does NOT gate registration — it's a
 * voluntary, recorded acknowledgement. Re-signing upserts (e.g. after the host
 * edits the waiver and the version bumps).
 */
export async function signWaiver(eventId: string, formData: FormData): Promise<void> {
  const { user } = await requireSession(`/events/${eventId}`);

  const waiver = await getEventWaiver(eventId);
  if (!waiver) redirect(`/events/${eventId}?waiver=gone` as Route);

  const signedName = field(formData, 'signed_name').trim().slice(0, 120);
  if (!signedName) redirect(`/events/${eventId}?waiver=need_name` as Route);
  if (field(formData, 'agree') !== 'on') redirect(`/events/${eventId}?waiver=need_agree` as Route);

  const sb = await getServerSupabase();
  const { error } = await sb.from('waiver_signatures').upsert(
    {
      event_id: eventId,
      user_id: user.id,
      waiver_version: waiver.version,
      signed_name: signedName,
      method: 'self',
      signed_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,user_id' },
  );
  if (error) redirect(`/events/${eventId}?waiver=error` as Route);

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?waiver=signed` as Route);
}
