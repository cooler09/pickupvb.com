import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next/types';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { NotFoundError } from '@pickupvb/domain';
import { getViewer } from '@/lib/server-auth';
import { formatEventDateLong } from '@/lib/date-formats';
import { OFF_PLATFORM_UPSELL_COOKIE } from '@/lib/off-platform-upsell';
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
import { PassPanel } from './_components/pass-panel';
import { AttendeesPanel } from './_components/attendees-panel';
import { EventSponsorSection } from './_components/event-sponsor-section';
import { EventWaiverSection } from './_components/event-waiver-section';
import { EventBadgesEarnSection } from './_components/event-badges-earn-section';
import { EventMediaLink } from './_components/event-media-link';
import { OffPlatformUpsell } from './_components/off-platform-upsell';
import { EventWhenSpotsSection } from './_components/event-when-spots-section';
import { EventSubpageLink } from './_components/event-subpage-link';
import { EventManageBanner } from './_components/event-manage-banner';
import { EventSectionNav, type EventSectionNavItem } from './_components/event-section-nav';
import { loadEventDetail, loadEventReadModelPublic } from './_loaders/load-event-detail';
import { HeroImage } from '@/components/hero-image';
import { RoomChatPanel } from '@/components/room-chat-panel';

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
  // `loadEventReadModelPublic` reads on the admin client (RLS-bypassed), so it
  // returns scoped events too. Metadata is viewer-agnostic (crawlers, link
  // unfurls), so only an anon-visible event — published `public` / `invite_only`
  // (the latter is link-shareable) — may expose its title/description here.
  // Otherwise emit a generic, noindex title so a `friends_of_host` /
  // `friends_of_attendees` (or unpublished) event's name doesn't leak in
  // `<head>` / og tags. The page body enforces the same gate in loadEventDetail.
  const anonVisible =
    event.status === 'published' &&
    (event.visibility === 'public' || event.visibility === 'invite_only');
  if (!anonVisible) {
    return { title: 'Event — PickupVB', robots: { index: false, follow: true } };
  }
  // Don't expose non-public events to crawlers — and keep cancelled/draft
  // events out of the index even when public. Sitemap removal alone won't
  // deindex a URL Google already has, so a previously-indexed cancelled event
  // would otherwise linger in SERPs as a dead result. `follow: true` so links
  // on the page still pass equity.
  const indexable =
    event.visibility === 'public' && event.status !== 'draft' && event.status !== 'cancelled';
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
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
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

// Matches /events/[id] against the v4-ish UUID format Supabase uses. Bots and
// stale links occasionally hit paths like `/events/new/edit` or `/events/foo`,
// which would otherwise fall through to a DB query and surface as a 500
// ("invalid input syntax for type uuid"). Reject early with a 404 instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Candidate anchors for the in-page jump nav (EV-4), in page order. The nav is
// a client component that auto-discovers which of these actually rendered —
// Players (open play) vs. Teams (tournament) are mutually exclusive, chat
// self-gates to members, About is absent when there's no description/rules — so
// listing all six here is safe; only present anchors become chips.
const SECTION_NAV_ITEMS: ReadonlyArray<EventSectionNavItem> = [
  { id: 'about', label: 'About' },
  { id: 'where', label: 'Where' },
  { id: 'hosts', label: 'Hosts' },
  { id: 'attendees', label: 'Players' },
  { id: 'chat', label: 'Chat' },
  { id: 'teams', label: 'Teams' },
  { id: 'media', label: 'Media' },
];

