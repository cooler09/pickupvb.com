'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError, maskPublicText } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/server-auth';
import { field, fieldOrNull } from '@/lib/form-data';
import { addManualSignature, removeSignature } from '@/lib/waivers';
import { eventCacheTag } from '@/lib/cache-tags';

/**
 * Host-side waiver authoring + signature tracking (monetization O-9). Free for
 * any host (no Pro gate). NOT a legal-waiver substitute: the host pastes rules
 * text and/or links their OWN waiver (external_url), and can manually record who
 * signed in person (at their discretion). RLS authorizes "can manage this
 * event"; we re-check `canManage` and write on the admin client.
 */
function flash(eventId: string, code: string, msg?: string): never {
  const params = new URLSearchParams({ waiver: code });
  if (msg) params.set('waiver_msg', msg);
  redirect(`/events/${eventId}/edit?${params.toString()}` as Route);
}

function httpsUrlOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

async function assertCanManage(eventId: string, userId: string): Promise<void> {
  const detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, userId));
  if (!detail.canManage) throw new NotFoundError('event', eventId);
}

export async function upsertWaiverFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);
  try {
    await assertCanManage(eventId, user.id);
  } catch {
    flash(eventId, 'unauthorized');
  }

  const rawTitle = field(formData, 'title');
  if (!rawTitle) flash(eventId, 'invalid', 'A title is required.');
  const title = maskPublicText(rawTitle).slice(0, 120);

  const rawBody = fieldOrNull(formData, 'body', 10_000);
  const body = rawBody ? maskPublicText(rawBody).slice(0, 10_000) : null;

  const rawUrl = fieldOrNull(formData, 'external_url', 500);
  const externalUrl = httpsUrlOrNull(rawUrl);
  if (rawUrl && !externalUrl) flash(eventId, 'invalid', 'The waiver link must start with https://');

  if (!body && !externalUrl) {
    flash(eventId, 'invalid', 'Add waiver text or a link to your own waiver (or both).');
  }

  const admin = getAdminSupabase();
  // Bump the version when the body changes so prior acknowledgements read as
  // "an older version".
  const { data: existing } = await admin
    .from('event_waivers')
    .select('body, version')
    .eq('event_id', eventId)
    .maybeSingle();
  const ex = existing as { body: string | null; version: number } | null;
  const version = ex ? (ex.body !== body ? ex.version + 1 : ex.version) : 1;

  const { error } = await admin.from('event_waivers').upsert(
    { event_id: eventId, title, body, external_url: externalUrl, version },
    {
      onConflict: 'event_id',
    },
  );
  if (error) flash(eventId, 'error', error.message);

  revalidatePath(returnPath);
  revalidatePath(`/events/${eventId}/edit`);
  updateTag(eventCacheTag(eventId));
  flash(eventId, 'saved');
}

export async function deleteWaiver(
  eventId: string,
  _returnPath: string,
  _formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);
  try {
    await assertCanManage(eventId, user.id);
  } catch {
    flash(eventId, 'unauthorized');
  }
  const { error } = await getAdminSupabase().from('event_waivers').delete().eq('event_id', eventId);
  if (error) flash(eventId, 'error', error.message);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/edit`);
  updateTag(eventCacheTag(eventId));
  flash(eventId, 'removed');
}

/** Host records a signature collected in person, by name (their discretion). */
export async function addManualSignatureFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);
  try {
    await assertCanManage(eventId, user.id);
  } catch {
    flash(eventId, 'unauthorized');
  }

  const name = field(formData, 'name').trim().slice(0, 120);
  if (!name) flash(eventId, 'invalid', 'Enter the name of the person who signed.');

  const admin = getAdminSupabase();
  const { data: waiver } = await admin
    .from('event_waivers')
    .select('version')
    .eq('event_id', eventId)
    .maybeSingle();
  const version = (waiver as { version: number } | null)?.version ?? 1;

  await addManualSignature({ eventId, name, hostUserId: user.id, waiverVersion: version });

  revalidatePath(returnPath);
  revalidatePath(`/events/${eventId}/edit`);
  flash(eventId, 'recorded');
}

/** Host removes a signature record (in-person or self). */
export async function removeSignatureFromForm(
  eventId: string,
  signatureId: string,
  returnPath: string,
  _formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);
  try {
    await assertCanManage(eventId, user.id);
  } catch {
    flash(eventId, 'unauthorized');
  }
  await removeSignature(eventId, signatureId);
  revalidatePath(returnPath);
  revalidatePath(`/events/${eventId}/edit`);
  flash(eventId, 'sig_removed');
}
