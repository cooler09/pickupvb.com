# Onboarding M1 funnel instrumentation — Phase 2, DB-free (2026-06-04)

## Context

Continuation of [the Phase-1 onboarding-checklists bundle](2026-06-04-bundle-onboarding-checklists.md).
Phase 1 shipped the player + host checklist cards and deferred **M1** (first-win
funnel instrumentation) to a Phase 2 that the ADR sketched as a
`compute_onboarding_stats` RPC + a `user_onboarding` persistence row +
reconcile-on-view firing — deferred because it needs a live DB and Docker was
down.

This bundle ships M1 **without any of that**. Two findings collapsed the scope.

## The two findings that made M1 DB-free

1. **The two first-win funnels M1 names already fire.** Tracing the capture sites:
   - player _signup → first RSVP_: `signup_completed`
     ([auth/callback/route.ts](../../apps/web/src/app/auth/callback/route.ts)) →
     `event_joined` ([event-analytics-mapper.ts](../../packages/application/src/analytics/event-analytics-mapper.ts))
   - host _signup → first publish_: `signup_completed` → `event_published`
     ([events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts))

   PostHog funnels dedupe per person, so "first" is implicit — both funnels are
   buildable in the PostHog UI today with zero new code.

2. **`connect-stripe` is already captured too.** The `account.updated` webhook
   handler ([lib/webhooks/connect.ts](../../apps/web/src/lib/webhooks/connect.ts))
   already fires `host_payout_setup_completed` whenever the account is
   charges-enabled — that _is_ the connect-stripe funnel marker.

So of the checklist's steps, only **`complete-profile`** and **`create-event`**
lacked a dedicated event. M1 reduced to instrumenting those two.

## What shipped

- **One typed taxonomy variant** `onboarding_step_completed { track, step }`
  added to [analytics-port.ts](../../packages/domain/src/shared/analytics-port.ts).
  Coarse enums only (no PII). The PostHog adapter passes `event.name` +
  `event.props` through generically, so no adapter change was needed. The `step`
  union is **narrowed to the two steps actually emitted** (`complete-profile` |
  `create-event`) — the taxonomy stays honest about what we fire.
- **`captureOnboardingStep(userId, track, step)`** — a fire-and-forget wrapper in
  [lib/onboarding.ts](../../apps/web/src/lib/onboarding.ts) over the consent-gated
  `analytics` facade (already error-swallowing, so no call-site try/catch needed).
- **Fired on the incomplete→complete transition at the mutation site** (the
  established `event_joined`/`event_published` pattern, not a profile-view diff):
  - `complete-profile`: the profile-update action reads prior state and fires only
    when a save first satisfies "home city + ≥1 position".
    [profile/actions.ts](../../apps/web/src/app/profile/actions.ts)
  - `create-event`: the create action fires only on the host's **first** event
    (count == 1 after insert).
    [events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts)

## Decisions

- **Reused existing events instead of a uniform `onboarding_step_completed` for
  every step.** Re-emitting `event_joined`/`event_published`/`host_payout_setup_completed`
  under a second event name would duplicate captures for marginal funnel
  convenience. The PostHog funnel combines the existing events + the two new step
  values; the mapping is documented in the ADR and the taxonomy comment.
- **Skipped `join-group` and `send-message`.** Both are _optional_ checklist steps
  with low funnel value, and clean instrumentation is disproportionately costly:
  `addGroupMember` is admin-or-self (actor ≠ the joining user, and "first group"
  needs a count), and `send-message` would mean a count query on **every** chat
  send. They still render on the card — just not in the funnel.
- **No RPC, no table, no Docker.** Transition detection lives at the mutation site
  (where old→new state is already on hand), which is where the existing funnel
  events already detect "first." This keeps Phase 2 fully quad-verifiable —
  important while Docker is down and `gen:types` can't run, so any new RPC/table
  would have broken `typecheck` against the generated `Database` type. Quad is
  green (typecheck/lint/test/build).

## Patterns observed

- **Before adding a persistence layer for "fire once on transition," check
  whether the mutation site already has old→new state.** It almost always does —
  that's why `event_joined`/`event_published` never needed a reconcile loop. The
  ADR's first instinct (a persisted `user_onboarding` row + profile-view diff)
  was the heavier shape; the funnel only needed the mutation-site signal PostHog
  already dedupes.

## Follow-ups

- **The RPC + `user_onboarding` persistence path** is now only justified by a
  feature that needs stored per-step state (a "you're 1 step away" nudge, or an
  exact once-per-step server reconcile) — deferred until then.
- Deploy-gated like the rest: the funnel events flow once this ships to dev/prod.
- Verify the two new step events land in PostHog after deploy (the existing
  funnel events are already proven in prod).
