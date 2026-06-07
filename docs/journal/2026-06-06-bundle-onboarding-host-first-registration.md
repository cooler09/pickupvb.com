# Onboarding: host "first registration" payoff step (2026-06-06)

## Context

Final quick-win of the "wrap up outstanding items" plan. The host onboarding
track (ADR 0035 / B2) ended at "publish your event" — there was no step
celebrating the payoff, the first time a player signs up. The
[onboarding initiative memory] listed this as deferred; this lands it.

## Decisions

- **Optional, not required.** The first signup almost always arrives _after_ the
  host publishes — by which point the two required steps (create + publish) are
  done and the card has hidden (ADR 0035 decision 3). A required step keyed on
  player behaviour the host can't control would nag forever on an event with no
  signups yet. As an optional step it surfaces the milestone as a "what's next"
  while a host is still mid-onboarding, and never keeps the card alive. (The
  honest caveat: it will rarely be _seen_ as complete-in-card — documented, not
  a bug.)
- **Excludes the host's own RSVP.** Open-play hosts often add themselves, so the
  count filters `user_id != host` — the payoff means a _genuine external_
  signup, not the host's own attendance.
- **DB-free in the sense that matters: no new migration/table.** The fact is one
  more admin-client count in the existing `loadHostOnboarding` facade (an
  `event_participants !inner events` join filtered to the host's events). The
  domain stays pure — just a snapshot field + a one-line `isComplete`, mirroring
  the existing `connect-stripe` optional step.
- **Links to `/profile#hosted`** — the host's own hosted-events section on the
  hub, where they can view/share the event. No event id is available in the
  static catalog, so the section anchor is the closest actionable target.

## Changes

- `packages/domain/src/onboarding/onboarding-snapshot.ts` —
  `firstRegistrationReceived` field + zeroed in `emptyHostOnboardingSnapshot`.
- `packages/domain/src/onboarding/onboarding-catalog.ts` — optional
  `first-registration` step after `publish-event`.
- `apps/web/src/lib/onboarding.ts` — third count in `loadHostOnboarding`
  (non-host attendee on any of the host's events).
- `packages/domain/src/onboarding/onboarding-progress.test.ts` — +1 test: the
  step is optional, tracks the flag, and never enters the required rollup.

## Patterns observed

- **A "payoff" milestone fits the optional slot, not the required one.** The
  required set is the host's own controllable actions (create / publish);
  anything gated on someone else's behaviour belongs in the optional, non-nag
  tier. Same shape as `connect-stripe` (gated on Stripe, not a chore).

## Follow-ups

- If a future nudge wants to actually _celebrate_ the first registration (a
  toast / email when it lands, rather than a checklist tick the user may never
  see), that's the `compute_onboarding_stats` RPC + persistence path still
  deferred in the onboarding initiative — out of scope for a DB-free step.
