# 2026-06-02 — Gamification: collector badges, achievements & host event badges

**Bundle:** new `badges` domain module + application reconcile handler + infra
adapter + two migrations + web trophy case, Pro host panel, and one easter egg.
See [ADR 0031](../adr/0031-gamification-badges.md).

## Why

Zachary asked to evaluate gamifying the site — collector badges tied to
achievements, host-added event badges as a Pro feature, and easter eggs — and
whether it helps or detracts. Verdict was "yes, scoped": volleyball is already
about real accomplishment, and the architecture was unusually ready (the
analytics outbox already drains the exact domain events an achievement engine
needs; the Pro rail, badge visual, child-entity pattern, and upload/moderation/
orphan-sweep machinery all existed). The tone risk on a payments product is real,
so we reward accomplishments + attendance milestones (not clicks), keep the look
athletic, and treat easter eggs as one tasteful one-off — not a framework.

## What shipped (all 3 phases, 4 verify gates green)

- **Phase 1 — player achievements.** Code-defined catalog + pure `badgesForStats`
  rules (`packages/domain/src/badges`, with `badge-rules.test.ts` as the
  executable spec), `ReconcileUserBadgesHandler`, `SupabaseBadgeRepository`,
  `user_badges` table + `user_badges_public` definer view + a
  `compute_player_badge_stats` aggregation RPC. Trophy case on the profile +
  public player page; a one-time unlock toast.
- **Phase 2 — host event badges (Pro).** `event_badges` child entity + `event-badges`
  storage bucket + orphan-sweep, a Pro-gated host panel (label hard-blocked via
  `assertCleanName`, description masked via `maskPublicText`), and on_attend
  auto-grant (`grant_attended_event_badges`). Host grants reuse `user_badges`
  (`source='host'`) so the trophy case renders them with no parallel table.
- **Phase 3 — easter egg.** A hidden Konami-code listener on the profile grants
  the "Secret Set" badge.

## Decisions that diverged from the approved plan (and why)

1. **Reconcile-from-a-stats-snapshot, not synchronous per-handler grants.** While
   wiring it I found `event.publish()` fires inside `CreateEventHandler` where the
   analytics outbox _already_ drains `pullEvents()` — a second draining dispatch
   would see an empty buffer. And Champion/Podium need bracket→roster joins the
   aggregate can't resolve at command time. So the rules run over a snapshot from
   a `SECURITY DEFINER` aggregation RPC; thresholds stay in TS (no SQL copy to
   drift), grants are idempotent, and reconciliation is triggered on-profile-view
   - by cron. This is _more_ faithful to the onion architecture than the original
     sketch.
2. **Host grants fold into `user_badges`** instead of a parallel `event_badge_grants`
   table — reuses the entire Phase-1 read/display/public-view path.
3. **Deferred the tournament/league-derived badges** (Champion/Podium/Seasoned):
   their stats return 0 until the result schema is verified against a live DB, so
   we never mis-award a high-visibility badge off untested join SQL. They show as
   locked teasers meanwhile.

## Patterns surfaced

- **Hand-added generated Supabase types as a no-Docker bridge.** Docker wasn't
  running, so `pnpm db:migrate && gen:types` couldn't run. I hand-added the new
  tables/view/functions to `database.types.ts` so typecheck/build stay green; a
  later `gen:types` against the applied migrations regenerates them identically.
- The host-badge feature is a near-clone of the **sponsor slot** (Pro-gated,
  event child, upload, flash-param actions, orphan-sweep) — the cheapest way to
  add a new host UGC capability is to clone that shape.

## Follow-ups for the next agent

- **Apply the migrations against a live DB** (`pnpm db:migrate` + `gen:types`),
  then verify the loop end-to-end: attend a past event → badge on profile +
  public page; unlock toast fires once; second trigger doesn't double-grant.
  None of the SQL (stats RPC, on_attend grant, orphan-sweep) has run yet.
- **Wire the badge reconcile cron** in the deploy's cron config (route exists at
  `/api/badges/reconcile`, `CRON_SECRET`-guarded).
- **Fill the deferred stats** (tournament_championships / \_podiums /
  leagues_completed) in a follow-up migration once the bracket/league result
  schema is confirmed.
- Optional: event-page "badges you can earn here" teaser, manual `host_grant`
  awards, free-tier à-la-carte unlock.
