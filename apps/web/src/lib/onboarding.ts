import 'server-only';
import {
  HOST_ONBOARDING_STEPS,
  PLAYER_ONBOARDING_STEPS,
  progressFor,
  type ChecklistProgress,
  type HostOnboardingSnapshot,
  type OnboardingStepCompletedProps,
  type PlayerOnboardingSnapshot,
} from '@pickupvb/domain';
import { getAdminSupabase } from './supabase-admin';
import { analytics } from './analytics';

/**
 * Onboarding-checklist facade (ADR 0035, Phase 1). Builds the two track
 * snapshots and runs the pure domain `progressFor` rules, so the profile hub
 * stays a thin orchestrator. Mirrors the `badges.ts` facade-over-port shape
 * (AGENTS.md pattern #10): there is no aggregate invariant — the only logic is
 * the pure `progressFor`, reused directly here.
 *
 * Why the admin client: this aggregates a user's *own* derived stats across
 * several tables (events / participants / messages) by their `userId`. It is the
 * same sanctioned system-read case as `SupabaseBadgeRepository.loadStats` — there
 * is no per-user authorization to delegate to RLS, and scoping every count to the
 * owner's id keeps it safe (AGENTS.md pitfall #8). Reads only; never writes.
 *
 * Every loader is **fail-quiet**: a thrown count degrades to a zeroed snapshot
 * (the card simply shows more open steps) so onboarding can never break the hub
 * render — same posture as `reconcileUserBadges`.
 */

/** Facts the caller already has on hand, so the facade only does the extra counts. */
export interface PlayerOnboardingInputs {
  hasHomeCity: boolean;
  positionCount: number;
  /** Group memberships the page already loaded. */
  groupCount: number;
}

/**
 * Build the player track snapshot + progress. Extra counts (events joined,
 * messages sent) run on the admin client, scoped to `userId`.
 */
export async function loadPlayerOnboarding(
  userId: string,
  inputs: PlayerOnboardingInputs,
): Promise<ChecklistProgress> {
  const snapshot: PlayerOnboardingSnapshot = {
    hasHomeCity: inputs.hasHomeCity,
    positionCount: inputs.positionCount,
    groupCount: inputs.groupCount,
    joinedEventCount: 0,
    messagesSent: 0,
  };
  try {
    const admin = getAdminSupabase();
    const [joined, messages] = await Promise.all([
      admin
        .from('event_participants')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('role', 'attendee'),
      admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', userId)
        .is('deleted_at', null),
    ]);
    snapshot.joinedEventCount = joined.count ?? 0;
    snapshot.messagesSent = messages.count ?? 0;
  } catch {
    // Fail-quiet: keep the zeroed extra counts (card shows the steps as open).
  }
  return progressFor(PLAYER_ONBOARDING_STEPS, snapshot);
}

/** Facts the caller already has on hand for the host track. */
export interface HostOnboardingInputs {
  /** The host's Stripe Connect account exists and can take charges. */
  stripeChargesEnabled: boolean;
}

/** The host track progress plus whether the viewer shows any host intent. */
export interface HostOnboardingResult {
  progress: ChecklistProgress;
  /** Created an event or is charges-enabled — gates whether the host card renders. */
  hasHostIntent: boolean;
}

/**
 * Build the host track snapshot + progress. Counts created / published events on
 * the admin client, scoped to `host_id = userId`.
 */
export async function loadHostOnboarding(
  userId: string,
  inputs: HostOnboardingInputs,
): Promise<HostOnboardingResult> {
  const snapshot: HostOnboardingSnapshot = {
    eventsCreated: 0,
    publishedEventCount: 0,
    stripeChargesEnabled: inputs.stripeChargesEnabled,
    firstRegistrationReceived: false,
  };
  try {
    const admin = getAdminSupabase();
    const [created, published, registrations] = await Promise.all([
      admin.from('events').select('id', { count: 'exact', head: true }).eq('host_id', userId),
      admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('host_id', userId)
        .eq('status', 'published'),
      // A *non-host* attendee on any of the host's events. `!inner` filters on
      // the joined event's host_id; `neq user_id` drops the host's own RSVP so
      // the payoff means a genuine external signup.
      admin
        .from('event_participants')
        .select('id, events!inner(host_id)', { count: 'exact', head: true })
        .eq('events.host_id', userId)
        .eq('role', 'attendee')
        .neq('user_id', userId),
    ]);
    snapshot.eventsCreated = created.count ?? 0;
    snapshot.publishedEventCount = published.count ?? 0;
    snapshot.firstRegistrationReceived = (registrations.count ?? 0) >= 1;
  } catch {
    // Fail-quiet: keep the zeroed counts.
  }
  return {
    progress: progressFor(HOST_ONBOARDING_STEPS, snapshot),
    hasHostIntent: snapshot.eventsCreated > 0 || snapshot.stripeChargesEnabled,
  };
}

/**
 * Fire the M1 onboarding funnel event for a step the user just completed (ADR
 * 0035 Phase 2). Call from the step's mutation site **only on the
 * incomplete→complete transition** so the per-step funnel stays clean. Only the
 * two steps without a dedicated event flow through here (`complete-profile`,
 * `create-event`); `join-event` / `publish-event` / `connect-stripe` are already
 * covered by `event_joined` / `event_published` / `host_payout_setup_completed`.
 *
 * `analytics.capture` is already consent-gated, fire-and-forget, and
 * error-swallowing (the adapter never throws), so this can't break the calling
 * mutation — no try/catch needed at the call site.
 */
export function captureOnboardingStep(
  userId: string,
  track: OnboardingStepCompletedProps['track'],
  step: OnboardingStepCompletedProps['step'],
): void {
  analytics.capture({ name: 'onboarding_step_completed', props: { track, step } }, userId);
}
