import 'server-only';
import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import type { GroupDetail } from '@pickupvb/domain';
import { getServerSupabase } from '@/lib/supabase';

type SupabaseServerClient = Awaited<ReturnType<typeof getServerSupabase>>;

export type GroupManagerContext = {
  /** Cookie-bound server client (React-cached, so shared with the caller). */
  supabase: SupabaseServerClient;
  /** Read-model adapter on the same client, for follow-up reads (e.g. members). */
  groupQueries: SupabaseGroupQueryRepository;
  group: GroupDetail;
  role: 'owner' | 'admin';
  userId: string;
};

/**
 * Shared owner/admin gate for the group manager sub-pages — edit, members,
 * billing, analytics (GD-5, collapsing four copies of this same gate). Resolves
 * the `[id]` slug → `GroupDetail`, requires a signed-in owner/admin, and
 * otherwise short-circuits with the appropriate navigation:
 *
 * - signed out → `redirect('/login?next=<nextPath>')` (bounce back here),
 * - unknown slug → `notFound()`,
 * - signed in but not a manager → `redirect('/groups/<slug>')` (public page).
 *
 * Returns the client + read-model adapter alongside the gate result so a caller
 * that needs further reads (the members page lists the roster) reuses them
 * instead of re-constructing — `getServerSupabase` is React-cached, so this is
 * one client per request regardless.
 */
export async function requireGroupManager(
  slug: string,
  nextPath: string,
): Promise<GroupManagerContext> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${nextPath}` as Route);

  const groupQueries = new SupabaseGroupQueryRepository(supabase);
  const group = await groupQueries.findDetailBySlug(slug);
  if (!group) notFound();

  const role = await groupQueries.findViewerRole(group.id, user.id);
  if (role !== 'owner' && role !== 'admin') redirect(`/groups/${group.slug}`);

  return { supabase, groupQueries, group, role, userId: user.id };
}
