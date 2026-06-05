# 0035. Onboarding checklists (player + host)

- **Status:** Accepted (Phase 1 implemented 2026-06-04 — computed checklists, no
  migration; Phase 2 **M1 funnel instrumentation** shipped 2026-06-04, also
  DB-free — see "Phase 2: M1"; the RPC/persistence path stays deferred)
- **Date:** 2026-06-04
- **Relates to:** [ADR 0031 — Gamification badges](0031-gamification-badges.md)
  (the "thresholds in TS, facts aggregated by infra" pattern this reuses, and the
  `first-host` / "First Whistle" badge that doubles as the host capstone reward),
  [docs/user-onboarding.md](../user-onboarding.md) (the idea backlog this graduates
  B1/B2 from), [docs/journal/2026-06-01-profile-onboarding.md](../journal/2026-06-01-profile-onboarding.md)
  (the PR-3 first-run "Get started" card this supersedes).

## Context

PickupVB has [two cold-start problems](../user-onboarding.md): a **new player**
needs to find a game and show up; a **new host** needs to create an event, get
paid, and publish. The backlog (B1/B2) calls for two **gamified checklists** that
"piggyback on the badges system." Today the only onboarding scaffolding is the
PR-3 "Get started" card on the profile hub — a static, non-tracked welcome that
appears only for a sparse-profile/zero-activity account and vanishes the instant
the user touches anything. It teaches, but it doesn't track progress, doesn't
cover the host track at all, and disappears too eagerly to guide a user _through_
the first few steps.

The badges architecture (ADR 0031) is the right shape to borrow: an earn rule is
a **pure predicate over a denormalised snapshot** (`badge-catalog.ts` →
`qualifies(stats)`), with the thresholds living in TypeScript and SQL doing only
the fact aggregation. We want the same "rules in TS, facts from data" split for
"is this onboarding step done?" — but **without minting a badge per step**.

## Decisions

1. **Checklists are a _computed read model_, not new `user_badges` rows.** Each
   step's "done" is a pure predicate over an onboarding snapshot, exactly like a
   badge `qualifies`. We deliberately do **not** grant a collector badge per
   completed step. ADR 0031's core tone decision is that the trophy case holds
   **athletic accomplishments** ("Won a tournament", "Showed up to 50 events"),
   not chores — "you filled in your profile" as a gold pill would cheapen the
   shelf next to Champion. The host track's natural reward, **"First Whistle"
   (`first-host`)**, already exists as a badge granted on first publish; the
   checklist surfaces it rather than duplicating it. Rejected alternative:
   one `onboarding-complete` capstone badge per track — still off-tone, and it
   needs the durable grant + reconcile plumbing for marginal delight.

2. **Step definitions + completion predicates live in `packages/domain/src/onboarding`.**
   A generic `OnboardingStep<S>` carries display (`title` / `description` /
   `href`) **and** the pure `isComplete(snapshot: S)` rule, mirroring
   `BadgeDefinition`. `href` is a plain `string` (not a Next `Route`) so the
   domain stays framework-free; the web layer casts at the call site.
   `progressFor(steps, snapshot)` is the whole "what's done?" decision and is the
   unit-tested spec (`onboarding-progress.test.ts`), just like `badge-rules.ts`.

3. **Required vs. optional steps gate card visibility — not a dismiss flag.**
   Each track splits into **required** steps (the ones that define "set up") and
   **optional** nudges. The card shows while the _required_ steps are incomplete
   and hides once they're all done; optional steps ride along as soft
   suggestions but never keep the card alive. This is what prevents the two
   failure modes the backlog warns about:
   - **No eternal nag.** A free-only host who never connects Stripe, or a player
     who never sends a message, still sees the card disappear once their required
     steps are done — Stripe / messaging are _optional_.
   - **No new persistence.** Because "hide" is derived from the required steps
     (not a stored "dismissed" boolean), Phase 1 needs **no migration and no new
     column** — it matches PR-3's "vanishes when done" philosophy with zero DB
     surface. (Player required: complete profile · join first event. Host
     required: create first event · publish it. Optional: join a group / send a
     message; connect Stripe.)

