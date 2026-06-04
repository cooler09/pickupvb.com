# Onboarding checklists, B1/B2 — Phase 1 (2026-06-04)

## Context

Graduates **B1 + B2** from the [user-onboarding idea backlog](../user-onboarding.md)
into a built feature — the backlog's stated recommended starting point. The only
onboarding scaffolding before this was the PR-3 "Get started" card
([profile-onboarding journal](2026-06-01-profile-onboarding.md)): a static,
non-tracked welcome that showed only for a sparse-profile/zero-activity account
and vanished the instant the user touched anything. It taught, but didn't track
progress, ignored the host track entirely, and disappeared too eagerly to guide a
user _through_ the first steps.

Design + decisions are recorded in [ADR 0035](../adr/0035-onboarding-checklists.md).
The short version: **computed checklists that reuse the badges _pattern_
(thresholds in TS, facts from data) without minting a badge per step.**

## What shipped (Phase 1)

A new framework-free domain module `packages/domain/src/onboarding` and a
profile-hub surface:

- **`onboarding-catalog.ts`** — a generic `OnboardingStep<S>` carrying display
  (`title`/`description`/`href`) **and** a pure `isComplete(snapshot)` rule, same
  shape as `badge-catalog.ts`. Two tracks: `PLAYER_ONBOARDING_STEPS` (complete
  profile · join an event · [optional] join a group / send a message) and
  `HOST_ONBOARDING_STEPS` (create an event · publish it · [optional] connect
  Stripe). `href` is a plain string so the domain stays framework-free.
- **`onboarding-progress.ts`** — `progressFor(steps, snapshot)`: the whole
  "what's done, and should the card still show?" decision, returning per-step
  status plus the required-vs-optional rollup. Unit-tested in
  `onboarding-progress.test.ts` (8 cases).
- **`apps/web/src/lib/onboarding.ts`** — fail-quiet facade that builds each
  snapshot (cheap admin-client counts on `events` / `event_participants` /
  `messages`, scoped to the owner's id) and runs the domain rules. Mirrors the
  `badges.ts` facade-over-port shape.
- **`profile/_components/onboarding-checklist.tsx`** — a server component
  rendering the tinted card with a "N of M done" line, check-marked completed
  rows, and tappable open rows. Replaces the inline PR-3 `GetStartedStep`.
- **`profile/page.tsx`** — loads both tracks in parallel; renders the player card
  when its required steps aren't done, and the host card when the viewer shows
  host intent and its required steps aren't done.

## Key decisions (why it looks like this)

- **No badge per step.** ADR 0031's tone rule is that the trophy case holds
  athletic accomplishments, not chores — a gold "you filled your profile" pill
  next to Champion cheapens the shelf. The host capstone reward, "First Whistle"
  (`first-host`), already exists as a real badge on first publish; the checklist
  surfaces the milestone rather than duplicating it.
- **Required-vs-optional gates visibility, not a stored `dismissed` flag.** The
  card shows while _required_ steps are open and hides when they're done; optional
  steps ride along but never keep it alive. This is what avoids the two backlog
  failure modes — **no eternal nag** (a free-only host who never connects Stripe,
  or a player who never messages, still sees the card disappear once required
  steps are done, because those are optional) and **no new persistence** (hide is
  derived, so Phase 1 needs no migration / column). Same "vanishes when done"
  philosophy as PR-3, now progress-aware.
- **No new RPC/migration — sourced at the web boundary.** Unlike badges (which
  needed `compute_player_badge_stats` for cross-aggregate tournament facts), the
  onboarding facts are cheap single-table counts. Deliberate given project state:
  the badges migrations aren't on a live DB yet, so Phase 1 ships **fully
  verifiable by the quad** with no Docker dependency. Quad is green
  (typecheck/lint/test/build).

## Patterns observed

- **The badge "rules in TS, facts in a snapshot" split generalises cleanly to any
  computed read model.** Onboarding reused it verbatim (generic over the snapshot
  type) and got a pure, unit-tested rule + a thin fail-quiet facade with zero new
  domain plumbing. Worth reaching for the next time a feature is "derive a
  boolean/threshold from data across a few tables."

## Follow-ups (Phase 2, deferred in ADR 0035)

- **M1 — first-win funnel instrumentation.** Firing a PostHog "step completed"
  event needs transition detection, which needs prior state persisted per user.
  That's the moment to add a `compute_onboarding_stats` RPC + a small
  `user_onboarding` row + reconcile-on-view (mirroring the badge reconcile), so
  the snapshot, the funnel events, and a future "you're 1 step away" nudge share
  one source. Needs live-DB verification — deferred so Phase 1 stays DB-free.
- **Host "first registration" payoff step** — a 3rd required host step needs a
  participants-across-the-host's-events count (cleaner as the Phase-2 RPC).
- **E1 empty-state teaching** + richer step copy / GIFs remain open in the
  [backlog](../user-onboarding.md).
