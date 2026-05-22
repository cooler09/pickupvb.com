import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next/types';
import { notFound } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import type { SocialHandles } from '@/lib/social-handles';
import { formatEventDateLong } from '@/lib/date-formats';
import { LocalDateTime } from '@/components/local-datetime';
import { getEventPricing, attendeeChargeBreakdownAsync, isPaidEvent } from '@/lib/event-pricing';
import { renderNowMs } from '@/lib/render-now';
import { AttendeeList } from '@/components/attendee-list';
import { Alert } from '@/components/alert';
import { EventJsonLd } from './_components/event-jsonld';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { EventHero, type EventHeroCta } from './_components/event-hero';
import { EventClosedState } from './_components/event-closed-state';
import { EventStickyCta } from './_components/event-sticky-cta';
import { HostsSection } from './_components/hosts-section';
import { PaidTicketPanel } from './_components/paid-ticket-panel';
import { PositionRsvpPanel } from './_components/position-rsvp-panel';
import { RsvpPanel } from './_components/rsvp-panel';
import { TournamentSignupPanel } from './_components/tournament-signup-panel';
import {
  AdHocTeamSignupPanel,
  type AdHocTeamPublicEntry,
  type AdHocTeamRegistration,
} from './_components/ad-hoc-team-signup-panel';
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
import { HostAdHocTeamsPanel, type HostAdHocTeamRow } from './_components/host-ad-hoc-teams-panel';
import { HostDivisionWinnersPanel } from './_components/host-division-winners-panel';
import { SignupSection } from './_components/signup-section';

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

  const friendIds = new Set(event.viewerFriendIds);
  const returnPath = `/events/${event.id}`;
  const nowMs = renderNowMs();
  const hasStarted = event.startsAt.getTime() <= nowMs;
  const closesAtMs = event.registrationClosesAt ? event.registrationClosesAt.getTime() : null;
  const closingSoon =
    closesAtMs !== null && closesAtMs > nowMs && closesAtMs - nowMs <= 72 * 60 * 60 * 1000;
  const isExternal = event.registrationMode === 'external';
  // External-registration events suppress all on-platform signup panels.
  const signupsOpen = event.status === 'published' && !hasStarted && !isExternal;

  // Side-loads after the domain read model:
  //
  //   wave 1 — pricing + every viewer/host/event side-load that doesn't
  //            depend on `paid`. Up to 6 RTTs in parallel.
  //   wave 2 — the three paid-event-only fetches (breakdown, host payments
  //            map, viewer payment status). Up to 3 RTTs in parallel.
  //
  // Previously these landed as 4–6 sequential waves; the original audit
  // (P1 #4) flagged ~300–800 ms total at warm Postgres. Collapsing to
  // 2 waves keeps the page-level perimeter at constant RTT regardless of
  // how many side-loads we add later.
  type EligibleTeamOption = {
    kind: 'team' | 'registration';
    id: string;
    label: string;
  };
  type AdHocBundle = {
    viewerRegistrations: ReadonlyArray<AdHocTeamRegistration>;
    allRegistrations: ReadonlyArray<AdHocTeamPublicEntry>;
    hostRows: ReadonlyArray<HostAdHocTeamRow>;
  };
  const isHostOfEvent = !!user && event.canManage;

  const [
    pricing,
    viewerIsPro,
    tipTotalCents,
    primaryHostUserSocial,
    eligibleTeamsByDivision,
    adHocBundle,
  ] = await Promise.all([
    // Pricing is read separately from the aggregate — see lib/event-pricing.ts.
    getEventPricing(event.id),
    event.canManage && user
      ? (async () => (await import('@/lib/admin')).hasProBenefits(user.id))()
      : Promise.resolve(false),
    // Tip-jar totals (cheap RPC). Hidden from the host themselves.
    isHostOfEvent
      ? Promise.resolve(0)
      : (async () => {
          const { getAdminSupabase } = await import('@/lib/supabase-admin');
          const { data: tipTotal } = await getAdminSupabase().rpc('event_tip_total_cents', {
            p_event_id: event.id,
          } as never);
          return Number(tipTotal ?? 0);
        })(),
    // Primary host's social handles — small cosmetic fetch, kept outside the
    // domain read model. Resolves to null when no handles are set.
    event.primaryHostUser
      ? (async (): Promise<SocialHandles | null> => {
          const sb = await getServerSupabase();
          const { data: socialRow } = await sb
            .from('profiles')
            .select(
              'instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url',
            )
            .eq('id', event.primaryHostUser!.id)
            .maybeSingle();
          const r = socialRow as {
            instagram_handle: string | null;
            tiktok_handle: string | null;
            twitter_handle: string | null;
            facebook_handle: string | null;
            youtube_handle: string | null;
            website_url: string | null;
          } | null;
          if (!r) return null;
          return {
            instagramHandle: r.instagram_handle,
            tiktokHandle: r.tiktok_handle,
            twitterHandle: r.twitter_handle,
            facebookHandle: r.facebook_handle,
            youtubeHandle: r.youtube_handle,
            websiteUrl: r.website_url,
          };
        })()
      : Promise.resolve(null),
    // Eligible winning teams per division for the host's "Record winner"
    // panel. Pulls roster-mode entries (event_teams → teams) and ad-hoc
    // registrations (event_team_registrations) and groups by division.
    event.canManage && event.type === 'tournament' && event.divisions.length > 0
      ? (async (): Promise<Map<string, EligibleTeamOption[]>> => {
          const sbWinners = await getServerSupabase();
          const [{ data: rosterRows }, { data: regOptions }] = await Promise.all([
            sbWinners
              .from('event_teams')
              .select('division_id, team_id, teams!inner(id, name)')
              .eq('event_id', event.id),
            sbWinners
              .from('event_team_registrations')
              .select('id, name, division_id')
              .eq('event_id', event.id),
          ]);
          type RosterRow = {
            division_id: string;
            team_id: string;
            teams: { id: string; name: string } | null;
          };
          type RegOptionRow = { id: string; name: string; division_id: string };
          const map = new Map<string, EligibleTeamOption[]>();
          for (const r of (rosterRows as RosterRow[] | null) ?? []) {
            if (!r.teams || !r.division_id) continue;
            const arr = map.get(r.division_id) ?? [];
            arr.push({ kind: 'team', id: r.team_id, label: r.teams.name });
            map.set(r.division_id, arr);
          }
          for (const r of (regOptions as RegOptionRow[] | null) ?? []) {
            const arr = map.get(r.division_id) ?? [];
            arr.push({ kind: 'registration', id: r.id, label: r.name });
            map.set(r.division_id, arr);
          }
          for (const [k, v] of map) {
            v.sort((a, b) => a.label.localeCompare(b.label));
            map.set(k, v);
          }
          return map;
        })()
      : Promise.resolve(new Map<string, EligibleTeamOption[]>()),
    // ADR 0007 — ad-hoc team registrations. Only fetched on tournaments
    // configured for ad-hoc registration. Single query JOINs captain
    // profile + members so the host management panel doesn't need a
    // second RTT to resolve captain display names.
    event.type === 'tournament' && event.teamRegistrationMode === 'ad_hoc'
      ? (async (): Promise<AdHocBundle> => {
          const sb = await getServerSupabase();
          const { data: regRows } = await sb
            .from('event_team_registrations')
            .select(
              'id, name, division_id, captain_id, payment_status, payment_intent_id, amount_paid_cents, captain:profiles!event_team_registrations_captain_id_fkey(id, display_name), members:event_team_registration_members(id, user_id, display_name, email, sort_order)',
            )
            .eq('event_id', event.id);
          type MemberRow = {
            id: string;
            user_id: string | null;
            display_name: string | null;
            email: string | null;
            sort_order: number;
          };
          type RegRow = {
            id: string;
            name: string;
            division_id: string;
            captain_id: string;
            payment_status: 'none' | 'pending' | 'paid' | 'refunded';
            payment_intent_id: string | null;
            amount_paid_cents: number | null;
            captain: { id: string; display_name: string | null } | null;
            members: MemberRow[] | null;
          };
          const rows: RegRow[] = (regRows as RegRow[] | null) ?? [];
          const allRegistrations: AdHocTeamPublicEntry[] = rows.map((r) => ({
            id: r.id,
            name: r.name,
            divisionId: r.division_id,
            paymentStatus: r.payment_status,
            memberCount: 1 + (r.members?.length ?? 0),
            isViewerCaptain: !!user && r.captain_id === user.id,
          }));
          const viewerRegistrations: AdHocTeamRegistration[] = user
            ? rows
                .filter((r) => r.captain_id === user.id)
                .map((r) => ({
                  id: r.id,
                  name: r.name,
                  divisionId: r.division_id,
                  paymentStatus: r.payment_status,
                  members: (r.members ?? [])
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((m) => ({
                      id: m.id,
                      userId: m.user_id,
                      displayName: m.display_name,
                      email: m.email,
                      sortOrder: m.sort_order,
                    })),
                }))
            : [];
          const hostRows: HostAdHocTeamRow[] =
            event.canManage && rows.length > 0
              ? rows.map((r) => ({
                  id: r.id,
                  name: r.name,
                  divisionId: r.division_id,
                  paymentStatus: r.payment_status,
                  paymentIntentId: r.payment_intent_id,
                  amountPaidCents: r.amount_paid_cents ?? 0,
                  rosterSize: 1 + (r.members?.length ?? 0),
                  captain: {
                    id: r.captain_id,
                    displayName: r.captain?.display_name ?? null,
                  },
                }))
              : [];
          return { viewerRegistrations, allRegistrations, hostRows };
        })()
      : Promise.resolve<AdHocBundle>({
          viewerRegistrations: [],
          allRegistrations: [],
          hostRows: [],
        }),
  ]);

  const paid = isPaidEvent(pricing);
  const needsViewerPayment = paid && !!user && event.isAttending;
  const needsManagePayments = paid && event.canManage;

  const [breakdown, payments, viewerPaymentStatus] = await Promise.all([
    pricing && paid ? attendeeChargeBreakdownAsync(pricing) : Promise.resolve(null),
    // For paid events, side-load per-attendee payment status (admin client —
    // visibility is host-only). Free events get undefined.
    needsManagePayments
      ? (async () => {
          const { getAdminSupabase } = await import('@/lib/supabase-admin');
          const { data: payRows } = await getAdminSupabase()
            .from('event_attendees')
            .select('user_id, payment_status, payment_intent_id')
            .eq('event_id', event.id);
          type PayRow = {
            user_id: string;
            payment_status: string;
            payment_intent_id: string | null;
          };
          const map = new Map<string, { status: string; viaStripe: boolean }>();
          for (const r of (payRows as PayRow[] | null) ?? []) {
            map.set(r.user_id, {
              status: r.payment_status,
              viaStripe: !!r.payment_intent_id,
            });
          }
          return map;
        })()
      : Promise.resolve(undefined),
    // For paid events, also look up the viewer's own payment status so the
    // RSVP panel can show "paid / pending / due" badges.
    needsViewerPayment
      ? (async () => {
          const sb = await getServerSupabase();
          const { data: row } = await sb
            .from('event_attendees')
            .select('payment_status')
            .eq('event_id', event.id)
            .eq('user_id', user!.id)
            .maybeSingle();
          const raw = (row as { payment_status?: string } | null)?.payment_status;
          return raw === 'paid' || raw === 'pending' || raw === 'none' ? raw : undefined;
        })()
      : Promise.resolve(undefined),
  ]);

  const {
    viewerRegistrations: adHocViewerRegistrations,
    allRegistrations: adHocAllRegistrations,
    hostRows: adHocHostRows,
  } = adHocBundle;

  // The AttendeeList component still expects the snake_case Supabase shape.
  // Map the read model to it inline to keep the component unchanged.
  const attendeesForList = event.attendees.map((a) => ({
    user_id: a.userId,
    joined_at: a.joinedAt.toISOString(),
    position: a.position,
    waitlist: a.waitlist,
    handle: a.profile.handle,
    profiles: {
      display_name: a.profile.displayName,
      first_name: a.profile.firstName,
      last_name: a.profile.lastName,
      avatar_url: a.profile.avatarUrl,
    },
  }));

  // Per-position fill counts for the positional RSVP panel.
  const filledByPosition: Partial<Record<string, number>> = {};
  for (const a of event.attendees) {
    if (!a.position) continue;
    filledByPosition[a.position] = (filledByPosition[a.position] ?? 0) + 1;
  }
  const viewerPosition = user
    ? (event.attendees.find((a) => a.userId === user.id)?.position ?? null)
    : null;

  // Primary call-to-action shown in the hero (and mirrored in the mobile
  // sticky bar). Falls through to `null` when there's nothing actionable
  // (draft, cancelled, etc.); the closed-state pivot picks up the slack.
  const priceLabel = paid && breakdown ? `$${(breakdown.ticketCents / 100).toFixed(2)}` : 'Free';
  const cta: EventHeroCta = (() => {
    if (event.status === 'cancelled' || event.status === 'draft') return null;
    if (isExternal && signupsOpen && event.externalRegistrationUrl) {
      return {
        kind: 'external',
        href: event.externalRegistrationUrl,
        label: 'Register externally',
      };
    }
    if (event.type === 'tournament' && (hasStarted || event.status === 'completed')) {
      return {
        kind: 'internal',
        href: `/events/${event.id}/bracket` as Route,
        label: 'Open bracket',
      };
    }
    if (event.type === 'open_play' && (hasStarted || event.status === 'completed')) {
      return { kind: 'anchor', hash: '#attendees', label: 'View attendees' };
    }
    if (!signupsOpen) return null;
    if (event.isAttending) {
      return { kind: 'anchor', hash: '#signup', label: "You're in — view details" };
    }
    if (event.spotsRemaining === 0) {
      return { kind: 'anchor', hash: '#signup', label: 'Join waitlist' };
    }
    if (event.type === 'tournament') {
      return { kind: 'anchor', hash: '#signup', label: 'Register' };
    }
    if (paid) return { kind: 'anchor', hash: '#signup', label: 'Buy ticket' };
    return { kind: 'anchor', hash: '#signup', label: 'RSVP' };
  })();

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
