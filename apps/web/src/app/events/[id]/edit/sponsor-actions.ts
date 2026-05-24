'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError, UnauthorizedError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field, fieldOrNull } from '@/lib/form-data';
import { hasProBenefits } from '@/lib/admin';
import { getServerSupabase } from '@/lib/supabase';
import { requireSession } from '@/lib/server-auth';

function flashTo(eventId: string, code: string, msg?: string): never {
  const params = new URLSearchParams({ sponsor: code });
  if (msg) params.set('sponsor_msg', msg);
  redirect(`/events/${eventId}/edit?${params.toString()}`);
}

function normalizeHttpsUrlOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function assertCanManage(eventId: string, userId: string): Promise<void> {
  const detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, userId));
  if (!detail.canManage) {
    throw new UnauthorizedError('Only event managers can update sponsors.');
  }
}

export async function upsertSponsorFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    if (err instanceof UnauthorizedError) flashTo(eventId, 'unauthorized');
    flashTo(eventId, 'unauthorized');
  }

  const pro = await hasProBenefits(user.id);
  if (!pro) flashTo(eventId, 'pro');

  const name = field(formData, 'name');
  const blurb = fieldOrNull(formData, 'blurb', 140);
  const discountCode = fieldOrNull(formData, 'discount_code', 32);
  const linkUrl = normalizeHttpsUrlOrNull(fieldOrNull(formData, 'link_url', 300));
  const logoUrl = normalizeHttpsUrlOrNull(fieldOrNull(formData, 'logo_url', 300));

  if (!name) flashTo(eventId, 'invalid', 'Sponsor name is required.');

  // When a URL is supplied, require https to match the db constraint and avoid
  // mixed-content surprises in browser rendering.
  if (fieldOrNull(formData, 'link_url', 300) && !linkUrl) {
    flashTo(eventId, 'invalid', 'Sponsor link must start with https://');
  }
  if (fieldOrNull(formData, 'logo_url', 300) && !logoUrl) {
    flashTo(eventId, 'invalid', 'Logo URL must start with https://');
  }

  const sb = await getServerSupabase();
  const { error } = await sb.from('event_sponsors').upsert(
    {
      event_id: eventId,
      name,
      blurb,
      link_url: linkUrl,
      logo_url: logoUrl,
      discount_code: discountCode,
    } as never,
    { onConflict: 'event_id' },
  );

  if (error) flashTo(eventId, 'error', error.message);

  revalidatePath(returnPath);
  updateTag(`event:${eventId}`);
  flashTo(eventId, 'saved');
}

export async function removeSponsor(eventId: string, returnPath: string): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    if (err instanceof UnauthorizedError) flashTo(eventId, 'unauthorized');
    flashTo(eventId, 'unauthorized');
  }

  const sb = await getServerSupabase();
  const { error } = await sb.from('event_sponsors').delete().eq('event_id', eventId);
  if (error) flashTo(eventId, 'error', error.message);

  revalidatePath(returnPath);
  updateTag(`event:${eventId}`);
  flashTo(eventId, 'removed');
}