export default async function EventDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  if (!UUID_RE.test(params.id)) {
    notFound();
  }
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
    registrationClosed,
    effectiveRegistrationClosesAt,
    isExternal,
    signupsOpen,
    pricing,
    paid,
    breakdown,
    priceLabel,
    tipTotalCents,
    hostStripeReady,
    primaryHostUserSocial,
    payments,
    viewerPaymentStatus,
    refundBlockReason,
    adHocViewerRegistrations,
    adHocAllRegistrations,
    attendeesForList,
    filledByPosition,
    viewerPosition,
    waitlistCount,
    viewerWaitlistPosition,
    sponsor,
    eventBadges,
    heroImageUrl,
    mediaSummary,
    bracketExists,
    cta,
  } = vm;

  // Waiver flash (O-9) — extracted so the conditional-spread narrows it to a
  // string (exactOptionalPropertyTypes).
  const waiverFlash = pickQuery(searchParams, 'waiver');

  // Registered count per division (roster teams + ad-hoc / walk-in entries),
  // mirroring the public roster grouping, so the divisions comparison list can
  // show "registered / cap" for team divisions.
  const teamCountByDivision = new Map<string, number>();
  for (const t of event.teams) {
    if (t.divisionId) {
      teamCountByDivision.set(t.divisionId, (teamCountByDivision.get(t.divisionId) ?? 0) + 1);
    }
  }
  for (const r of adHocAllRegistrations) {
    teamCountByDivision.set(r.divisionId, (teamCountByDivision.get(r.divisionId) ?? 0) + 1);
  }

  // EV-7: team-registration events (tournament / league) measure capacity in
  // teams, not individual players. Frame the event-level "Spots" cell — and
  // suppress the hero's per-player spots chip — accordingly, so a single-
  // division team event doesn't read "Unlimited" / "0 signed up" while its
  // division actually caps teams. Caps sum across team divisions; null when any
  // team division is uncapped (per-division counts then live in DivisionsSection).
  const teamDivisions = event.divisions.filter((d) => d.teamRegistrationMode !== null);
  const isTeamEvent = teamDivisions.length > 0;
  const registeredTeamsTotal = [...teamCountByDivision.values()].reduce((a, b) => a + b, 0);
  const allTeamDivisionsFixed =
    isTeamEvent && teamDivisions.every((d) => d.capacityKind === 'fixed' && d.maxSpots !== null);
  const teamCapTotal = allTeamDivisionsFixed
    ? teamDivisions.reduce((sum, d) => sum + (d.maxSpots ?? 0), 0)
    : null;
  // For external events the on-platform registered count is unreliable; the
  // component then shows the cap (or "Unlimited") without the live count.
  const teamSummary = isTeamEvent
    ? { registered: registeredTeamsTotal, cap: teamCapTotal, reliable: !isExternal }
    : null;

  // EV-6: once the viewer has taken the page's primary action (RSVP'd, holds a
  // position, queued on the waitlist, captains/joined a team, or listed as a
  // free agent) while signups are still open, the hero CTA degrades to a
  // "You're in — view details" non-action. Suppress the mobile sticky bar in
  // that window so it doesn't persistently mirror a control that does nothing.
  // (Started / completed events keep the bar — its CTA is real navigation.)
  const viewerHasRegistered =
    event.isAttending ||
    viewerPosition !== null ||
    viewerWaitlistPosition !== null ||
    adHocViewerRegistrations.length > 0 ||
    event.viewerCaptainedTeams.length > 0 ||
    event.isFreeAgent;
  const showStickyCta = !(signupsOpen && viewerHasRegistered);

  // Roster for live-message author resolution in the event room chat (host +
  // co-hosts + attendees, deduped). Best-effort — the initial message page
  // already carries server-resolved names; this only labels live broadcast rows.
  const chatParticipants = [
    ...new Map(
      [
        ...(event.primaryHostUser
          ? [{ id: event.primaryHostUser.id, name: event.primaryHostUser.displayName }]
          : []),
        ...event.coHostUsers.map((u) => ({ id: u.id, name: u.displayName })),
        ...attendeesForList.map((a) => ({ id: a.user_id, name: a.profiles.display_name })),
      ].map((p) => [p.id, p] as const),
    ).values(),
  ];

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <EventStructuredData event={event} ticketCents={breakdown?.ticketCents ?? null} />
      <Link href="/events" className="text-primary text-sm hover:underline">
        ← Back to events
      </Link>

      {event.canManage && <EventManageBanner eventId={event.id} />}

      <EventFlashBanners
        created={pickQuery(searchParams, 'created')}
        tip={pickQuery(searchParams, 'tip')}
        tipMsg={pickQuery(searchParams, 'tip_msg')}
        cohost={pickQuery(searchParams, 'cohost')}
        cohostMsg={pickQuery(searchParams, 'cohost_msg')}
        eventId={event.id}
        canAddCoverPhoto={event.canManage && !heroImageUrl}
      />

      {isHostOfEvent &&
        event.paymentsOffPlatform &&
        (await cookies()).get(OFF_PLATFORM_UPSELL_COOKIE)?.value !== '1' && (
          <OffPlatformUpsell eventId={event.id} returnPath={returnPath} />
        )}

      <HeroImage url={heroImageUrl} alt={event.title} surface={event.surface} priority />

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
          endsAt={event.endsAt}
          timeZone={event.timeZone}
          city={event.location.city}
          region={event.location.region}
          spotsRemaining={isTeamEvent ? null : event.spotsRemaining}
          priceLabel={priceLabel}
          registrationClosesAt={effectiveRegistrationClosesAt}
          cta={cta}
          divisionCount={event.divisions.length}
          closingSoon={closingSoon}
          registrationClosed={registrationClosed && !hasStarted && event.status === 'published'}
          liveNow={mediaSummary.liveCount > 0}
        />
      </header>

      <EventWhenSpotsSection
        type={event.type}
        startsAt={event.startsAt}
        endsAt={event.endsAt}
        timeZone={event.timeZone}
        spotsRemaining={event.spotsRemaining}
        attendeeCount={event.attendeeCount}
        offPlatform={event.paymentsOffPlatform || isExternal}
        teamSummary={teamSummary}
      />

      <EventMetaSection
        venueName={event.venueName}
        seriesName={event.seriesName}
        seriesPosition={event.seriesPosition}
        seriesSize={event.seriesSize}
        isFundraiser={event.isFundraiser}
        fundraiserBeneficiary={event.fundraiserBeneficiary}
        themeTags={event.themeTags}
        sanctioningBody={event.sanctioningBody}
        registrationClosesAt={effectiveRegistrationClosesAt}
        paymentInstructions={event.paymentInstructions}
        isExternal={isExternal}
        timeZone={event.timeZone}
      />

      <DivisionsSection
        divisions={event.divisions}
        teamCounts={teamCountByDivision}
        offPlatform={event.paymentsOffPlatform || isExternal}
      />

      <EventSignupArea
        event={event}
        isExternal={isExternal}
        signupsOpen={signupsOpen}
        hasStarted={hasStarted}
        registrationClosed={registrationClosed && event.status === 'published' && !hasStarted}
        bracketExists={bracketExists}
        paid={paid}
        pricing={pricing}
        breakdown={breakdown}
        priceLabel={priceLabel}
        viewerPaymentStatus={viewerPaymentStatus}
        refundBlockReason={refundBlockReason}
        isRealUser={isRealUser}
        user={user}
        returnPath={returnPath}
        hostStripeReady={hostStripeReady}
        filledByPosition={filledByPosition}
        viewerPosition={viewerPosition}
        waitlistCount={waitlistCount}
        viewerWaitlistPosition={viewerWaitlistPosition}
        adHocViewerRegistrations={adHocViewerRegistrations}
        adHocAllRegistrations={adHocAllRegistrations}
        rsvp={pickQuery(searchParams, 'rsvp')}
        rsvpMsg={pickQuery(searchParams, 'rsvp_msg')}
        team={pickQuery(searchParams, 'team')}
        fa={pickQuery(searchParams, 'fa')}
      />

      {/* PassPanel + EventWaiverSection are async server components that do their
          own (gated) reads. Suspense-wrap them so they stream off the critical
          path instead of blocking the page as a third wave after loadEventDetail
          (perf audit P3 #23). */}
      <Suspense fallback={null}>
        <PassPanel eventId={event.id} />
      </Suspense>

      {/* In-page jump nav (EV-4) — introduces the below-the-fold region and
          pins to the top as the reader scrolls into it, so returning users can
          jump straight to the roster / chat instead of scrolling the long
          engagement tail. Self-discovers which sections rendered. */}
      <EventSectionNav items={SECTION_NAV_ITEMS} />

      {(event.description || event.rules) && (
        <div id="about" className="scroll-mt-20 space-y-8">
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
        </div>
      )}

      {/* EV-5: once the event has started / completed, the hero CTA and the
          EventClosedState both surface "Open bracket" / "View schedule", so the
          standalone sub-page card is redundant (3 controls → 2). Keep it only
          while signups are upcoming, where it's the sole bracket/schedule
          preview affordance (the hero CTA there is "Register").
          Non-hosts only see it once the host has actually built a bracket —
          otherwise it links to an empty "no bracket yet" page. Hosts always see
          it (that page is where they create the bracket). */}
      {event.type === 'tournament' &&
        !hasStarted &&
        event.status !== 'completed' &&
        (isHostOfEvent || bracketExists) && (
          <EventSubpageLink
            title="Bracket"
            description="View the tournament bracket, matchups, and live results."
            href={`/events/${event.id}/bracket`}
            ctaLabel="Open bracket"
          />
        )}

      {event.type === 'league' && !hasStarted && event.status !== 'completed' && (
        <EventSubpageLink
          title="Schedule"
          description="View the weekly schedule, matchups, and scores."
          href={`/events/${event.id}/schedule`}
          ctaLabel="Open schedule"
        />
      )}

      <div id="where" className="scroll-mt-20">
        <EventLocationSection event={event} />
      </div>

      <div id="hosts" className="scroll-mt-20">
        <HostsSection
          eventId={event.id}
          primaryHostUser={event.primaryHostUser}
          primaryHostGroup={event.primaryHostGroup}
          coHostUsers={event.coHostUsers}
          coHostGroups={event.coHostGroups}
          canManage={event.canManage}
          viewerHostableGroups={event.viewerHostableGroups}
          returnPath={returnPath}
          showCoHostControls={false}
          {...(primaryHostUserSocial ? { primaryHostUserSocial } : {})}
        />
      </div>

      <AttendeesPanel
        event={event}
        attendees={attendeesForList}
        currentUserId={user?.id ?? null}
        friendIds={friendIds}
        returnPath={returnPath}
        payments={payments}
        paid={paid}
        page={Math.max(1, Number.parseInt(pickQuery(searchParams, 'apage') ?? '1', 10) || 1)}
        searchParams={Object.fromEntries(
          Object.entries(searchParams ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
        )}
      />

      <RoomChatPanel
        kind="event"
        contextId={event.id}
        label="Event chat"
        participants={chatParticipants}
        anchorId="chat"
      />

      {event.type === 'tournament' && !event.paymentsOffPlatform && !isExternal && (
        <TeamsRegisteredSection
          teams={event.teams}
          adHocRegistrations={adHocAllRegistrations}
          divisions={event.divisions.map((d) => ({ id: d.id, label: d.label }))}
          viewerIsHost={isHostOfEvent}
        />
      )}

      {!isHostOfEvent && (
        <TipJar
          eventId={event.id}
          viewerIsRealUser={isRealUser}
          viewerHasSession={!!user}
          totalCents={tipTotalCents}
          hostCanCollectTips={hostStripeReady}
        />
      )}

      <div id="media" className="scroll-mt-20">
        <EventMediaLink
          eventId={event.id}
          totalCount={mediaSummary.totalCount}
          liveCount={mediaSummary.liveCount}
        />
      </div>

      <EventBadgesEarnSection badges={eventBadges.filter((b) => b.grantRule === 'on_attend')} />

      <Suspense fallback={null}>
        <EventWaiverSection
          eventId={event.id}
          {...(waiverFlash ? { flashCode: waiverFlash } : {})}
        />
      </Suspense>

      <EventSponsorSection sponsor={sponsor} />

      {showStickyCta && <EventStickyCta cta={cta} observeSelector="#signup" />}
    </article>
  );
}
