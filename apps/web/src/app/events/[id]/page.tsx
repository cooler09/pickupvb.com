import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next/types';
import { NotFoundError } from '@pickupvb/domain';
import { getViewer } from '@/lib/server-auth';
import { formatEventDateLong } from '@/lib/date-formats';
import { LocalDateTime } from '@/components/local-datetime';
import { EventHero } from './_components/event-hero';
import { EventStickyCta } from './_components/event-sticky-cta';
import { HostsSection } from './_components/hosts-section';
import { TeamsRegisteredSection } from './_components/teams-registered-section';
import { TipJar } from './_components/tip-jar';
import { DivisionsSection } from './_components/divisions-section';
import { EventMetaSection } from './_components/event-meta-section';
import { EventStructuredData } from './_components/event-structured-data';
import { EventFlashBanners } from './_components/event-flash-banners';
import { EventLocationSection } from './_components/event-location-section';
import { EventSignupArea } from './_components/event-signup-area';
import { HostToolsSection } from './_components/host-tools-section';
import { AttendeesPanel } from './_components/attendees-panel';
import { loadEventDetail, loadEventReadModelPublic } from './_loaders/load-event-detail';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  let event;
  try {
    event = await loadEventReadModelPublic(id);
  } catch (err) {
    if (err instanceof NotFoundError) return { title: 'Event — PickupVB' };
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
    hostStripeReady,
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
      <EventStructuredData event={event} ticketCents={breakdown?.ticketCents ?? null} />
      <Link href="/events" className="text-primary text-sm hover:underline">
        ← Back to events
      </Link>

      <EventFlashBanners
        created={pickQuery(searchParams, 'created')}
        tip={pickQuery(searchParams, 'tip')}
        tipMsg={pickQuery(searchParams, 'tip_msg')}
        cohost={pickQuery(searchParams, 'cohost')}
        cohostMsg={pickQuery(searchParams, 'cohost_msg')}
      />

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

      <EventSignupArea
        event={event}
        isExternal={isExternal}
        signupsOpen={signupsOpen}
        hasStarted={hasStarted}
        paid={paid}
        pricing={pricing}
        breakdown={breakdown}
        priceLabel={priceLabel}
        viewerPaymentStatus={viewerPaymentStatus}
        isRealUser={isRealUser}
        user={user}
        returnPath={returnPath}
        hostStripeReady={hostStripeReady}
        filledByPosition={filledByPosition}
        viewerPosition={viewerPosition}
        adHocViewerRegistrations={adHocViewerRegistrations}
        adHocAllRegistrations={adHocAllRegistrations}
        rsvp={pickQuery(searchParams, 'rsvp')}
        rsvpMsg={pickQuery(searchParams, 'rsvp_msg')}
        team={pickQuery(searchParams, 'team')}
        fa={pickQuery(searchParams, 'fa')}
      />

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

      <EventLocationSection event={event} />

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

      <HostToolsSection
        event={event}
        returnPath={returnPath}
        adHocHostRows={adHocHostRows}
        eligibleTeamsByDivision={eligibleTeamsByDivision}
      />

      <AttendeesPanel
        event={event}
        attendees={attendeesForList}
        currentUserId={user?.id ?? null}
        friendIds={friendIds}
        returnPath={returnPath}
        payments={payments}
        paid={paid}
        viewerIsPro={viewerIsPro}
      />

      {event.type === 'tournament' && <TeamsRegisteredSection teams={event.teams} />}

      {!isHostOfEvent && (
        <TipJar
          eventId={event.id}
          viewerIsRealUser={isRealUser}
          viewerHasSession={!!user}
          totalCents={tipTotalCents}
          hostCanCollectTips={hostStripeReady}
        />
      )}

      <EventStickyCta cta={cta} observeSelector="#signup" />
    </article>
  );
}
