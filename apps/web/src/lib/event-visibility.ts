import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getViewer } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';

/**
 * Visibility gate for spectator / admin pages whose data read runs on the
 * service-role admin client (RLS-bypassed) — the bracket / schedule / watch
 * pages read event metadata via `getBracketMeta`, so without a gate a scoped
 * (`friends_of_*` / `private`) or unpublished event leaks its title + division
 * structure to any caller. This is the spectator-page follow-up to the
 * event-detail fix (security audit P1 #14).
 *
 * Cache-preserving by design: a published `public` / `invite_only` event is
 * visible to everyone, so the common (public tournament / league) path resolves
 * with one admin-client field read and NO `cookies()` — the page stays
 * cacheable. Only a scoped / unpublished event reaches the per-viewer cookie
 * read, and those pages aren't cacheable-shareable anyway.
 */

type EventVisibilityRow = { status: string; visibility: string };

/**
 * Cheap status+visibility lens, deduped per request via React `cache` so a
 * page's `generateMetadata` and its body share a single admin-client read.
 */
const readEventVisibility = cache(async (id: string): Promise<EventVisibilityRow | null> => {
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('events')
    .select('status, visibility')
    .eq('id', id)
    .maybeSingle();
  return (data as EventVisibilityRow | null) ?? null;
});

/** A published `public` / `invite_only` event is visible to an anon caller. */
function isPubliclyVisible(row: EventVisibilityRow | null): boolean {
  return (
    !!row &&
    row.status === 'published' &&
    (row.visibility === 'public' || row.visibility === 'invite_only')
  );
}

/**
 * Whether the event's title/structure may appear in `<head>` / OG — i.e. it is
 * visible to an anonymous caller. `generateMetadata` uses this to emit a generic
 * title for scoped/unpublished events instead of leaking the real one (mirrors
 * the P1 #14 metadata gate). Viewer-independent, so it stays off the cookie path.
 */
export async function isEventPubliclyVisible(id: string): Promise<boolean> {
  return isPubliclyVisible(await readEventVisibility(id));
}

/**
 * `notFound()` unless the event is visible to the caller. A published
 * public/invite_only event passes for everyone (no `cookies()`); otherwise the
 * caller must be a signed-in viewer the canonical `events_select` RLS policy
 * admits (host / co-host / friend / group member / invite_only-by-link) — we
 * delegate to that policy via a user-scoped existence check rather than
 * re-deriving the rules.
 */
export async function assertEventVisibleOrNotFound(id: string): Promise<void> {
  const row = await readEventVisibility(id);
  if (!row) notFound();
  if (isPubliclyVisible(row)) return;

  const viewer = await getViewer();
  if (!viewer?.user) notFound();
  const sb = await getServerSupabase();
  const { data } = await sb.from('events').select('id').eq('id', id).maybeSingle();
  if (!data) notFound();
}
