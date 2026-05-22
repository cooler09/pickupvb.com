import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next/types';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';
import { formatEventDateLong } from '@/lib/date-formats';
import { LocalDateTime } from '@/components/local-datetime';
import { AttendeeList } from '@/components/attendee-list';
import { Alert } from '@/components/alert';
import { EventJsonLd } from './_components/event-jsonld';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { EventHero } from './_components/event-hero';
import { EventClosedState } from './_components/event-closed-state';
import { EventStickyCta } from './_components/event-sticky-cta';
import { HostsSection } from './_components/hosts-section';
import { PaidTicketPanel } from './_components/paid-ticket-panel';
import { PositionRsvpPanel } from './_components/position-rsvp-panel';
import { RsvpPanel } from './_components/rsvp-panel';
import { TournamentSignupPanel } from './_components/tournament-signup-panel';
import { AdHocTeamSignupPanel } from './_components/ad-hoc-team-signup-panel';
import { FreeAgentSignupPanel } from './_components/free-agent-signup-panel';
import { TournamentRegisterPanel } from './_components/tournament-register-panel';
import { TeamsRegisteredSection } from './_components/teams-registered-section';
import EventMap from './_components/event-map-lazy';
import { TipJar } from './_components/tip-jar';
import { HostBroadcastPanel } from './_components/host-broadcast-panel';
import { DivisionsSection } from './_components/divisions-section';
import { ExternalRegistrationCard } from './_components/external-registration-card';
import { EventMetaSection } from './_components/event-meta-section';
import { HostDivisionsManager } from './_components/host-divisions-manager';
import { HostAdHocTeamsPanel } from './_components/host-ad-hoc-teams-panel';
import { HostDivisionWinnersPanel } from './_components/host-division-winners-panel';
import { SignupSection } from './_components/signup-section';
import { loadEventDetail } from './_loaders/load-event-detail';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  let event;
  try {
    event = await handlers.getEventDetail.execute(new GetEventDetailQuery(id, null));
  } catch {
    return { title: 'Event — PickupVB' };
  }
  // Don't expose non-public events to crawlers.
  const isPublic = event.visibility === 'public';
  const dateLabel = formatEventDateLong(event.startsAt, event.timeZone);
  const placeLabel = `${event.location.city}, ${event.location.region}`;
  const summary = event.description
    ? event.description.slice(0, 200)
    : `${event.title} — ${dateLabel} · ${placeLabel}. Sign up on PickupVB.`;
  const title = `${event.title} — ${dateLabel} · ${placeLabel}`;
  const canonical = `/events/${event.id}`;
  return {
    title,
    description: summary,
    alternates: { canonical },
    ...(isPublic ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      title,
      description: summary,
      url: canonical,
      type: 'website',
      siteName: 'PickupVB',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: summary,
    },
  };
}

function pickQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function EventDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  // Resolve the viewer first so the detail query can return viewer-specific
  // bits (RSVP state, manage permission, friend ids, hostable groups).
  const viewer = await getViewer();
  const vm = await loadEventDetail(params.id, viewer);
  const {
    event,
    user,
    isRealUser,
    isHostOfEvent,
    friendIds,
    returnPath,
    hasStarted,
    closingSoon,
    isExternal,
    signupsOpen,
    pricing,
    paid,
    breakdown,
    priceLabel,
    viewerIsPro,
    tipTotalCents,
    primaryHostUserSocial,
    eligibleTeamsByDivision,
    payments,
    viewerPaymentStatus,
    adHocViewerRegistrations,
    adHocAllRegistrations,
    adHocHostRows,
    attendeesForList,
    filledByPosition,
    viewerPosition,
    cta,
  } = vm;

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      {event.visibility === 'public' && (
        <>
          <EventJsonLd
            id={event.id}
            title={event.title}
            description={event.description}
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            visibility={event.visibility}
            status={event.status}
            spotsRemaining={event.spotsRemaining}
            attendeeCount={event.attendeeCount}
            location={event.location}
            organizerName={
              event.primaryHostGroup?.name ?? event.primaryHostUser?.displayName ?? null
            }
            ticketCents={breakdown?.ticketCents ?? null}
          />
          <BreadcrumbJsonLd
            items={[
              { name: 'Home', url: 'https://pickupvb.com/' },
              { name: 'Events', url: 'https://pickupvb.com/events' },
              { name: event.title, url: `https://pickupvb.com/events/${event.id}` },
            ]}
          />
        </>
      )}
      <Link href="/events" className="text-primary text-sm hover:underline">
        ← Back to events
      </Link>

      {pickQuery(searchParams, 'created') === '1' && (
        <Alert variant="success" title="Event created!">
          Share the link above or invite co-hosts so players can find your event.
        </Alert>
      )}

      {pickQuery(searchParams, 'tip') === 'thanks' && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Thanks for tipping the host!
        </div>
      )}
      {pickQuery(searchParams, 'tip') === 'cancel' && (
        <div className="border-border-base bg-surface rounded-lg border p-3 text-sm">
          Tip cancelled.
        </div>
      )}
      {pickQuery(searchParams, 'tip') === 'error' && (
        <div className="border-secondary bg-secondary/10 rounded-lg border p-3 text-sm">
          {pickQuery(searchParams, 'tip_msg') ?? 'Could not process tip.'}
        </div>
      )}

      <header className="space-y-2">
        <EventHero
          eventId={event.id}
          shortCode={event.shortCode}
          title={event.title}
          type={event.type}
          surface={event.surface}
          skillLevel={event.skillLevel}
          {...(event.divisions[0]?.skillTier ? { skillTier: event.divisions[0].skillTier } : {})}
          {...(event.divisions[0]?.tierLabel ? { tierLabel: event.divisions[0].tierLabel } : {})}
          format={event.format}
          gender={event.gender}
          status={event.status}
          startsAt={event.startsAt}
          timeZone={event.timeZone}
          city={event.location.city}
          region={event.location.region}
          spotsRemaining={event.spotsRemaining}
          priceLabel={priceLabel}
          registrationClosesAt={event.registrationClosesAt}
          canManage={event.canManage}
          cta={cta}
          divisionCount={event.divisions.length}
          closingSoon={closingSoon}
        />
      </header>

      <section className="border-border-base overflow-hidden rounded-lg border sm:grid sm:grid-cols-2">
        <div className="sm:border-border-base p-4 sm:border-r">
          <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">When</h2>
          <p className="text-fg mt-1 font-medium">
            <LocalDateTime iso={event.startsAt} variant="eventDateLong" timeZone={event.timeZone} />
          </p>
          <p className="text-muted text-sm">
            to{' '}
            <LocalDateTime iso={event.endsAt} variant="eventDateLong" timeZone={event.timeZone} />
          </p>
        </div>
        <div className="border-border-base border-t p-4 sm:border-t-0 sm:border-l-0">
          <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">Spots</h2>
          {event.spotsRemaining === null ? (
            <p className="text-fg mt-1 font-medium">Unlimited</p>
          ) : (
            <p className="text-fg mt-1 font-medium">
              {event.spotsRemaining} open ·{' '}
              <span className="text-muted">{event.attendeeCount} signed up</span>
            </p>
          )}
        </div>
      </section>

      <EventMetaSection
        venueName={event.venueName}
        seriesName={event.seriesName}
        seriesPosition={event.seriesPosition}
        seriesSize={event.seriesSize}
        isFundraiser={event.isFundraiser}
        fundraiserBeneficiary={event.fundraiserBeneficiary}
        themeTags={event.themeTags}
        sanctioningBody={event.sanctioningBody}
        registrationClosesAt={event.registrationClosesAt}
        paymentInstructions={event.paymentInstructions}
        isExternal={isExternal}
        timeZone={event.timeZone}
      />

      <DivisionsSection divisions={event.divisions} />

      {isExternal ? (
        <SignupSection
          title="Register"
          badge={{ tone: 'external', label: 'Off-platform' }}
          subline="Sign-ups are handled on the host's site."
        >
          <ExternalRegistrationCard
            externalRegistrationUrl={event.externalRegistrationUrl}
            externalRegistrationInstructions={event.externalRegistrationInstructions}
            paymentInstructions={event.paymentInstructions}
          />
        </SignupSection>
      ) : signupsOpen && event.type === 'open_play' ? (
        <SignupSection
          title="Sign up"
          badge={
            paid && breakdown
              ? { tone: 'paid', label: priceLabel }
              : { tone: 'free', label: 'Free' }
          }
          subline={
            event.positionRoster
              ? 'Pick a position below.'
              : event.spotsRemaining === null
                ? 'Unlimited spots.'
                : event.spotsRemaining === 0
                  ? 'Full — join the waitlist below.'
                  : `${event.spotsRemaining} ${event.spotsRemaining === 1 ? 'spot' : 'spots'} left.`
          }
        >
          {paid && breakdown ? (
            <PaidTicketPanel
              eventId={event.id}
              eventTitle={event.title}
              isAttending={event.isAttending}
              isRealUser={isRealUser}
              ticketCents={breakdown.ticketCents}
              platformFeeCents={breakdown.platformFeeCents}
              refundWindowHours={pricing!.refundWindowHours}
              paymentsOffPlatform={event.paymentsOffPlatform}
              {...(viewerPaymentStatus ? { viewerPaymentStatus } : {})}
            />
          ) : event.positionRoster ? (
            <PositionRsvpPanel
              eventId={event.id}
              eventTitle={event.title}
              isAttending={event.isAttending}
              isRealUser={isRealUser}
              positionRoster={event.positionRoster}
              filledByPosition={filledByPosition}
              viewerPosition={viewerPosition}
              rsvp={pickQuery(searchParams, 'rsvp')}
              rsvpMsg={pickQuery(searchParams, 'rsvp_msg')}
            />
          ) : (
            <RsvpPanel
              eventId={event.id}
              eventTitle={event.title}
              isAttending={event.isAttending}
              isRealUser={isRealUser}
              rsvp={pickQuery(searchParams, 'rsvp')}
              rsvpMsg={pickQuery(searchParams, 'rsvp_msg')}
            />
          )}
        </SignupSection>
      ) : signupsOpen && event.type === 'tournament' ? (
        <SignupSection
          title="Register"
          badge={{ tone: 'neutral', label: 'Tournament' }}
          subline={`${event.teams.length} ${event.teams.length === 1 ? 'team' : 'teams'} · ${event.freeAgents.length} free ${event.freeAgents.length === 1 ? 'agent' : 'agents'}`}
        >
          <TournamentRegisterPanel
            teamCount={event.teams.length}
            freeAgentCount={event.freeAgents.length}
            teamEnabled={event.teamRegistrationMode !== null}
            defaultMode={event.isFreeAgent ? 'free-agent' : 'team'}
            teamPanel={
              event.teamRegistrationMode === 'ad_hoc' ? (
                <AdHocTeamSignupPanel
                  eventId={event.id}
                  returnPath={returnPath}
                  divisions={event.divisions.map((d) => ({
                    id: d.id,
                    label: d.label,
                    priceCents: d.priceCents,
                    priceUnit: d.priceUnit,
                    teamSize: d.teamSize,
                  }))}
                  viewerId={user?.id ?? null}
                  isRealUser={isRealUser}
                  viewerRegistrations={adHocViewerRegistrations}
                  allRegistrations={adHocAllRegistrations}
                  {...(pickQuery(searchParams, 'rsvp')
                    ? { resultCode: pickQuery(searchParams, 'rsvp') }
                    : {})}
                  {...(pickQuery(searchParams, 'rsvp_msg')
                    ? { resultMsg: pickQuery(searchParams, 'rsvp_msg') }
                    : {})}
                />
              ) : (
                <TournamentSignupPanel
                  eventId={event.id}
                  eventFormat={event.format}
                  teams={event.teams}
                  viewerCaptainedTeams={event.viewerCaptainedTeams}
                  divisions={event.divisions.map((d) => ({
                    id: d.id,
                    label: d.label,
                    format: d.format,
                    priceCents: d.priceCents,
                    priceUnit: d.priceUnit,
                  }))}
                  viewerId={user?.id ?? null}
                  isRealUser={isRealUser}
                  returnPath={returnPath}
                  paymentsOffPlatform={event.paymentsOffPlatform}
                  {...(pickQuery(searchParams, 'team') || pickQuery(searchParams, 'rsvp')
                    ? {
                        resultCode:
                          pickQuery(searchParams, 'team') ?? pickQuery(searchParams, 'rsvp'),
                      }
                    : {})}
                />
              )
            }
            freeAgentPanel={
              <FreeAgentSignupPanel
                eventId={event.id}
                freeAgents={event.freeAgents.map((f) => ({
                  userId: f.userId,
                  notes: f.notes,
                  divisionId: f.divisionId,
                  profile: {
                    displayName: f.profile.displayName,
                    avatarUrl: f.profile.avatarUrl,
                  },
                }))}
                divisions={event.divisions.map((d) => ({ id: d.id, label: d.label }))}
                isFreeAgent={event.isFreeAgent}
                viewerId={user?.id ?? null}
                isRealUser={isRealUser}
                returnPath={returnPath}
                {...(pickQuery(searchParams, 'fa')
                  ? { resultCode: pickQuery(searchParams, 'fa') }
                  : {})}
              />
            }
          />
        </SignupSection>
      ) : (
        <EventClosedState
          eventId={event.id}
          eventType={event.type}
          status={event.status}
          hasStarted={hasStarted}
          attendeeCount={event.attendeeCount}
          isHost={event.canManage}
        />
      )}

      {event.description && (
        <section>
          <h2 className="text-fg mb-2 text-lg font-semibold">Description</h2>
          <p className="text-fg/90 whitespace-pre-wrap">{event.description}</p>
        </section>
      )}

      {event.rules && (
        <section>
          <h2 className="text-fg mb-2 text-lg font-semibold">Rules</h2>
          <p className="text-fg/90 whitespace-pre-wrap">{event.rules}</p>
        </section>
      )}

      {event.type === 'tournament' && (
        <section className="border-border-base bg-fg/5 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-fg text-base font-semibold">Bracket</h2>
              <p className="text-muted text-xs">
                Set up the tournament bracket and report match results.
              </p>
            </div>
            <Link
              href={`/events/${event.id}/bracket` as Route}
              className="bg-primary text-primary-fg rounded px-3 py-1 text-sm"
            >
              Open bracket
            </Link>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-fg text-lg font-semibold">Where</h2>
        {event.venueName && <p className="text-fg font-medium">{event.venueName}</p>}
        <p className="text-fg/90">{event.location.addressLine}</p>
        <p className="text-muted text-sm">
          {event.location.city}, {event.location.region} {event.location.postalCode}
        </p>
        <EventMap
          latitude={event.location.latitude}
          longitude={event.location.longitude}
          title={event.title}
          addressLine={event.location.addressLine}
        />
        <a
          href={`https://www.openstreetmap.org/?mlat=${event.location.latitude}&mlon=${event.location.longitude}#map=16/${event.location.latitude}/${event.location.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-sm hover:underline"
        >
          Open in map <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in new tab)</span>
        </a>
      </section>

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

      {event.canManage && (
        <details className="border-border-base group rounded-lg border p-3 open:p-4">
          <summary className="text-fg cursor-pointer text-sm font-semibold select-none">
            Host tools
          </summary>
          <div className="mt-4 space-y-6">
            <HostDivisionsManager
              eventId={event.id}
              returnPath={returnPath}
              divisions={event.divisions}
            />
            <HostBroadcastPanel
              eventId={event.id}
              attendeeCount={event.attendees.filter((a) => !a.waitlist).length}
            />
            {event.type === 'tournament' && event.teamRegistrationMode === 'ad_hoc' && (
              <HostAdHocTeamsPanel
                eventId={event.id}
                returnPath={returnPath}
                divisions={event.divisions.map((d) => ({ id: d.id, label: d.label }))}
                rows={adHocHostRows}
              />
            )}
            {event.type === 'tournament' && event.divisions.length > 0 && (
              <HostDivisionWinnersPanel
                eventId={event.id}
                returnPath={returnPath}
                divisions={event.divisions}
                eligibleTeamsByDivision={eligibleTeamsByDivision}
              />
            )}
          </div>
        </details>
      )}

      {event.type === 'open_play' && (
        <section id="attendees">
          <h2 className="text-fg mb-3 text-lg font-semibold">
            Players signed up{' '}
            <span className="text-muted text-sm font-normal">({event.attendees.length})</span>
          </h2>
          <AttendeeList
            attendees={attendeesForList}
            currentUserId={user?.id ?? null}
            friendIds={friendIds}
            returnPath={returnPath}
            eventId={event.id}
            {...(payments ? { payments } : {})}
            canManagePayments={paid && event.canManage}
          />
          {event.canManage && (
            <p className="text-muted mt-3 text-xs">
              {viewerIsPro ? (
                <a
                  href={`/api/events/${event.id}/attendees.csv`}
                  className="text-primary hover:underline"
                >
                  Export attendees as CSV
                </a>
              ) : (
                <>
                  CSV attendee export is a{' '}
                  <Link
                    href={'/profile/billing/pro' as Route}
                    className="text-primary hover:underline"
                  >
                    Pro
                  </Link>{' '}
                  feature.
                </>
              )}
            </p>
          )}
        </section>
      )}

      {event.type === 'tournament' && <TeamsRegisteredSection teams={event.teams} />}

      {!isHostOfEvent && (
        <TipJar
          eventId={event.id}
          viewerIsRealUser={isRealUser}
          viewerHasSession={!!user}
          totalCents={tipTotalCents}
        />
      )}

      <EventStickyCta cta={cta} observeSelector="#signup" />
    </article>
  );
}
