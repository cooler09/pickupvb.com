'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { field } from '@/lib/form-data';
import { profileCacheTag } from '@/lib/cache-tags';
import { notify } from '@/lib/notify';

/**
 * Host-only manual award of a `host_grant` event badge to a specific attendee
 * (e.g. an "MVP" badge), and the inverse un-award. Writes/deletes a
 * `user_badges` row with source='host', badge_key = the event_badge id,
 * snapshotting label/icon into `context` — the same shape the on_attend RPC
 * writes, so the trophy case renders both identically.
 *
 * Bound from the JSX as `awardEventBadge.bind(null, eventId, badgeId, returnPath)`.
 * Authorization is the event-manager check (`canManage`); the write runs on the
 * admin client because a host badge is a host-awarded system row, not a
 * caller-owned one (AGENTS pitfall #8 — admin is correct for host-gated ops
 * already authorized in the app layer).
 */

async function assertCanManage(eventId: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) redirect(`/events/${eventId}`);
  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) redirect(`/events/${eventId}`);
}

/** Load a host_grant badge that belongs to this event (else null). */
async function loadHostGrantBadge(
  eventId: string,
  badgeId: string,
): Promise<{ id: string; label: string; iconUrl: string | null } | null> {
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('event_badges')
    .select('id, label, icon_url, grant_rule')
    .eq('id', badgeId)
    .eq('event_id', eventId)
    .maybeSingle();
  const row = data as {
    id: string;
    label: string;
    icon_url: string | null;
    grant_rule: string;
  } | null;
  if (!row || row.grant_rule !== 'host_grant') return null;
  return { id: row.id, label: row.label, iconUrl: row.icon_url };
}

export async function awardEventBadge(
  eventId: string,
  badgeId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  await assertCanManage(eventId);

  const userId = field(formData, 'user_id');
  const badge = userId ? await loadHostGrantBadge(eventId, badgeId) : null;
  if (!userId || !badge) {
    revalidatePath(returnPath);
    redirect(returnPath as Route);
  }

  const admin = getAdminSupabase();
  // Idempotent: the (user_id, badge_key) unique constraint makes a re-award a
  // no-op rather than an error.
  const { error } = await admin.from('user_badges').upsert(
    {
      user_id: userId,
      badge_key: badge.id,
      source: 'host',
      context: { eventId, label: badge.label, iconUrl: badge.iconUrl },
    },
    { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
  );
  if (!error) {
    await notify('badge.earned', userId, { badgeTitle: badge.label }).catch(() => undefined);
    updateTag(profileCacheTag(userId));
  }

  revalidatePath(returnPath);
  redirect(returnPath as Route);
}

export async function unawardEventBadge(
  eventId: string,
  badgeId: string,
  userId: string,
  returnPath: string,
  _formData: FormData,
): Promise<void> {
  await assertCanManage(eventId);

  const admin = getAdminSupabase();
  // Scope the delete to a host badge of this event so a host can't strip a
  // system/easter-egg badge by guessing a key.
  const badge = await loadHostGrantBadge(eventId, badgeId);
  if (badge) {
    await admin
      .from('user_badges')
      .delete()
      .eq('user_id', userId)
      .eq('badge_key', badgeId)
      .eq('source', 'host');
    updateTag(profileCacheTag(userId));
  }

  revalidatePath(returnPath);
  redirect(returnPath as Route);
}
