import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { GetEventBracketMetaQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { ShareLink } from '@/components/share-link';
import { handlers, repositories } from '@/lib/handlers';
import { isPro } from '@/lib/pro';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { LiveScoresProvider } from '../../_components/live-scores-provider';
import { BoardView, pickLatestMatchId } from '../_components/board-view';
import { LatestMatchTracker } from '../_components/latest-match-tracker';
import { BracketRealtimeRefresher } from '../_components/realtime-refresher';

/**
 * Public spectator view of a tournament bracket. Read-only, no host or
 * captain affordances. Anyone with the link can watch the bracket update
 * live via the realtime refresher.
 *
 * Distinct from `/events/[id]/bracket` (the host/captain workspace) so the
 * spectator UI stays uncluttered and the page doesn't need to opt out of
 * caching for auth-dependent reasons. RLS on `event_brackets`,
 * `bracket_matches`, and `bracket_match_sets` is already `for select using
 * (true)`, so anon viewers see the same data.
 */

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const divisionParam = pickQuery(sp, 'division') ?? null;
  try {
    const event = await handlers.getEventBracketMeta.execute(new GetEventBracketMetaQuery(id));
    const division =
      (divisionParam && event.divisions.find((d) => d.id === divisionParam)) ||
      event.divisions[0] ||
      null;
    const isMulti = event.divisions.length > 1;
    const divisionSuffix = division && isMulti ? ` — ${division.label}` : '';
    const title = `Live bracket — ${event.title}${divisionSuffix} · PickupVB`;
    const description = `Follow the ${event.title}${divisionSuffix} bracket live on PickupVB. Match results update in real time.`;
    const canonicalBase = `/events/${event.id}/bracket/watch`;
    const canonical =
      division && isMulti ? `${canonicalBase}?division=${division.id}` : canonicalBase;
    // Route the OG image through `og/route.ts` so per-division previews
    // unfurl correctly. Falls back to the file-convention card via the
    // same renderer when no division is present.
    const ogImageUrl =
      division && isMulti ? `${canonicalBase}/og?division=${division.id}` : `${canonicalBase}/og`;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        type: 'website',
        siteName: 'PickupVB',
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImageUrl],
      },
    };
  } catch {
    return { title: 'Live bracket — PickupVB' };
  }
}

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function BracketWatchPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  let event;
  try {
    event = await handlers.getEventBracketMeta.execute(new GetEventBracketMetaQuery(params.id));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (event.type !== 'tournament') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
          {'← Back to event'}
        </Link>
        <p className="text-muted text-sm">Brackets are only available for tournament events.</p>
      </div>
    );
  }

  if (event.divisions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
          {'← Back to event'}
        </Link>
        <p className="text-muted text-sm">This tournament has no divisions configured yet.</p>
      </div>
    );
  }

  const divParam = pickQuery(searchParams, 'division');
  const selectedDivision = event.divisions.find((d) => d.id === divParam) ?? event.divisions[0]!;
  const focusParam = pickQuery(searchParams, 'focus') ?? null;

  const [bracket, registeredTeams] = await Promise.all([
    repositories.bracketRepo.findByDivisionId(selectedDivision.id as never),
    repositories.bracketRepo.listRegisteredTeams(event.id as never, selectedDivision.id as never),
  ]);

  // Dual-keyed by both `entryId` and (when set) `teamId` — see page.tsx
  // for rationale. Ad-hoc / walk-in entries have no `teams.id`.
  const teamById = new Map<string, (typeof registeredTeams)[number]>();
  for (const t of registeredTeams) {
    teamById.set(t.entryId, t);
    if (t.teamId) teamById.set(t.teamId, t);
  }

  const divisionSummary = [
    selectedDivision.label,
    selectedDivision.tierLabel ?? selectedDivision.skillTier,
    selectedDivision.ageGroup,
  ]
    .filter((s) => !!s && s !== 'open')
    .join(' · ');

  // ADR 0023: spectators see in-progress scoreboard scores live, but only for
  // Pro-host events (matches the gate on the scorer's entry button).
  const liveScoringEnabled = !!event.hostUserId && (await isPro(event.hostUserId));

  return (
    <article className="mx-auto max-w-5xl space-y-6 p-4">
      <BreadcrumbJsonLd
        trail={[
          { name: 'Events', path: '/events' },
          { name: event.title, path: `/events/${event.id}` },
          { name: 'Live bracket', path: `/events/${event.id}/bracket/watch` },
        ]}
      />
      <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
        {'← Back to event'}
      </Link>

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-fg text-2xl font-bold">Live bracket — {event.title}</h1>
          {bracket?.status === 'active' && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
              ● LIVE
            </span>
          )}
          {bracket?.status === 'completed' && (
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
              Final
            </span>
          )}
        </div>
        {divisionSummary && <p className="text-fg/80 text-sm">{divisionSummary}</p>}
        <p className="text-muted text-sm">
          {registeredTeams.length} registered team
          {registeredTeams.length === 1 ? '' : 's'} • Updates automatically
        </p>
        <div className="pt-1">
          <ShareLink
            path={
              event.divisions.length > 1
                ? `/events/${event.id}/bracket/watch?division=${selectedDivision.id}`
                : `/events/${event.id}/bracket/watch`
            }
            title={`Live bracket — ${event.title}`}
            label="Share this view"
          />
        </div>
      </header>

      {event.divisions.length > 1 && (
        <nav aria-label="Divisions" className="border-border-base flex flex-wrap gap-1 border-b">
          {event.divisions.map((d) => {
            const active = d.id === selectedDivision.id;
            return (
              <Link
                key={d.id}
                href={`/events/${event.id}/bracket/watch?division=${d.id}`}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px rounded-t px-3 py-2 text-sm ${
                  active
                    ? 'border-border-base bg-bg text-fg border border-b-transparent font-medium'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {d.label}
              </Link>
            );
          })}
        </nav>
      )}

      <BracketRealtimeRefresher divisionId={selectedDivision.id} bracketId={bracket?.id ?? null} />

      {(!bracket || bracket.status === 'setup' || bracket.status === 'draft') && (
        <div className="border-border-base bg-bg rounded-shape-sm border p-6 text-center">
          <p className="text-fg/80 text-sm">
            {!bracket
              ? "The host hasn't created the bracket yet. Check back closer to game time."
              : bracket.status === 'draft'
                ? 'The host is finalizing the bracket. It will appear here once they publish it.'
                : 'Seeding is in progress. The bracket will appear here once the host generates it.'}
          </p>
        </div>
      )}

      {bracket && (bracket.status === 'active' || bracket.status === 'completed') && (
        <LiveScoresProvider enabled={liveScoringEnabled} divisionId={selectedDivision.id}>
          <LatestMatchTracker
            matchId={pickLatestMatchId(bracket.matches)}
            autoScroll
            initialFocusId={focusParam}
          />
          <BoardView
            eventId={event.id}
            divisionId={selectedDivision.id}
            matches={[...bracket.matches]}
            teamById={teamById}
            bestOf={bracket.config.bestOf}
            targetScore={bracket.config.targetScore}
            playoffBestOf={bracket.config.playoffBestOf}
            playoffTargetScore={bracket.config.playoffTargetScore}
            isHost={false}
            viewerId={null}
            status={bracket.status}
            format={bracket.format}
            highlightMatchId={focusParam ?? pickLatestMatchId(bracket.matches)}
          />
        </LiveScoresProvider>
      )}
    </article>
  );
}
