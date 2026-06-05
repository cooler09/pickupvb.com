import Link from 'next/link';
import type { Route } from 'next';
import type { EventDetailReadModel } from '@pickupvb/domain';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';
import { HostDivisionsManager } from '../../_components/host-divisions-manager';
import { HostBroadcastPanel } from '../../_components/host-broadcast-panel';
import {
  HostAdHocTeamsPanel,
  type HostAdHocTeamRow,
} from '../../_components/host-ad-hoc-teams-panel';
import { HostDivisionWinnersPanel } from '../../_components/host-division-winners-panel';
import { LeagueTeamsPanel } from '../../_components/league-teams-panel';
import { HostsSection } from '../../_components/hosts-section';
import { CancelEventPanel } from '../../edit/cancel-event-panel';
import { EventToolsCard, type EventToolSlug } from '@/app/tools/_components/event-tools-card';
import type {
  EligibleTeamOption,
  LeagueTeamView,
  AttendeePaymentInfo,
} from '../../_loaders/load-event-detail';
import type { SocialHandles } from '@/lib/social-handles';

/**
 * Host-only management dashboard for an event — the single home for every
 * host affordance that used to be scattered across the public event page
 * (the "Host tools" disclosure junk-drawer, the hero "Edit" link, the
 * "+ Add co-host" form, the CSV export, the cancel panel on `/edit`).
 *
 * Organized by the event's lifecycle so a host always knows what to do
 * *now* vs. later: **Setup** → **Run the event** → **Wrap up** → **Danger
 * zone**. Each panel is the same component rendered on the old page; this
 * file only re-homes and groups them. All mutations are passed a
 * `returnPath` of `/events/[id]/manage` so their `revalidatePath` refreshes
 * this surface (their `updateTag(eventCacheTag)` already busts the public
 * page's cached side-loads).
 */
