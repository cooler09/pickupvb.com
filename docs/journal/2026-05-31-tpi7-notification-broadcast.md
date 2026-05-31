# TPI-7 — notification bell off `postgres_changes`, onto Realtime Broadcast (2026-05-31)

## Context

Third-party-integrations audit **TPI-7** (P2): the site-header notification bell
holds a per-tab Supabase Realtime `postgres_changes` subscription on
`notifications` — on _every logged-in page_. `postgres_changes` re-evaluates RLS
per subscriber per change on one replication stream (the path Supabase says not
to scale on), and concurrent connections track concurrent tabs. Graded the single
biggest concurrent-connection lever before launch. Design + decisions in
[ADR 0027](../adr/0027-realtime-broadcast-notifications.md).

## Decisions

- **Discovery reframed the fix.** `public.notifications` is in **no
  `supabase_realtime` publication** (verified across all migrations — the
  publication adds are events/brackets/teams/`match_live_scores`, never
  `notifications`). `postgres_changes` requires publication membership, so the
  bell's live updates were **inert** in any migration-provisioned DB (only the
  server-rendered snapshot showed). So Broadcast isn't just a scaling swap — it
  _makes the feature work_. (ADR 0026 already assumed the in-app channel was
  "Realtime-delivered"; this makes that true.)
- **Broadcast from the database, not client broadcast.** Unlike the scoreboard
  ([use-scoreboard-sync.ts](../../apps/web/src/app/tools/scoreboard/_lib/use-scoreboard-sync.ts),
  ephemeral peer-to-peer on a public channel), notifications originate from a
  server insert, so a DB `AFTER INSERT` trigger emits via
  `realtime.broadcast_changes(...)` to a **private** per-user topic
  `notifications:{user_id}`, authorized by a `realtime.messages` SELECT policy.
- **Scope = bell only.** `match_live_scores` stays on `postgres_changes` — its
  [migration](../../supabase/migrations/20260815000000_match_live_scores.sql#L20-L28)
  documents that choice, and it's event-scoped (Pro-host pages only). The bracket
  watchers are event-scoped too. The bell is the only _every-page_ driver.
- **Stable topic + `cancelled` guard, not a random topic suffix.** The old code
  used a random per-mount topic to dodge the strict-mode double-mount error. The
  topic must now be exactly `notifications:{userId}` for the RLS match, so the
  double-mount is handled by deferring channel creation behind an async
  `getSession()`/`setAuth()` + a `cancelled` flag (same shape as
  `live-scores-provider`).
- **Marked "pending live verification," not "resolved."** The verify quad
  (typecheck/lint/test/build) can't exercise realtime + RLS + the trigger, and
  Docker/local Supabase was down, so the migration SQL wasn't executed. Honest
  handoff: it needs a dev round-trip first.

## Changes

- **New** `supabase/migrations/20260823000000_notification_broadcast.sql` —
  `public.broadcast_notification()` (SECURITY DEFINER, `search_path=''`) + `AFTER
INSERT` trigger on `public.notifications`; `realtime.messages` SELECT policy
  (`realtime.topic() = 'notifications:'||auth.uid()`).
- **New** `docs/adr/0027-realtime-broadcast-notifications.md` (Proposed) +
  `docs/adr/README.md` index row.
- `apps/web/src/components/notification-bell.tsx` — subscription effect rewired
  from `postgres_changes` to a `{ private: true }` Broadcast channel +
  `realtime.setAuth(session.access_token)`; reads the new row from
  `payload.record` (snake_case keys, unchanged `NotificationRow` shape).
- Audit + index + this journal.

Verify quad green (web 90 tests; lint 0 errors; build 8/8) — covers the client
typecheck/build only.

## Verification owed (before flipping to "resolved")

1. `supabase start` + `pnpm db:migrate` (or deploy to dev) so the trigger + policy
   exist.
2. Logged in, trigger a notification to that user (a follow, or an event signup
   that fans out in_app) → bell badge increments **live**, no refresh; WS frames
   show a `broadcast` message on `notifications:{userId}`.
3. A _different_ user does **not** receive it (topic isolation via the RLS policy).

If the private-channel auth is misconfigured it degrades gracefully — the bell
just stops live-updating; notifications still persist and render on next load.

## Follow-ups

- Tab-visibility gating (drop the channel when `document.hidden`) to shed idle
  connections.
- An e2e asserting live delivery, run green against dev.
- Remaining audit P2: TPI-1 + TPI-3 (OSM geocoding + tiles → MapTiler).
