# Privacy re-audit: post-feature-sweep fixes #16–#19 (2026-06-07)

## Context

A privacy re-audit scoped to everything shipped since the 2026-05-31 re-audit
(migrations `20260901`→`20260919`: profiles geo, badges, walk-in roster teams on
leagues, capacity waitlist, room-message fan-out, media posts/votes, broadcast
notifications). The 2026-05-31 backlog was empty; the sweep found four new
findings, all fixed in this bundle. Backlog + per-finding detail:
[docs/audits/privacy.md](../audits/privacy.md) #16–#19 (and the 2026-06-07
status-update block).

## Decisions

- **#16 (P1) — `captain_phone` leak: column-level GRANT, not RLS tightening.**
  The walk-in/host-added team feature stores an account-less captain's phone on
  `event_team_entries`, whose row policy is `using (deleted_at is null)` —
  readable by anon+authenticated, so a bare REST call harvests every captain's
  phone (the page render was already safe; this was the same residual the P1 #5
  email fix closed for the _members_ table but not the _entries_ table). Chose a
  **column-level `revoke select` + re-`grant select (safe cols)`** over tightening
  the row policy to captain/host/self, because many user-scoped reads of
  `event_team_entries` legitimately rely on the permissive row policy for
  `display_name`/`source`/`captain_id` (bracket, schedule, league, free-agent),
  and tightening rows would break them. The column grant is surgical: it only
  removes `captain_phone` from anon/authenticated, and both real readers
  (`loadAdHocRowsCached`, `SupabaseEventTeamRegistrationRepository`) run on the
  service-role admin client, so nothing app-side changes. Verified no user-scoped
  read selects `captain_phone` or uses `select('*')` on the table first.
- **#17 (P2) — round coords in the view, cast back to `double precision`.**
  `profiles_public` published rooftop-precise geocoded coords to anon. Chose
  `round(latitude::numeric, 2)::double precision` **in the view** over (a) a
  `share_location` opt-out column or (b) fuzzing at write time. Rounding in the
  view bounds precision to ~1.1 km regardless of what the user typed into the
  free-text `home_city`, keeps full precision on the owner-only base row, and —
  by casting back to `double precision` — leaves the view column type (and the
  generated type) unchanged, so it's a zero-app-churn, zero-`gen:types` fix. The
  directory's bbox filter + JS haversine tolerate ~1 km. `share_location` is
  noted as a possible future hardening, not needed now.
- **#18 (P3) — extend the export, same shape.** Added the five missing
  owner-scoped tables to the existing `Promise.all` on the user-scoped client,
  reusing the throw-on-partial guard. No new mechanism.
- **#19 (P3) — purge, not a dropdown.** The initial filing assumed a freeform
  reason input; the live report UI is a one-click button that sends **no**
  `reason` (and the action already caps any future value at 500 chars). So a
  reason dropdown was **deliberately rejected** — it would start collecting
  reason text that isn't collected today, the opposite of data-minimization. The
  only live gap was retention, fixed by a 180-day `media_post_reports` purge
  beside the existing `community_listing_reports` purge in the same cron.

## Changes

- `supabase/migrations/20260920000000_event_team_entries_captain_phone_grant.sql`
  — new: column-level SELECT grant excluding `captain_phone` (#16).
- `supabase/migrations/20260921000000_profiles_public_round_coords.sql` — new:
  rebuild `profiles_public` with 2-decimal coords cast back to `double precision`
  (#17).
- `apps/web/src/app/api/account/export/route.ts` — +5 categories: `media_posts`,
  `media_post_votes`, `media_post_reports`, `user_badges`, `event_waitlist` (#18).
- `apps/web/src/app/api/notifications/outbox-purge/route.ts` — +180-day
  `media_post_reports` delete; response gains `media_reports` (#19).
- `docs/audits/privacy.md` + `docs/audits/README.md` — findings, statuses,
  remediation log, index row.

## Patterns observed

- **A narrow public view fixes the _members_ table but not the parent.** The
  collapse migration (`20260731000000`) gave `event_team_entry_members` a
  captain/host/self SELECT + a narrow `_public` view, but left the parent
  `event_team_entries` on the permissive `using (deleted_at is null)` row policy —
  and that parent is where the PII column (`captain_phone`) moved. When tightening
  one table in a parent/child pair, re-check that PII didn't migrate to the side
  you left permissive. Column-level GRANT is the low-blast-radius tool when the
  row policy must stay permissive for unrelated reads.
- **Geocoding a free-text field publishes whatever the user typed.** `home_city`
  is display copy, but feeding it to a rooftop geocoder and exposing the result
  to anon turns a city label into a precise location. Round at the view boundary.
- **"Add a categorization dropdown" can be an anti-pattern for privacy.** When a
  report path collects nothing today, adding a reason field _increases_ retained
  PII. Prefer a retention purge over a new input.

## Follow-ups

- ~~`event-detail-cache.ts:185` stale comment~~ — fixed in this bundle (the
  `RLS: using (true)` note now reads `using (deleted_at is null)` + the #16
  column-grant caveat).
- **`share_location` opt-out** for player coords — deferred; rounding covers the
  exposure. Tracked in privacy.md #17.
- **Two migrations are deploy-gated** — CI applies on deploy; a green typecheck
  against regenerated types post-deploy is the real proof the view rebuild +
  grant agree with app reads.
