import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { GetEventBracketMetaQuery } from '@pickupvb/application';
import { NotFoundError, type DivisionId, type EventId } from '@pickupvb/domain';
import { handlers, repositories } from '@/lib/handlers';
import { isPro } from '@/lib/pro';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { ScheduleWorkspace } from './_components/schedule-workspace';
import { type ScheduleMatchVm } from './_components/match-row';
import { NOTICE_LABEL } from './_components/labels';

// No `force-dynamic` and no `cookies()` read: viewer-independent metadata
// (admin-client reads) keeps this page cacheable. The host-only add/edit/record
// controls are resolved client-side inside `<ScheduleWorkspace />` (performance
// audit P2 #14).

/**
 * Public spectator surface (parallels `bracket/watch`): a titled, canonical,
 * shareable league schedule for anon viewers and crawlers (SEO audit P3 #7).
 * Reuses the same viewer-independent bracket-meta read as the page body so it
 * stays cacheable. `visibility` isn't on this read model; like `bracket/watch`,
 * anon reachability is governed by RLS + sitemap omission, and the `status`
 * guard keeps cancelled/draft schedules out of the index (mirrors the event
 * detail page's guard).
 */
export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  try {
    const event = await handlers.getEventBracketMeta.execute(new GetEventBracketMetaQuery(id));
    const title = `Schedule — ${event.title} · PickupVB`;
    const description = `Match schedule and live scores for ${event.title} on PickupVB.`;
    const canonical = `/events/${id}/schedule`;
    const indexable = event.status !== 'draft' && event.status !== 'cancelled';
    return {
      title,
      description,
      alternates: { canonical },
      ...(indexable ? {} : { robots: { index: false, follow: true } }),
      openGraph: {
        title,
        description,
        url: canonical,
        type: 'website',
        siteName: 'PickupVB',
      },
    };
  } catch {
    return { title: 'Schedule — PickupVB' };
  }
}

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function SchedulePage(props: {
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

  if (event.type !== 'league') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
          {'← Back to event'}
        </Link>
        <p className="text-muted text-sm">Schedules are only available for league events.</p>
      </div>
    );
  }

  if (event.divisions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
          {'← Back to event'}
        </Link>
        <p className="text-muted text-sm">This league has no divisions configured yet.</p>
      </div>
    );
  }

  const divParam = pickQuery(searchParams, 'division');
  const selectedDivision = event.divisions.find((d) => d.id === divParam) ?? event.divisions[0]!;

  const [schedule, allEntries] = await Promise.all([
    repositories.leagueScheduleRepo.findByDivisionId(selectedDivision.id as DivisionId),
    repositories.bracketRepo.listRegisteredTeams(
      event.id as EventId,
      selectedDivision.id as DivisionId,
    ),
  ]);
  // ADR 0034: league matches key on `event_team_entries.id` (home_entry_id /
  // away_entry_id), so every live entry is schedulable — both rostered teams
  // and host-added (team-less `walk_in`) teams. The entry id is the competitor
  // identity.
  const teams = allEntries.map((t) => ({ entryId: t.entryId, name: t.name }));

  const returnPath = `/events/${event.id}/schedule?division=${selectedDivision.id}`;
  // ADR 0023: live scoreboard scoring is a Pro-host perk (re-checked server-side
  // by the finalize action). Enabled for every match in the event when the host
  // is Pro. Viewer-independent — `isPro` is admin-client-backed.
  const liveScoringEnabled = !!event.hostUserId && (await isPro(event.hostUserId));

  const matches: ScheduleMatchVm[] = (schedule?.matches ?? []).map((m) => ({
    id: String(m.id),
    weekNumber: m.weekNumber,
    scheduledAt: m.scheduledAt.toISOString(),
    courtLabel: m.courtLabel,
    homeEntryId: m.homeEntryId ? String(m.homeEntryId) : null,
    awayEntryId: m.awayEntryId ? String(m.awayEntryId) : null,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    notes: m.notes,
  }));

  const noticeCode = pickQuery(searchParams, 'notice');
  const noticeMsg = pickQuery(searchParams, 'msg');
  const notice = noticeCode ? (NOTICE_LABEL[noticeCode] ?? null) : null;

  return (
    <article className="mx-auto max-w-4xl space-y-6 p-4">
      <BreadcrumbJsonLd
        trail={[
          { name: 'Events', path: '/events' },
          { name: event.title, path: `/events/${event.id}` },
          { name: 'Schedule', path: `/events/${event.id}/schedule` },
        ]}
      />
      <Link href={`/events/${event.id}`} className="text-primary text-sm hover:underline">
        {'← Back to event'}
      </Link>

      <header className="space-y-1">
        <h1 className="text-fg text-2xl font-bold">Schedule — {event.title}</h1>
        <p className="text-muted text-sm">
          {teams.length} registered team{teams.length === 1 ? '' : 's'} · {matches.length} match
          {matches.length === 1 ? '' : 'es'} on the slate
        </p>
      </header>

      {event.divisions.length > 1 && (
        <nav aria-label="Divisions" className="border-border-base flex flex-wrap gap-1 border-b">
          {event.divisions.map((d) => {
            const active = d.id === selectedDivision.id;
            return (
              <Link
                key={d.id}
                href={`/events/${event.id}/schedule?division=${d.id}` as Route}
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

      <ScheduleWorkspace
        eventId={event.id}
        divisionId={selectedDivision.id}
        hostUserId={event.hostUserId}
        hostGroupId={event.hostGroupId}
        returnPath={returnPath}
        timeZone={event.timeZone}
        teams={teams}
        matches={matches}
        liveScoringEnabled={liveScoringEnabled}
      />
    </article>
  );
}
