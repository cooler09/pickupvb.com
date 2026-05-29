import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { ShareLink } from '@/components/share-link';
import { handlers, repositories } from '@/lib/handlers';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { BoardView, pickLatestMatchId } from './_components/board-view';
import { LatestMatchTracker } from './_components/latest-match-tracker';
import { NoBracketView } from './_components/no-bracket-view';
import { SetupView } from './_components/setup-view';
import { BracketRealtimeRefresher } from './_components/realtime-refresher';
import { NOTICE_LABEL } from './_components/labels';

export const dynamic = 'force-dynamic';

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function BracketPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const viewer = await getViewer();
  const user = viewer?.user ?? null;
  const isRealUser = !!user && !isAnonymousUser(user);

  let event;
  try {
    event = await handlers.getEventDetail.execute(
      new GetEventDetailQuery(params.id, user?.id ?? null),
    );
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

  // Dual-keyed: rows are indexed under both `teamId` (FK → teams.id, used by
  // pre-cutover bracket data) and `entryId` (FK → event_team_entries.id,
  // used by post-cutover writes). Match-card and standings lookups stringify
  // the id and hit whichever variant the underlying row carries.
  const teamById = new Map<string, (typeof registeredTeams)[number]>();
  for (const t of registeredTeams) {
    teamById.set(t.entryId, t);
    teamById.set(t.teamId, t);
  }
  const isHost = !!event.canManage && isRealUser;
  const viewerId = user?.id ?? null;
  const noticeCode = pickQuery(searchParams, 'notice');
  const noticeMsg = pickQuery(searchParams, 'msg');
  const notice = noticeCode ? (NOTICE_LABEL[noticeCode] ?? null) : null;

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
        <h1 className="text-fg text-2xl font-bold">Bracket — {event.title}</h1>
        {divisionSummary && <p className="text-fg/80 text-sm">{divisionSummary}</p>}
        <p className="text-muted text-sm">
          {registeredTeams.length} registered team
          {registeredTeams.length === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href={
              (event.divisions.length > 1
                ? `/events/${event.id}/bracket/watch?division=${selectedDivision.id}`
                : `/events/${event.id}/bracket/watch`) as Route
            }
            className="text-primary text-xs hover:underline"
          >
            {'Open public spectator view →'}
          </Link>
          <ShareLink
            path={
              event.divisions.length > 1
                ? `/events/${event.id}/bracket/watch?division=${selectedDivision.id}`
                : `/events/${event.id}/bracket/watch`
            }
            title={`Live bracket — ${event.title}`}
            label="Share spectator link"
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
                href={`/events/${event.id}/bracket?division=${d.id}`}
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

      {notice && (
        <div
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={`rounded border px-3 py-2 text-sm ${
            notice.tone === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
              : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
          }`}
        >
          {notice.text}
          {noticeMsg && <span className="ml-1 opacity-80">— {noticeMsg}</span>}
        </div>
      )}

      {!bracket && (
        <NoBracketView
          eventId={event.id}
          divisionId={selectedDivision.id}
          teamCount={registeredTeams.length}
          isHost={isHost}
        />
      )}

      <BracketRealtimeRefresher divisionId={selectedDivision.id} bracketId={bracket?.id ?? null} />

      {bracket && bracket.status === 'setup' && (
        <SetupView
          eventId={event.id}
          divisionId={selectedDivision.id}
          bracketFormat={bracket.format}
          seeds={bracket.seeds.map((s) => ({
            teamId: s.teamId,
            seed: s.seed,
          }))}
          registeredTeams={registeredTeams}
          isHost={isHost}
        />
      )}

      {bracket && (bracket.status === 'active' || bracket.status === 'completed') && (
        <>
          <LatestMatchTracker
            matchId={pickLatestMatchId(bracket.matches)}
            autoScroll={false}
            initialFocusId={focusParam}
          />
          <BoardView
            eventId={event.id}
            divisionId={selectedDivision.id}
            matches={[...bracket.matches]}
            teamById={teamById}
            bestOf={bracket.config.bestOf}
            isHost={isHost}
            viewerId={viewerId}
            status={bracket.status}
            format={bracket.format}
            highlightMatchId={focusParam ?? pickLatestMatchId(bracket.matches)}
          />
        </>
      )}
    </article>
  );
}
