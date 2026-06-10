import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata, Route } from 'next';
import { GetEventBracketMetaQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { ShareLink } from '@/components/share-link';
import { handlers } from '@/lib/handlers';
import { assertEventVisibleOrNotFound, isEventPubliclyVisible } from '@/lib/event-visibility';
import { isPro } from '@/lib/pro';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { DisplayShell } from '../_components/display-shell';
import { BracketRealtimeRefresher } from '../bracket/_components/realtime-refresher';
import { loadDivisionBoards } from '../_lib/load-division-boards';
import { DivisionSummaryCard } from './_components/division-summary-card';

/**
 * All-divisions event dashboard (tournament-displays slice C) — every division's
 * status, progress, standings/champion, and live + up-next matches on one
 * screen, no tabs. The "command center" lens for a desktop or a host's tablet,
 * distinct from `bracket/watch` (one division, deep) and `courts` (pivoted by
 * court).
 *
 * Free spectator page + `?display=1` Pro kiosk ({@link DisplayShell}); noindex
 * (transient operational view).
 */
export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const robots = { index: false, follow: true } as const;
  if (!(await isEventPubliclyVisible(id))) {
    return { title: 'Dashboard — PickupVB', robots };
  }
  try {
    const event = await handlers.getEventBracketMeta.execute(new GetEventBracketMetaQuery(id));
    return {
      title: `Dashboard — ${event.title} · PickupVB`,
      description: `Live event dashboard for ${event.title} — every division at a glance.`,
      robots,
    };
  } catch {
    return { title: 'Dashboard — PickupVB', robots };
  }
}

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  // getBracketMeta reads on the admin client (RLS-bypassed), so re-assert
  // visibility before exposing the title/structure (security audit P1 #14).
  await assertEventVisibleOrNotFound(params.id);

  let event;
  try {
    event = await handlers.getEventBracketMeta.execute(new GetEventBracketMetaQuery(params.id));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (event.type !== 'tournament' && event.type !== 'league') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
          {'← Back to event'}
        </Link>
        <p className="text-muted text-sm">
          The dashboard is available for tournaments and leagues.
        </p>
      </div>
    );
  }

  if (event.divisions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
          {'← Back to event'}
        </Link>
        <p className="text-muted text-sm">This event has no divisions configured yet.</p>
      </div>
    );
  }

  const boards = await loadDivisionBoards(event);
  const liveCount = boards.reduce((n, b) => n + b.live.length, 0);
  const liveDivisionIds = boards
    .filter((b) => b.kind === 'tournament' && b.status === 'active')
    .map((b) => b.id);

  const proHost = !!event.hostUserId && (await isPro(event.hostUserId));
  const displayMode = pickQuery(searchParams, 'display') === '1' && proHost;
  const dashboardPath = `/events/${event.id}/dashboard` as Route;

  const content = (
    <>
      {liveDivisionIds.map((divisionId) => (
        <BracketRealtimeRefresher key={divisionId} divisionId={divisionId} bracketId={null} />
      ))}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((b) => (
          <DivisionSummaryCard key={b.id} board={b} eventId={event.id} />
        ))}
      </div>
    </>
  );

  if (displayMode) {
    return (
      <DisplayShell
        title={`Dashboard — ${event.title}`}
        meta={`${boards.length} division${boards.length === 1 ? '' : 's'} · ${liveCount} live`}
        exitHref={dashboardPath}
      >
        {content}
      </DisplayShell>
    );
  }

  return (
    <article className="mx-auto max-w-6xl space-y-6 p-4">
      <BreadcrumbJsonLd
        trail={[
          { name: 'Events', path: '/events' },
          { name: event.title, path: `/events/${event.id}` },
          { name: 'Dashboard', path: `/events/${event.id}/dashboard` },
        ]}
      />
      <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
        {'← Back to event'}
      </Link>

      <header className="space-y-1">
        <h1 className="text-fg text-headline-lg font-bold">Dashboard — {event.title}</h1>
        <p className="text-muted text-sm">
          {boards.length} division{boards.length === 1 ? '' : 's'} · {liveCount} match
          {liveCount === 1 ? '' : 'es'} in progress • Updates automatically
        </p>
        <div className="pt-1">
          <ShareLink
            path={dashboardPath}
            title={`Dashboard — ${event.title}`}
            label="Share this view"
          />
        </div>
      </header>

      {content}
    </article>
  );
}
