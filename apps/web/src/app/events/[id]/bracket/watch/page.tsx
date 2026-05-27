import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { ShareLink } from '@/components/share-link';
import { handlers, repositories } from '@/lib/handlers';
import { BoardView } from '../_components/board-view';
import { BracketRealtimeRefresher } from '../_components/realtime-refresher';

/**
 * Public spectator view of a tournament bracket. Read-only, no host or
 * captain affordances. Anyone with the link can watch the bracket update
 * live via the realtime refresher.
 *
 * Distinct from `/events/[id]/bracket` (the host/captain workspace) so the
 * spectator UI stays uncluttered and the page doesn't need to opt out of
 * caching for auth-dependent reasons. RLS on `tournament_brackets`,
 * `bracket_matches`, and `bracket_match_sets` is already `for select using
 * (true)`, so anon viewers see the same data.
 */

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
    event = await handlers.getEventDetail.execute(new GetEventDetailQuery(params.id, null));
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

  const [bracket, registeredTeams] = await Promise.all([
    repositories.bracketRepo.findByDivisionId(selectedDivision.id as never),
    repositories.bracketRepo.listRegisteredTeams(event.id as never, selectedDivision.id as never),
  ]);

  const teamById = new Map(registeredTeams.map((t) => [t.teamId, t]));

  const divisionSummary = [
    selectedDivision.label,
    selectedDivision.tierLabel ?? selectedDivision.skillTier,
    selectedDivision.ageGroup,
  ]
    .filter((s) => !!s && s !== 'open')
    .join(' · ');

  return (
    <article className="mx-auto max-w-5xl space-y-6 p-4">
      <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
        {'← Back to event'}
      </Link>

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-fg text-2xl font-bold">Live bracket — {event.title}</h1>
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
            ● LIVE
          </span>
        </div>
        {divisionSummary && <p className="text-fg/80 text-sm">{divisionSummary}</p>}
        <p className="text-muted text-sm">
          {registeredTeams.length} registered team
          {registeredTeams.length === 1 ? '' : 's'} • Updates automatically
        </p>
        <div className="pt-1">
          <ShareLink
            path={`/events/${event.id}/bracket/watch`}
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

      {(!bracket || bracket.status === 'setup') && (
        <div className="border-border-base bg-bg rounded-lg border p-6 text-center">
          <p className="text-fg/80 text-sm">
            {bracket
              ? 'Seeding is in progress. The bracket will appear here once the host generates it.'
              : "The host hasn't created the bracket yet. Check back closer to game time."}
          </p>
        </div>
      )}

      {bracket && (bracket.status === 'active' || bracket.status === 'completed') && (
        <BoardView
          eventId={event.id}
          divisionId={selectedDivision.id}
          matches={[...bracket.matches]}
          teamById={teamById}
          bestOf={bracket.config.bestOf}
          isHost={false}
          viewerId={null}
          status={bracket.status}
          format={bracket.format}
        />
      )}
    </article>
  );
}
