import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { GetEventBracketMetaQuery } from '@pickupvb/application';
import { DivisionId, EventId, NotFoundError } from '@pickupvb/domain';
import { Alert } from '@/components/alert';
import { primaryButtonClass } from '@/components/primary-button';
import { ShareLink } from '@/components/share-link';
import { handlers, repositories } from '@/lib/handlers';
import { assertEventVisibleOrNotFound } from '@/lib/event-visibility';
import { isPro } from '@/lib/pro';
import { BracketWorkspace } from './_components/bracket-workspace';
import { BracketStatusBadge } from './_components/bracket-status-badge';
import { DivisionTabs } from './_components/division-tabs';
import { NOTICE_LABEL } from './_components/labels';

// No `force-dynamic` and no `cookies()` read: every load resolves the same
// viewer-independent metadata (admin-client reads), so this page matches the
// `/bracket/watch` cacheable posture. The viewer-conditional host/captain
// controls are resolved client-side inside `<BracketWorkspace />` (performance
// audit P2 #14).

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

  // Gate scoped/unpublished events: getBracketMeta reads on the admin client
  // (RLS-bypassed), so re-assert visibility before exposing title/structure.
  await assertEventVisibleOrNotFound(params.id);

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
        <div className="border-border-base bg-bg rounded-shape-sm border p-6 text-center">
          <p className="text-fg/80 text-sm">Brackets are only available for tournament events.</p>
        </div>
      </div>
    );
  }

  if (event.divisions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
          {'← Back to event'}
        </Link>
        {/* Reachable in practice only by the host — give them a way forward
            instead of a dead-end. The edit page enforces its own auth, so a
            stray spectator just hits the gate (UX-12). */}
        <div className="border-border-base bg-bg rounded-shape-sm space-y-3 border p-6 text-center">
          <p className="text-fg/80 text-sm">
            This tournament has no divisions yet. Add at least one division to build its bracket.
          </p>
          <Link href={`/events/${event.id}/edit`} className={primaryButtonClass('sm')}>
            Set up divisions
          </Link>
        </div>
      </div>
    );
  }

  const divParam = pickQuery(searchParams, 'division');
  const selectedDivision = event.divisions.find((d) => d.id === divParam) ?? event.divisions[0]!;
  const focusParam = pickQuery(searchParams, 'focus') ?? null;

  const multiDivision = event.divisions.length > 1;
  const [bracket, registeredTeams, divisionStatuses] = await Promise.all([
    repositories.bracketRepo.findByDivisionId(DivisionId(selectedDivision.id)),
    repositories.bracketRepo.listRegisteredTeams(
      EventId(event.id),
      DivisionId(selectedDivision.id),
    ),
    // Per-division status pills for the tabs (UX-9) — only worth a query when
    // there's more than one division (a single-division event has no tabs).
    multiDivision
      ? repositories.bracketRepo.listDivisionStatuses(event.divisions.map((d) => DivisionId(d.id)))
      : Promise.resolve([]),
  ]);
  const statusByDivision = multiDivision
    ? new Map(divisionStatuses.map((s) => [s.divisionId, s.status]))
    : undefined;

  // ADR 0023: live scoreboard scoring is a Pro-host perk, enabled for every
  // match in the event when the event's host is Pro. Viewer-independent —
  // `isPro` is admin-client-backed, so this stays off the cookie path. The
  // button still only renders for the host/captains (MatchCard's `canEdit`); the
  // finalize action re-checks this gate server-side.
  const liveScoringEnabled = !!event.hostUserId && (await isPro(event.hostUserId));

  // Hand the workspace fully serializable bracket state — it owns the
  // viewer-conditional render so this page stays viewer-independent.
  const bracketVm = bracket
    ? {
        id: bracket.id,
        status: bracket.status,
        format: bracket.format,
        bestOf: bracket.config.bestOf,
        targetScore: bracket.config.targetScore,
        targetScores: bracket.config.targetScores,
        playoffBestOf: bracket.config.playoffBestOf,
        playoffTargetScore: bracket.config.playoffTargetScore,
        playoffTargetScores: bracket.config.playoffTargetScores,
        advancePerPool: bracket.config.advancePerPool,
        seeds: bracket.seeds.map((s) => ({ entryId: s.entryId, seed: s.seed, pool: s.pool })),
        matches: [...bracket.matches],
      }
    : null;

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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-fg text-headline-lg font-bold">Bracket — {event.title}</h1>
          <BracketStatusBadge status={bracket?.status} />
        </div>
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

      <DivisionTabs
        divisions={event.divisions}
        selectedId={selectedDivision.id}
        basePath={`/events/${event.id}/bracket`}
        {...(statusByDivision ? { statusByDivision } : {})}
      />

      {notice && (
        <Alert variant={notice.tone}>
          {notice.text}
          {noticeMsg && <span className="opacity-80"> — {noticeMsg}</span>}
        </Alert>
      )}

      <BracketWorkspace
        eventId={event.id}
        divisionId={selectedDivision.id}
        hostUserId={event.hostUserId}
        hostGroupId={event.hostGroupId}
        registeredTeams={registeredTeams}
        bracket={bracketVm}
        liveScoringEnabled={liveScoringEnabled}
        focusId={focusParam}
      />
    </article>
  );
}
