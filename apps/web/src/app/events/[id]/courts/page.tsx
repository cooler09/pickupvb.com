import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata, Route } from 'next';
import { GetEventBracketMetaQuery } from '@pickupvb/application';
import { DivisionId, EventId, NotFoundError, type Match } from '@pickupvb/domain';
import { ShareLink } from '@/components/share-link';
import { handlers, repositories } from '@/lib/handlers';
import { assertEventVisibleOrNotFound, isEventPubliclyVisible } from '@/lib/event-visibility';
import { isPro } from '@/lib/pro';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { DisplayShell } from '../_components/display-shell';
import { BracketRealtimeRefresher } from '../bracket/_components/realtime-refresher';
import { CourtBoardView } from './_components/court-board-view';
import { buildCourtBoard, type CourtMatch, type CourtMatchStatus } from './_lib/court-board';

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

/** Bracket match → board status. Mirrors `pickLatestMatchId`'s live detection:
 *  an undecided match with at least one recorded set is already in play. */
function bracketStatus(m: Match): CourtMatchStatus {
  if (m.status === 'in_progress') return 'live';
  if (m.status !== 'completed' && m.status !== 'bye' && m.sets.length > 0) return 'live';
  if (m.status === 'pending') return 'upcoming';
  return 'done';
}

function leagueStatus(s: string): CourtMatchStatus {
  if (s === 'in_progress') return 'live';
  if (s === 'scheduled') return 'upcoming';
  return 'done';
}

function nameLookup(teams: ReadonlyArray<{ entryId: string; name: string }>) {
  const map = new Map(teams.map((t) => [t.entryId, t.name]));
  return (id: string | null): string | null => (id ? (map.get(id) ?? null) : null);
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

  const isTournament = event.type === 'tournament';

  // Gather every division's matches into one flat list, plus the division ids
  // whose brackets are live (drives the realtime refreshers below).
  const courtMatches: CourtMatch[] = [];
  const liveBracketDivisionIds: string[] = [];

  await Promise.all(
    event.divisions.map(async (d) => {
      const teams = await repositories.bracketRepo.listRegisteredTeams(
        EventId(event.id),
        DivisionId(d.id),
      );
      const nameOf = nameLookup(teams);

      if (isTournament) {
        const bracket = await repositories.bracketRepo.findByDivisionId(DivisionId(d.id));
        if (!bracket || (bracket.status !== 'active' && bracket.status !== 'completed')) return;
        liveBracketDivisionIds.push(d.id);
        for (const m of bracket.matches) {
          courtMatches.push({
            id: String(m.id),
            court: m.court,
            divisionLabel: d.label,
            stageLabel: m.pool ? `Pool ${m.pool}` : `Round ${m.round}`,
            teamA: nameOf(m.entryAId ? String(m.entryAId) : null),
            teamB: nameOf(m.entryBId ? String(m.entryBId) : null),
            status: bracketStatus(m),
            sortKey: m.round * 1000 + m.matchNumber,
          });
        }
      } else {
        const schedule = await repositories.leagueScheduleRepo.findByDivisionId(d.id as DivisionId);
        if (!schedule) return;
        for (const m of schedule.matches) {
          courtMatches.push({
            id: String(m.id),
            court: m.courtLabel,
            divisionLabel: d.label,
            stageLabel: `Week ${m.weekNumber}`,
            teamA: nameOf(m.homeEntryId ? String(m.homeEntryId) : null),
            teamB: nameOf(m.awayEntryId ? String(m.awayEntryId) : null),
            status: leagueStatus(m.status),
            sortKey: m.scheduledAt.getTime(),
          });
        }
      }
    }),
  );

  const board = buildCourtBoard(courtMatches);
  const liveCount = courtMatches.filter((m) => m.status === 'live').length;

  const proHost = !!event.hostUserId && (await isPro(event.hostUserId));
  const displayMode = pickQuery(searchParams, 'display') === '1' && proHost;
  const courtsPath = `/events/${event.id}/courts` as Route;

  const content = (
    <>
      {/* Tournament brackets get realtime refreshers — one per live division —
          so a result landing anywhere re-renders the whole board. Leagues have
          no refresher yet (reload parity with the schedule page). */}
      {isTournament &&
        liveBracketDivisionIds.map((divisionId) => (
          <BracketRealtimeRefresher key={divisionId} divisionId={divisionId} bracketId={null} />
        ))}
      <CourtBoardView board={board} />
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
