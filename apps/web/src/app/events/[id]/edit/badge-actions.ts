'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  assertCleanName,
  maskPublicText,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field, fieldOrNull } from '@/lib/form-data';
import { hasProBenefits } from '@/lib/admin';
import { getServerSupabase } from '@/lib/supabase';
import { requireSession } from '@/lib/server-auth';
import { eventCacheTag } from '@/lib/cache-tags';

/**
 * Host-authored event badges (gamification Phase 2). Authoring is a Pro
 * capability — same shape as the sponsor slot ([sponsor-actions.ts]): RLS
 * authorizes "can manage this event", the application layer authorizes "is
 * allowed to create a badge at all". Label is hard-blocked for profanity
 * (`assertCleanName`); description is mask-at-write (`maskPublicText`) — the
 * same UGC discipline as media/listing text (ADR 0030).
 */

function flashTo(eventId: string, code: string, msg?: string): never {
  const params = new URLSearchParams({ badge: code });
  if (msg) params.set('badge_msg', msg);
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
    throw new UnauthorizedError('Only event managers can manage badges.');
  }
}

export async function addEventBadgeFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    flashTo(eventId, 'unauthorized');
  }

  if (!(await hasProBenefits(user.id))) flashTo(eventId, 'pro');

  const rawLabel = field(formData, 'label');
  if (!rawLabel) flashTo(eventId, 'invalid', 'A badge label is required.');

  let label: string;
  try {
    label = assertCleanName(rawLabel);
  } catch (err) {
    if (err instanceof ValidationError)
      flashTo(eventId, 'invalid', 'Please choose a cleaner label.');
    flashTo(eventId, 'invalid', 'Invalid badge label.');
  }

  const rawDescription = fieldOrNull(formData, 'description', 140);
  const description = rawDescription ? maskPublicText(rawDescription) : null;
  const iconUrl = normalizeHttpsUrlOrNull(fieldOrNull(formData, 'icon_url', 300));
  const grantRule = field(formData, 'grant_rule') === 'host_grant' ? 'host_grant' : 'on_attend';
  // The add form generates the id client-side so the uploaded icon path
  // ({user}/{event}/badges/{id}.{ext}) and the row id line up.
  const id = field(formData, 'id') || randomUUID();

  const sb = await getServerSupabase();
  const { error } = await sb.from('event_badges').insert({
    id,
    event_id: eventId,
    label,
    description,
    icon_url: iconUrl,
    grant_rule: grantRule,
  });
  if (error) flashTo(eventId, 'error', error.message);

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  flashTo(eventId, 'saved');
}

export async function removeEventBadge(
  eventId: string,
  badgeId: string,
  returnPath: string,
  _formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    flashTo(eventId, 'unauthorized');
  }

  const sb = await getServerSupabase();
  const { error } = await sb
    .from('event_badges')
    .delete()
    .eq('id', badgeId)
    .eq('event_id', eventId);
  if (error) flashTo(eventId, 'error', error.message);

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  flashTo(eventId, 'removed');
}
