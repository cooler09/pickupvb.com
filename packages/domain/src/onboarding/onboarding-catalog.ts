/**
 * The code-defined catalog of onboarding steps — the single source of truth for
 * each step's identity (title / description / where it links) **and** its
 * completion rule (`isComplete`). Same shape as the badge catalog
 * (`badge-catalog.ts`): the threshold lives next to the copy so the rule stays a
 * pure one-liner and the whole "what's done?" decision is unit-testable.
 *
 * These are *computed* checklists, not badge grants — completing a step does not
 * mint a `user_badges` row (ADR 0035 decision 1: the trophy case holds athletic
 * accomplishments, not chores). The host track's reward, "First Whistle"
 * (`first-host`), is an existing badge granted on first publish; the checklist
 * surfaces the milestone rather than duplicating it.
 */
import type { HostOnboardingSnapshot, PlayerOnboardingSnapshot } from './onboarding-snapshot.js';

/**
 * One onboarding step, generic over the track's snapshot type `S`.
 *
 * `href` is a plain string (not a Next `Route`) so the domain stays
 * framework-free; the web layer casts it at the call site.
 */
export interface OnboardingStep<S> {
  /** Stable id (used as a React key and a future analytics event name). */
  readonly key: string;
  readonly title: string;
  readonly description: string;
  /** Where the step's CTA links. A plain app-relative path. */
  readonly href: string;
  /**
   * Optional steps are soft nudges: they show while the card is up but do **not**
   * keep it visible once every *required* step is done (ADR 0035 decision 3 —
   * this is what stops the card nagging a free-only host about Stripe forever).
   */
  readonly optional?: boolean;
  /** Pure earn predicate over the track snapshot. The whole rule — no SQL copy. */
  readonly isComplete: (snapshot: S) => boolean;
}

/** New-player onboarding (B1). Required: complete profile · join an event. */
export const PLAYER_ONBOARDING_STEPS: readonly OnboardingStep<PlayerOnboardingSnapshot>[] = [
  {
    key: 'complete-profile',
    title: 'Complete your profile',
    description: 'Add your home city and the positions you play',
    href: '/profile?edit=1#edit-profile',
    isComplete: (s) => s.hasHomeCity && s.positionCount >= 1,
  },
  {
    key: 'join-event',
    title: 'Join your first event',
    description: 'Pickup, leagues, and tournaments near you',
    href: '/events',
    isComplete: (s) => s.joinedEventCount >= 1,
  },
  {
    key: 'join-group',
    title: 'Join a group',
    description: 'Find your crew and see what they play next',
    href: '/groups',
    optional: true,
    isComplete: (s) => s.groupCount >= 1,
  },
  {
    key: 'send-message',
    title: 'Send your first message',
    description: 'Say hi to a player or your team',
    href: '/messages',
    optional: true,
    isComplete: (s) => s.messagesSent >= 1,
  },
];

/** New-host onboarding (B2). Required: create an event · publish it. */
export const HOST_ONBOARDING_STEPS: readonly OnboardingStep<HostOnboardingSnapshot>[] = [
  {
    key: 'create-event',
    title: 'Create your first event',
    description: 'Open play, a league, or a tournament',
    href: '/events/new',
    isComplete: (s) => s.eventsCreated >= 1,
  },
  {
    key: 'publish-event',
    title: 'Publish your event',
    description: 'Make it visible so players can sign up',
    href: '/events/new',
    isComplete: (s) => s.publishedEventCount >= 1,
  },
  {
    key: 'connect-stripe',
    title: 'Connect Stripe to get paid',
    description: 'Take ticket and registration payments',
    href: '/profile/billing',
    optional: true,
    isComplete: (s) => s.stripeChargesEnabled,
  },
];