export function ManageDashboard({
  event,
  returnPath,
  adHocHostRows,
  eligibleTeamsByDivision,
  leagueTeamsByDivision,
  viewerIsPro,
  payments,
  primaryHostUserSocial,
}: {
  event: EventDetailReadModel;
  returnPath: string;
  adHocHostRows: ReadonlyArray<HostAdHocTeamRow>;
  eligibleTeamsByDivision: ReadonlyMap<string, EligibleTeamOption[]>;
  leagueTeamsByDivision: ReadonlyMap<string, LeagueTeamView[]>;
  viewerIsPro: boolean;
  payments: Map<string, AttendeePaymentInfo> | undefined;
  primaryHostUserSocial: SocialHandles | null;
}) {
  const isTournament = event.type === 'tournament';
  const isLeague = event.type === 'league';
  const isOpenPlay = event.type === 'open_play';
  const hasDivisions = event.divisions.length > 0;
  const activeAttendeeCount = event.attendees.filter((a) => !a.waitlist).length;
  const paidAttendeeCount = payments
    ? [...payments.values()].filter((p) => p.status === 'paid').length
    : 0;

  // Host can add account-less teams + mark them paid off-platform on any
  // team-registration division — ad-hoc (tournaments) or roster (leagues),
  // ADR 0033. (Leagues are roster-only; tournaments may have either.)
  const hasHostManagedTeams =
    (isTournament || isLeague) &&
    event.divisions.some(
      (d) => d.teamRegistrationMode === 'ad_hoc' || d.teamRegistrationMode === 'roster',
    );

  // Only render a phase group when it has at least one visible affordance,
  // so a host of (say) a small open-play event never sees an empty heading.
  const runHasContent = isTournament || isLeague || activeAttendeeCount > 0;
  const wrapHasContent = (isTournament && hasDivisions) || (isLeague && hasDivisions) || isOpenPlay;

  // Which standalone host tools to surface in-context (tournament-tools-workflow
  // audit TT-1). Division-scoped tools (seeding/scheduler/standings) launch bound
  // to the event's first division; the host can switch divisions from the bracket
  // page's tools row.
  const toolSlugs: ReadonlyArray<EventToolSlug> = isTournament
    ? ['team-randomizer', 'seeding', 'scheduler', 'standings']
    : isLeague
      ? ['standings']
      : ['team-randomizer', 'standings'];
  const firstDivisionId = event.divisions[0]?.id;

  return (
    <div className="space-y-8">
      {/* ───────────────────────── Setup ───────────────────────── */}
      <ManageGroup label="Setup" description="Configure the event before sign-ups roll in.">
        <ManageLinkCard
          title="Event details"
          description="Title, date, location, pricing, description, hero image, and sponsor."
          href={`/events/${event.id}/edit` as Route}
          label="Edit details"
          variant="secondary"
        />
        <HostDivisionsManager
          eventId={event.id}
          returnPath={returnPath}
          divisions={event.divisions}
        />
        <HostsSection
          eventId={event.id}
          primaryHostUser={event.primaryHostUser}
          primaryHostGroup={event.primaryHostGroup}
          coHostUsers={event.coHostUsers}
          coHostGroups={event.coHostGroups}
          canManage={event.canManage}
          viewerHostableGroups={event.viewerHostableGroups}
          returnPath={returnPath}
          {...(primaryHostUserSocial ? { primaryHostUserSocial } : {})}
        />
      </ManageGroup>

      {/* ─────────────────────── Run the event ─────────────────── */}
      {runHasContent && (
        <ManageGroup
          label="Run the event"
          description="Day-of operations: keep players informed and registrations moving."
        >
          <HostBroadcastPanel eventId={event.id} attendeeCount={activeAttendeeCount} />
          {hasHostManagedTeams && (
            <HostAdHocTeamsPanel
              eventId={event.id}
              returnPath={returnPath}
              divisions={event.divisions.map((d) => ({
                id: d.id,
                label: d.label,
                acceptsHostTeams:
                  d.teamRegistrationMode === 'ad_hoc' || d.teamRegistrationMode === 'roster',
              }))}
              rows={adHocHostRows}
            />
          )}
          {isTournament && (
            <ManageLinkCard
              title="Bracket"
              description="Seed the bracket, build matchups, and report match results."
              href={`/events/${event.id}/bracket` as Route}
              label="Open bracket"
            />
          )}
          {isLeague && (
            <ManageLinkCard
              title="Schedule"
              description="Build the weekly slate and record match results as they finish."
              href={`/events/${event.id}/schedule` as Route}
              label="Open schedule"
            />
          )}
          <EventToolsCard
            eventId={event.id}
            ret={returnPath}
            tools={toolSlugs}
            {...(firstDivisionId ? { divisionId: firstDivisionId } : {})}
          />
        </ManageGroup>
      )}

      {/* ───────────────────────── Wrap up ─────────────────────── */}
      {wrapHasContent && (
        <ManageGroup label="Wrap up" description="Finish the event and hand off the records.">
          {isTournament && hasDivisions && (
            <HostDivisionWinnersPanel
              eventId={event.id}
              returnPath={returnPath}
              divisions={event.divisions}
              eligibleTeamsByDivision={eligibleTeamsByDivision}
            />
          )}
          {isLeague && hasDivisions && (
            <LeagueTeamsPanel
              eventId={event.id}
              returnPath={returnPath}
              divisions={event.divisions}
              teamsByDivision={leagueTeamsByDivision}
            />
          )}
          {isOpenPlay && (
            <div className="border-border-base bg-fg/[0.02] rounded-shape-sm border p-4">
              <h3 className="text-fg text-sm font-semibold">Export roster</h3>
              {viewerIsPro ? (
                <p className="text-muted mt-1 text-xs">
                  Download the full signed-up roster as a spreadsheet.{' '}
                  <a
                    href={`/api/events/${event.id}/attendees.csv`}
                    className="text-primary hover:underline"
                  >
                    Export attendees as CSV
                  </a>
                </p>
              ) : (
                <p className="text-muted mt-1 text-xs">
                  CSV attendee export is a{' '}
                  <Link
                    href={'/profile/billing/pro' as Route}
                    className="text-primary hover:underline"
                  >
                    Pro
                  </Link>{' '}
                  feature.
                </p>
              )}
            </div>
          )}
        </ManageGroup>
      )}

      {/* ─────────────────────── Danger zone ───────────────────── */}
      {event.status !== 'cancelled' && (
        <ManageGroup
          label="Danger zone"
          description="Irreversible actions. Attendees are notified automatically."
        >
          <CancelEventPanel
            eventId={event.id}
            attendeeCount={activeAttendeeCount}
            paidAttendeeCount={paidAttendeeCount}
          />
        </ManageGroup>
      )}
    </div>
  );
}

/** A labelled lifecycle group: phase heading + one-line scent + its panels. */
function ManageGroup({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="border-border-base border-b pb-2">
        <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">{label}</h2>
        <p className="text-muted mt-0.5 text-xs">{description}</p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** A simple "title + description + go-to button" card for tools that live on
 *  their own sub-page (Edit, Bracket, Schedule). */
function ManageLinkCard({
  title,
  description,
  href,
  label,
  variant = 'primary',
}: {
  title: string;
  description: string;
  href: Route;
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <div className="border-border-base bg-fg/[0.02] rounded-shape-sm flex flex-wrap items-center justify-between gap-2 border p-4">
      <div className="min-w-0">
        <h3 className="text-fg text-sm font-semibold">{title}</h3>
        <p className="text-muted text-xs">{description}</p>
      </div>
      <Link
        href={href}
        className={variant === 'secondary' ? secondaryButtonClass() : primaryButtonClass()}
      >
        {label}
      </Link>
    </div>
  );
}
