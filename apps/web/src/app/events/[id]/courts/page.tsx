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
import { LiveScoresProvider } from '../_components/live-scores-provider';
import { LeagueScheduleRealtimeRefresher } from '../_components/league-schedule-realtime-refresher';
import { BracketRealtimeRefresher } from '../bracket/_components/realtime-refresher';
import { CourtBoardView } from './_components/court-board-view';
import { buildCourtBoard } from '../_lib/court-board';
import { loadDivisionBoards } from '../_lib/load-division-boards';

/**
 * Public "next up on court" board (tournament-displays slice B) — a venue-wide
 * view that pivots every division's live + upcoming matches by court, so a gym
 * TV shows "Court 3: A vs B — now · next: C vs D" across the whole event.
 *
 * Free spectator surface (like `bracket/watch` / `schedule`); `?display=1` is
 * the Pro-host kiosk variant wrapped in {@link DisplayShell}. Noindex either way
 * — it's a transient operational view, not indexable content.
 */
export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const robots = { index: false, follow: true } as const;
  if (!(await isEventPubliclyVisible(id))) {
    return { title: 'Courts — PickupVB', robots };
  }
  try {
    const event = await handlers.getEventBracketMeta.execute(new GetEventBracketMetaQuery(id));
    return {
      title: `Courts — ${event.title} · PickupVB`,
      description: `Live court board for ${event.title} — what's playing now and what's up next.`,
      robots,
    };
  } catch {
    return { title: 'Courts — PickupVB', robots };
  }
}

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function CourtsPage(props: {
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
          The court board is available for tournaments and leagues.
        </p>
      </div>
    );
  }

  const boards = await loadDivisionBoards(event);
  const courtMatches = boards.flatMap((b) => b.matches);
  const board = buildCourtBoard(courtMatches);
  const liveCount = courtMatches.filter((m) => m.status === 'live').length;
  // Realtime refreshers: actively-running tournament divisions watch their
  // bracket; league divisions watch their schedule. Either re-renders the board.
  const liveDivisionIds = boards
    .filter((b) => b.kind === 'tournament' && b.status === 'active')
    .map((b) => b.id);
  const leagueDivisionIds = boards.filter((b) => b.kind === 'league').map((b) => b.id);
  const allDivisionIds = event.divisions.map((d) => d.id);

  const proHost = !!event.hostUserId && (await isPro(event.hostUserId));
  const displayMode = pickQuery(searchParams, 'display') === '1' && proHost;
  const courtsPath = `/events/${event.id}/courts` as Route;

  const content = (
    <>
      {liveDivisionIds.map((divisionId) => (
        <BracketRealtimeRefresher key={divisionId} divisionId={divisionId} bracketId={null} />
      ))}
      {leagueDivisionIds.map((divisionId) => (
        <LeagueScheduleRealtimeRefresher key={divisionId} divisionId={divisionId} />
      ))}
      {/* Live in-progress scores across every division (ADR 0023, Pro-gated). */}
      <LiveScoresProvider enabled={proHost} divisionIds={allDivisionIds}>
        <CourtBoardView board={board} />
      </LiveScoresProvider>
    </>
  );

  if (displayMode) {
    return (
      <DisplayShell
        title={`Courts — ${event.title}`}
        meta={`${board.courts.length} court${board.courts.length === 1 ? '' : 's'} · ${liveCount} live`}
        exitHref={courtsPath}
      >
        {content}
      </DisplayShell>
    );
  }

  return (
    <article className="mx-auto max-w-5xl space-y-6 p-4">
      <BreadcrumbJsonLd
        trail={[
          { name: 'Events', path: '/events' },
          { name: event.title, path: `/events/${event.id}` },
          { name: 'Courts', path: `/events/${event.id}/courts` },
        ]}
      />
      <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
        {'← Back to event'}
      </Link>

      <header className="space-y-1">
        <h1 className="text-fg text-headline-lg font-bold">Courts — {event.title}</h1>
        <p className="text-muted text-sm">
          {board.courts.length > 0
            ? `${board.courts.length} court${board.courts.length === 1 ? '' : 's'} · `
            : ''}
          {liveCount} match{liveCount === 1 ? '' : 'es'} in progress • Updates automatically
        </p>
        <div className="pt-1">
          <ShareLink path={courtsPath} title={`Courts — ${event.title}`} label="Share this view" />
        </div>
      </header>

      {content}
    </article>
  );
}
