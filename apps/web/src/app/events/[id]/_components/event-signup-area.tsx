import { SignupSection } from './signup-section';
import { ExternalRegistrationCard } from './external-registration-card';
import { PaidTicketPanel } from './paid-ticket-panel';
import { PositionRsvpPanel } from './position-rsvp-panel';
import { RsvpPanel } from './rsvp-panel';
import { TournamentRegisterPanel } from './tournament-register-panel';
import { TournamentSignupPanel } from './tournament-signup-panel';
import {
  AdHocTeamSignupPanel,
  type AdHocTeamPublicEntry,
  type AdHocTeamRegistration,
} from './ad-hoc-team-signup-panel';
import { FreeAgentSignupPanel } from './free-agent-signup-panel';
import { EventClosedState } from './event-closed-state';
import type { EventDetailReadModel, EventPosition } from '@pickupvb/domain';
import type { EventPricing } from '@/lib/event-pricing';
import type { ViewerPaymentStatus } from '../_loaders/load-event-detail';

type Breakdown = {
  ticketCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  totalCents: number;
};

export function EventSignupArea({
  event,
  isExternal,
  signupsOpen,
  hasStarted,
  paid,
  pricing,
  breakdown,
  priceLabel,
  viewerPaymentStatus,
  isRealUser,
  user,
  returnPath,
  hostStripeReady,
  filledByPosition,
  viewerPosition,
  waitlistCount,
  viewerWaitlistPosition,
  adHocViewerRegistrations,
  adHocAllRegistrations,
  rsvp,
  rsvpMsg,
  team,
  fa,
}: {
  event: EventDetailReadModel;
  isExternal: boolean;
  signupsOpen: boolean;
  hasStarted: boolean;
  paid: boolean;
  pricing: EventPricing | null;
  breakdown: Breakdown | null;
  priceLabel: string;
  viewerPaymentStatus: ViewerPaymentStatus | undefined;
  isRealUser: boolean;
  user: { id: string } | null;
  returnPath: string;
  /**
   * True when the host has a charges-enabled Stripe Connect account.
   * When false, on-platform Pay CTAs are suppressed across panels (the
   * checkout would fail downstream) and the off-platform copy is used
   * instead.
   */
  hostStripeReady: boolean;
  filledByPosition: Partial<Record<string, number>>;
  viewerPosition: EventPosition | null;
  /** Total players queued on the capacity waitlist (ADR 0036). */
  waitlistCount: number;
  /** The viewer's 1-based waitlist place, or null if not queued. */
  viewerWaitlistPosition: number | null;
  adHocViewerRegistrations: ReadonlyArray<AdHocTeamRegistration>;
  adHocAllRegistrations: ReadonlyArray<AdHocTeamPublicEntry>;
  rsvp: string | undefined;
  rsvpMsg: string | undefined;
  team: string | undefined;
  fa: string | undefined;
}) {
  // The host either explicitly opted out of on-platform payments OR has
  // no Stripe Connect account to receive them. Either way the UI must
  // hide Stripe Checkout CTAs.
  const effectiveOffPlatform = event.paymentsOffPlatform || !hostStripeReady;

  // Suppress the "host hasn't finished payment setup" flash banner on
  // off-platform events — the on-platform Pay CTA is hidden anyway, so
  // the banner (typically arriving via a stale `?rsvp=host_not_ready`
  // URL) is just noise.
  const effRsvp = effectiveOffPlatform && rsvp === 'host_not_ready' ? undefined : rsvp;
  const effRsvpMsg = effRsvp === undefined ? undefined : rsvpMsg;

  if (isExternal) {
    return (
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
    );
  }

  if (signupsOpen && event.type === 'open_play') {
    // Smart collapse default: keep the CTA open for prospective registrants;
    // collapse once the viewer is already in (RSVP'd or holds a position).
    // Force open when a flash result code is present so the just-acted
    // confirmation / error inside the panel isn't hidden behind the collapse.
    const viewerSignedUp = event.isAttending || viewerPosition !== null;
    const openSignup = !viewerSignedUp || effRsvp !== undefined;
    return (
      <SignupSection
        title="Sign up"
        collapsible
        defaultOpen={openSignup}
        badge={
          paid && breakdown ? { tone: 'paid', label: priceLabel } : { tone: 'free', label: 'Free' }
        }
        subline={
          event.positionRoster
            ? 'Pick a position below.'
            : event.spotsRemaining === null
              ? 'Unlimited spots.'
              : event.spotsRemaining === 0
                ? waitlistCount > 0
                  ? `Full — ${waitlistCount} on the waitlist.`
                  : 'Full — join the waitlist below.'
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
            processingFeeCents={breakdown.processingFeeCents}
            refundWindowHours={pricing!.refundWindowHours}
            paymentsOffPlatform={effectiveOffPlatform}
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
            rsvp={effRsvp}
            rsvpMsg={effRsvpMsg}
          />
        ) : (
          <RsvpPanel
            eventId={event.id}
            eventTitle={event.title}
            isAttending={event.isAttending}
            isRealUser={isRealUser}
            isFull={event.spotsRemaining === 0}
            waitlistPosition={viewerWaitlistPosition}
            waitlistCount={waitlistCount}
            rsvp={effRsvp}
            rsvpMsg={effRsvpMsg}
          />
        )}
      </SignupSection>
    );
  }

  if (signupsOpen && event.type === 'tournament') {
    // Tournament team registrations live in two places depending on mode:
    // roster-mode teams come back on `event.teams`; ad-hoc registrations
    // come from `adHocAllRegistrations`. Surface the combined count so
    // the picker badge + subline match what users see in the panels.
    const teamCount = event.teams.length + adHocAllRegistrations.length;
    const freeAgentCount = event.freeAgents.length;
    // ADR 0016: team registration mode is per-division. A division can be
    // ad_hoc, roster, or null (individual signup) independently of its
    // siblings. Split the divisions per mode and render whichever
    // sub-panels apply; if both modes are present, stack them.
    const adHocDivisions = event.divisions.filter((d) => d.teamRegistrationMode === 'ad_hoc');
    const rosterDivisions = event.divisions.filter((d) => d.teamRegistrationMode === 'roster');
    const teamEnabled = adHocDivisions.length > 0 || rosterDivisions.length > 0;
    // Smart collapse default: open for prospective registrants; collapse once
    // the viewer is already in — captaining/joining an ad-hoc or roster team,
    // or listed as a free agent. Force open when a flash result code is present
    // (team / free-agent / rsvp) so the just-acted confirmation / error inside
    // a panel isn't hidden behind the collapse.
    const viewerRegistered =
      adHocViewerRegistrations.length > 0 ||
      event.viewerCaptainedTeams.length > 0 ||
      event.isFreeAgent;
    const openRegister = !viewerRegistered || Boolean(effRsvp || team || fa);
    return (
      <SignupSection
        title="Register"
        collapsible
        defaultOpen={openRegister}
        badge={{ tone: 'neutral', label: 'Tournament' }}
        subline={`${teamCount} ${teamCount === 1 ? 'team' : 'teams'} · ${freeAgentCount} free ${freeAgentCount === 1 ? 'agent' : 'agents'}`}
      >
        <TournamentRegisterPanel
          teamCount={teamCount}
          freeAgentCount={freeAgentCount}
          teamEnabled={teamEnabled}
          freeAgentEnabled={event.divisions.some((d) => d.allowFreeAgents)}
          defaultMode={event.isFreeAgent ? 'free-agent' : 'team'}
          teamPanel={
            <div className="space-y-4">
              {adHocDivisions.length > 0 && (
                <AdHocTeamSignupPanel
                  eventId={event.id}
                  returnPath={returnPath}
                  divisions={adHocDivisions.map((d) => ({
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
                  paymentsOffPlatform={effectiveOffPlatform}
                  {...(effRsvp ? { resultCode: effRsvp } : {})}
                  {...(effRsvpMsg ? { resultMsg: effRsvpMsg } : {})}
                />
              )}
              {rosterDivisions.length > 0 && (
                <TournamentSignupPanel
                  eventId={event.id}
                  teams={event.teams}
                  viewerCaptainedTeams={event.viewerCaptainedTeams}
                  divisions={rosterDivisions.map((d) => ({
                    id: d.id,
                    label: d.label,
                    format: d.format,
                    priceCents: d.priceCents,
                    priceUnit: d.priceUnit,
                  }))}
                  viewerId={user?.id ?? null}
                  isRealUser={isRealUser}
                  returnPath={returnPath}
                  paymentsOffPlatform={effectiveOffPlatform}
                  {...(team || effRsvp ? { resultCode: team ?? effRsvp } : {})}
                />
              )}
            </div>
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
              divisions={event.divisions.map((d) => ({
                id: d.id,
                label: d.label,
                allowFreeAgents: d.allowFreeAgents,
              }))}
              isFreeAgent={event.isFreeAgent}
              viewerId={user?.id ?? null}
              isRealUser={isRealUser}
              returnPath={returnPath}
              {...(fa ? { resultCode: fa } : {})}
            />
          }
        />
      </SignupSection>
    );
  }

  if (signupsOpen && event.type === 'league') {
    // Leagues are roster-only by invariant — every division uses roster team
    // registration (ADR P1 #1). Captains register a persistent team for the
    // season; a division may also accept free agents (the `allowFreeAgents`
    // column is meaningful for leagues). No ad-hoc path here. Registration
    // writes the same `event_team_entries` (source='roster') rows the
    // /schedule page reads, so a registered team appears on the slate.
    const rosterDivisions = event.divisions.filter((d) => d.teamRegistrationMode === 'roster');
    const teamCount = event.teams.length;
    const freeAgentCount = event.freeAgents.length;
    const freeAgentEnabled = event.divisions.some((d) => d.allowFreeAgents);
    const viewerRegistered = event.viewerCaptainedTeams.length > 0 || event.isFreeAgent;
    const openRegister = !viewerRegistered || Boolean(effRsvp || team || fa);
    return (
      <SignupSection
        title="Register"
        collapsible
        defaultOpen={openRegister}
        badge={{ tone: 'neutral', label: 'League' }}
        subline={
          freeAgentEnabled
            ? `${teamCount} ${teamCount === 1 ? 'team' : 'teams'} · ${freeAgentCount} free ${freeAgentCount === 1 ? 'agent' : 'agents'}`
            : `${teamCount} ${teamCount === 1 ? 'team' : 'teams'} registered`
        }
      >
        <TournamentRegisterPanel
          teamCount={teamCount}
          freeAgentCount={freeAgentCount}
          teamEnabled={rosterDivisions.length > 0}
          freeAgentEnabled={freeAgentEnabled}
          defaultMode={event.isFreeAgent ? 'free-agent' : 'team'}
          teamPanel={
            <TournamentSignupPanel
              eventId={event.id}
              teams={event.teams}
              viewerCaptainedTeams={event.viewerCaptainedTeams}
              divisions={rosterDivisions.map((d) => ({
                id: d.id,
                label: d.label,
                format: d.format,
                priceCents: d.priceCents,
                priceUnit: d.priceUnit,
              }))}
              viewerId={user?.id ?? null}
              isRealUser={isRealUser}
              returnPath={returnPath}
              paymentsOffPlatform={effectiveOffPlatform}
              heading="League teams"
              subheading="Register your team for the season."
              {...(team || effRsvp ? { resultCode: team ?? effRsvp } : {})}
            />
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
              divisions={event.divisions.map((d) => ({
                id: d.id,
                label: d.label,
                allowFreeAgents: d.allowFreeAgents,
              }))}
              isFreeAgent={event.isFreeAgent}
              viewerId={user?.id ?? null}
              isRealUser={isRealUser}
              returnPath={returnPath}
              {...(fa ? { resultCode: fa } : {})}
            />
          }
        />
      </SignupSection>
    );
  }

  return (
    <EventClosedState
      eventId={event.id}
      eventType={event.type}
      status={event.status}
      hasStarted={hasStarted}
      attendeeCount={event.attendeeCount}
      isHost={event.canManage}
    />
  );
}