4. **Phase 1 sources the snapshot at the web boundary; no new RPC.** Unlike
   badges (which needed a `compute_player_badge_stats` SECURITY DEFINER RPC for
   cross-aggregate tournament facts), the onboarding facts are cheap, single-table
   counts (`events` by `host_id`/`status`, `event_participants` by `user_id`,
   `messages` by `sender_id`) plus values the profile hub already loads (profile
   fields, group memberships, `getHostStripeAccount`). A thin facade
   `apps/web/src/lib/onboarding.ts` aggregates them on the **admin client**
   (scoped strictly to the owner's `userId`) and runs the domain `progressFor`.
   Admin-client is the sanctioned path here for the same reason
   `SupabaseBadgeRepository.loadStats` uses it (AGENTS.md pitfall #8): this is a
   user computing **their own** derived stats across tables with no per-user
   authorization to delegate to RLS, and it dodges RLS gaps on the cross-table
   counts. The facade is **fail-quiet** (a thrown count degrades to a zeroed
   snapshot → the card just shows more open steps) so it can never break the hub
   render — same posture as `reconcileUserBadges`.

   This choice is deliberate given project state: the badges migrations aren't on
   a live DB yet, and Phase 1 ships **fully verifiable by `pnpm typecheck && lint
&& test && build`** with no Docker / migration dependency.

5. **Both cards live on the profile hub; player leads, host is intent-gated.**
   The player checklist replaces the PR-3 card in the same slot (above Quick
   actions). The host checklist renders only for a user showing **host intent**
   (has created an event, or has a charges-enabled Stripe account) so a pure
   player never sees a host setup card. Account-level host setup belongs on the
   account hub, not the per-event `…/manage` dashboard (which is scoped to one
   event and assumes the event already exists).

## Phase 2: M1 (shipped 2026-06-04, DB-free)

The Phase-1 deferral assumed M1 needed transition detection via a persisted
`user_onboarding` row + a `compute_onboarding_stats` RPC. Revisiting it surfaced
a cheaper truth: **most onboarding milestones already have a dedicated capture**,
and PostHog funnels dedupe per person so "first" is implicit. The two first-win
funnels M1 names are already buildable today from existing events:

- player _signup → first RSVP_: `signup_completed` → `event_joined`
- host _signup → first publish_: `signup_completed` → `event_published`

And `connect-stripe` maps to the existing `host_payout_setup_completed` (fired
from the `account.updated` webhook). So M1 reduced to instrumenting the **two
checklist steps without a dedicated event** — `complete-profile` and
`create-event` — with one new typed taxonomy variant `onboarding_step_completed
{ track, step }`, fired from each step's **mutation site on the
incomplete→complete transition** (the established `event_joined`/`event_published`
pattern), not a profile-view diff:

- `complete-profile` — fired from the profile-update action when a save first
  satisfies "home city + ≥1 position" (reads prior state to gate on the
  transition). [profile/actions.ts](../../apps/web/src/app/profile/actions.ts)
- `create-event` — fired from the create action only on the host's **first**
  event (count == 1). [events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts)

The two **optional** steps `join-group` / `send-message` are deliberately **not**
instrumented: low funnel value, and `send-message` would mean a count query on
every chat send. They still render on the card — they're just absent from the
funnel. This keeps Phase 2 **DB-free and fully quad-verifiable** (no Docker /
gen:types dependency), consistent with Phase 1's rationale.

## Still deferred

- **The RPC + `user_onboarding` persistence path** is only worth building when we
  want capabilities that genuinely need stored per-step state — a "you're 1 step
  away" nudge, or an exact once-per-step server-side reconcile. M1's funnel
  doesn't need it (PostHog dedupes), so it stays deferred until a nudge feature
  asks for it.
- **Host "first registration" payoff step** — a 3rd required host step ("get your
  first signup") needs a participants-across-the-host's-events count (a cross-join
  cleaner as an RPC); lands with the persistence path above.
- **E1 empty-state teaching + richer step copy / GIFs** (backlog E1/C1) remain
  open in [docs/user-onboarding.md](../user-onboarding.md).

## Consequences

New framework-free domain module `packages/domain/src/onboarding` (snapshot
types, a generic step catalog, `progressFor`, exhaustive unit test), a web facade
`apps/web/src/lib/onboarding.ts`, and a server `OnboardingChecklist` component on
the profile hub replacing the PR-3 "Get started" card. Adding or retiring a step
is a one-line catalog edit + a snapshot field; promoting B1/B2 to an instrumented
funnel is the Phase-2 RPC. No schema change, no new Stripe/RLS surface.
