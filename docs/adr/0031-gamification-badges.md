# 0031. Gamification — collector badges & achievements

- **Status:** Accepted (Phase 1 + 2 + 3 implemented 2026-06-02; Champion +
  Seasoned stats filled 2026-06-02 via `20260904000000_badge_tournament_stats.sql`
  — see "Deferred")
- **Date:** 2026-06-02
- **Relates to:** [ADR 0030 — Content moderation](0030-content-moderation-profanity.md)
  (host-badge label/description run through the same `assertCleanName` /
  `maskPublicText` chokepoints), [ADR 0024 — Event & profile media](0024-event-and-profile-media.md)
  (the Pro-gated, host-authored, orphan-swept UGC + storage template the host
  badges follow, via the sponsor slot), [the analytics outbox](../../packages/application/src/analytics/dispatch-outbox.ts)
  (the domain-event backbone an achievement engine would normally need — already
  built).

## Context

We want to gamify the product with **collector badges tied to achievements**,
**host-authored event badges as a Pro feature**, and a sprinkle of **easter
eggs** — without undercutting a product that handles real money (paid tickets,
payouts, tournaments). The risk is tone: Duolingo-style streaks read as
patronizing to adults organizing a $40/head tournament. The mitigation is to
reward **real accomplishments + attendance milestones** (not clicks), keep the
visual language athletic, and treat easter eggs as one or two tasteful one-offs.

The architecture was already well-positioned: aggregates emit the exact domain
events an achievement engine needs, drained through a post-`save()` outbox; the
badge _visual_ (Pro/Admin pills), the Pro rail (`hasProBenefits`), the
child-entity-of-event pattern (event divisions / sponsors), and the
upload + moderation + orphan-sweep machinery all existed.

## Decisions

1. **System badges are a code-defined catalog, not DB rows.** The catalog
   ([badge-catalog.ts](../../packages/domain/src/badges/badge-catalog.ts)) owns
   each badge's identity _and_ its earn rule (`qualifies`). Grants are DB rows.
   Host badges _are_ DB rows because they're user-authored.

2. **Thresholds live in TypeScript; SQL only aggregates.** Rather than the plan's
   "grant synchronously in each command handler", reconciliation pulls a
   `PlayerBadgeStats` snapshot from a `SECURITY DEFINER` aggregation RPC
   (`compute_player_badge_stats`) and runs the pure `badgesForStats` rules over
   it. This avoids (a) a fragile `pullEvents()` fan-out (the analytics outbox
   already drains it), and (b) a second copy of the thresholds in a SQL
   reconciler. It also dodged the real blocker: bracket/league "who won" needs
   multi-table joins the aggregate can't resolve at command time.

3. **Durable, idempotent grants — never the fail-quiet analytics outbox.**
   Grants are `insert … on conflict (user_id, badge_key) do nothing`. Triggered
   by **reconcile-on-own-profile-view** (instant for the actor + the unlock
   toast) plus a **cron** (`/api/badges/reconcile`) for recently-active players.

4. **Anti-gaming by construction.** Milestones count _attended_ events
   (`role='attendee'`, past, non-cancelled) — a join-then-leave never inflates a
   count.

5. **Host badges reuse the Phase-1 store.** A host-badge grant is a `user_badges`
   row with `source='host'`, `badge_key=<event_badge id>`, snapshotting
   label/icon into `context` — so the whole Phase-1 read path (trophy case,
   `user_badges_public`) renders them with no parallel table. `on_attend` badges
   are granted by `grant_attended_event_badges(uuid)` from the same reconcile
   path.

6. **Privacy.** Other viewers read only `user_badges_public` (definer view, hides
   `hidden` badges + soft-deleted accounts); owner toggles visibility through
   `set_user_badge_hidden`.

## Deferred

- **Champion + Seasoned stats are now filled** (`20260904000000`) from the
  authoritative, host-recorded source — `event_divisions.winner_entry_id` for the
  champion (resolved to players via captain / `event_team_entry_members` / active
  `team_members`), and league participation × finished league for Seasoned —
  rather than fragile bracket-match topology. **Still needs a live-DB run to
  confirm the joins** (no Docker in the authoring session).
- **True Podium landed** (`20260906000000`): `event_divisions` gained
  `runner_up_entry_id` + `third_place_entry_id`, the host division-podium panel
  records all three places, `DivisionLite` exposes `runnerUp` / `thirdPlace` (and
  the public divisions section renders 🥇🥈🥉), and `tournament_podiums` now counts
  divisions where the player placed 1st **or** 2nd **or** 3rd (Champion stays
  winner-only). Replaces the earlier "Podium = Champion" placeholder.
- **Landed 2026-06-02:** the event-page "Badges you can earn here" teaser
  (on_attend badges), the **manual `host_grant` award flow** (host panel on the
  manage dashboard → `award-badge-actions.ts`), a **`badge.earned` in-app
  notification** (fired from the system reconcile, the easter egg, and manual
  awards), and the **reconcile cron** (`20260905000000`, pg_cron + pg_net →
  `/api/badges/reconcile`, inert until the `badge_reconcile_url` Vault secret is
  seeded — same activation pattern as the notification worker).
- **Free-tier à-la-carte unlock landed** (`20260907000000`): a free host can pay
  a one-time $5 to unlock badge authoring for one event. New `event_badge_access`
  table (per-event), a `badge_slot` Stripe checkout (`startBadgeSlotCheckoutFromForm`)
  whose webhook writes the access row via `EventPaymentRepository.unlockBadgeSlot`,
  and the panel gate `canUseBadges = hasProBenefits(host) OR paid`. Mirrors the
  sponsor-slot à-la-carte path.
- **Still open:** on_attend host grants are SQL-only, so they don't fire the
  `badge.earned` notification (the system + manual + easter-egg paths do).

## Consequences

New domain module `packages/domain/src/badges`, application
`ReconcileUserBadgesHandler`, infra `SupabaseBadgeRepository`, migrations
`20260902000000_user_badges.sql` + `20260903000000_event_badges.sql`, and the
web trophy case + Pro host panel. Adding a system badge is a catalog entry + a
threshold + (if it needs a new fact) one column in the stats RPC.
