import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next/types';
import { notFound } from 'next/navigation';
import { NotFoundError } from '@pickupvb/domain';
import { getViewer } from '@/lib/server-auth';
import { LocalDateTime } from '@/components/local-datetime';
import { loadEventDetail, loadEventReadModelPublic } from '../_loaders/load-event-detail';
import { ManageDashboard } from './_components/manage-dashboard';
import { HostAwardBadgesPanel } from '../_components/host-award-badges-panel';
import { getAdminSupabase } from '@/lib/supabase-admin';

// Host-only dashboard — depends on the viewer's session (`canManage`), so it
// can't be cached, and must never be indexed. `force-dynamic` is the correct
// opt-out here (not a public page — see the "No force-dynamic on public pages"
// pitfall in AGENTS.md, which this route is explicitly exempt from).
export const dynamic = 'force-dynamic';

// See the note in apps/web/src/app/events/[id]/page.tsx — reject non-UUID ids
// (bots, stale links) before they reach the DB and surface as a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  let title = 'Manage event — PickupVB';
  try {
    const event = await loadEventReadModelPublic(id);
    title = `Manage — ${event.title} · PickupVB`;
  } catch {
    // Fall through to the generic title.
  }
  // Host surface — never index, but let crawlers follow the public links on it.
  return { title, robots: { index: false, follow: true } };
}

export default async function ManageEventPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  const viewer = await getViewer();
  let vm;
  try {
    vm = await loadEventDetail(id, viewer);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { event } = vm;
  // Only hosts and co-hosts reach the dashboard. `notFound()` (not a redirect)
  // keeps the existence of private events opaque to non-managers.
  if (!event.canManage) notFound();

  const returnPath = `/events/${event.id}/manage`;

  // Manual-award (host_grant) badges + their existing grants, for the award
  // panel. on_attend badges aren't awarded here (they grant on attendance).
  const hostGrantBadges = vm.eventBadges
    .filter((b) => b.grantRule === 'host_grant')
    .map((b) => ({ id: b.id, label: b.label, iconUrl: b.iconUrl }));
  const awardAttendees = event.attendees.map((a) => ({
    userId: a.userId,
    name: a.profile.displayName || a.profile.handle || 'Player',
  }));
  let badgeGrants: { badgeKey: string; userId: string }[] = [];
  if (hostGrantBadges.length > 0) {
    const { data } = await getAdminSupabase()
      .from('user_badges')
      .select('badge_key, user_id')
      .eq('source', 'host')
      .in(
        'badge_key',
        hostGrantBadges.map((b) => b.id),
      );
    badgeGrants = ((data as { badge_key: string; user_id: string }[] | null) ?? []).map((r) => ({
      badgeKey: r.badge_key,
      userId: r.user_id,
    }));
  }

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/events/${event.id}` as Route}
          className="text-primary text-sm hover:underline"
        >
          ← Back to event
        </Link>
        <Link
          href={`/events/${event.id}` as Route}
          className="text-muted hover:text-fg text-sm hover:underline"
        >
          View public page
        </Link>
      </div>

      <header className="space-y-1">
        <p className="text-muted text-xs font-semibold tracking-wide uppercase">Manage event</p>
        <h1 className="text-fg text-headline-lg font-bold">{event.title}</h1>
        <p className="text-muted text-sm">
          <LocalDateTime iso={event.startsAt} variant="eventDateLong" timeZone={event.timeZone} /> ·{' '}
          {event.location.city}, {event.location.region}
        </p>
      </header>

      <ManageDashboard
        event={event}
        returnPath={returnPath}
        adHocHostRows={vm.adHocHostRows}
        eligibleTeamsByDivision={vm.eligibleTeamsByDivision}
        leagueTeamsByDivision={vm.leagueTeamsByDivision}
        viewerIsPro={vm.viewerIsPro}
        payments={vm.payments}
        primaryHostUserSocial={vm.primaryHostUserSocial}
      />

      <HostAwardBadgesPanel
        eventId={event.id}
        returnPath={returnPath}
        badges={hostGrantBadges}
        attendees={awardAttendees}
        grants={badgeGrants}
      />
    </article>
  );
}
