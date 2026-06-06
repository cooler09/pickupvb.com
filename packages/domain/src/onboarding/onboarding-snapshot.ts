/**
 * The pure, denormalised facts the onboarding-step rules consume — one snapshot
 * per track (player / host).
 *
 * Mirrors `PlayerBadgeStats` (badges/ADR 0031): the step `isComplete` predicates
 * in `onboarding-catalog.ts` stay pure and unit-testable, while the
 * infrastructure / web boundary does the counting once and hands the rules a flat
 * snapshot. Keeping the thresholds in TS (the catalog) means there is no second
 * copy of "what counts as done" anywhere else.
 *
 * Every count is derived from a real action (an RSVP row, a sent message, a
 * published event), never a transient intent, so a step never flips back to
 * incomplete once truly done.
 */

/** Facts for the new-player onboarding track (B1). */
export interface PlayerOnboardingSnapshot {
  /** Profile has a home city set. */
  hasHomeCity: boolean;
  /** Number of playing positions the user has listed (0–3). */
  positionCount: number;
  /** Distinct events the user has joined (RSVP'd), past or upcoming. */
  joinedEventCount: number;
  /** Groups the user is a member of. */
  groupCount: number;
  /** Chat messages the user has sent. */
  messagesSent: number;
}

/** Facts for the new-host onboarding track (B2). */
export interface HostOnboardingSnapshot {
  /** Events the user has created (any status). */
  eventsCreated: number;
  /** Events the user has created that are published (visible to players). */
  publishedEventCount: number;
  /** The host's Stripe Connect account exists and can take charges. */
  stripeChargesEnabled: boolean;
  /**
   * At least one *other* player has registered for one of the host's events —
   * the payoff that closes the loop on the host track. Excludes the host's own
   * RSVP so it means a genuine external signup.
   */
  firstRegistrationReceived: boolean;
}

/** A zeroed player snapshot — the baseline a brand-new account reconciles against. */
export const emptyPlayerOnboardingSnapshot = (): PlayerOnboardingSnapshot => ({
  hasHomeCity: false,
  positionCount: 0,
  joinedEventCount: 0,
  groupCount: 0,
  messagesSent: 0,
});

/** A zeroed host snapshot. */
export const emptyHostOnboardingSnapshot = (): HostOnboardingSnapshot => ({
  eventsCreated: 0,
  publishedEventCount: 0,
  stripeChargesEnabled: false,
  firstRegistrationReceived: false,
});
