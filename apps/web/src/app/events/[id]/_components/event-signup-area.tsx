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
    return (
      <SignupSection
        title="Sign up"
        badge={
          paid && breakdown ? { tone: 'paid', label: priceLabel } : { tone: 'free', label: 'Free' }
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
            rsvp={rsvp}
            rsvpMsg={rsvpMsg}
          />
        ) : (
          <RsvpPanel
            eventId={event.id}
            eventTitle={event.title}
            isAttending={event.isAttending}
            isRealUser={isRealUser}
            rsvp={rsvp}
            rsvpMsg={rsvpMsg}
          />
        )}
      </SignupSection>
    );
  }

  if (signupsOpen && event.type === 'tournament') {
    return (
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
                paymentsOffPlatform={effectiveOffPlatform}
                {...(rsvp ? { resultCode: rsvp } : {})}
                {...(rsvpMsg ? { resultMsg: rsvpMsg } : {})}
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
                paymentsOffPlatform={effectiveOffPlatform}
                {...(team || rsvp ? { resultCode: team ?? rsvp } : {})}
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
