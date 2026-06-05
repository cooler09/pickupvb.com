import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { GetEventBracketMetaQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { ShareLink } from '@/components/share-link';
import { handlers, repositories } from '@/lib/handlers';
import { isPro } from '@/lib/pro';
import { BracketWorkspace } from './_components/bracket-workspace';
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
