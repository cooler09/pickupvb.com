# Badges / gamification audit

Feature audit of the collector-badge + host-event-badge subsystem (ADR
[0031](../adr/0031-gamification-badges.md); journal
[2026-06-02](../journal/2026-06-02-gamification-badges.md)). Scope: the domain
catalog/rules, the reconcile handler + repository, the
`compute_player_badge_stats` / `grant_attended_event_badges` RPCs, the host
authoring + manual-award flows, the à-la-carte unlock, the easter eggs, and the
trophy-case UI.

## Status — 2026-06-10 (new audit; first remediation bundle landed)

Subsystem is well-factored and matches the ADR: thresholds live only in the TS
catalog, grants are idempotent, the admin-client usage is the sanctioned
session-less path, and host-badge label/description run through the moderation
chokepoints. **0 P1.** Audit found **4 P2 + 4 P3**.

**Fixed 2026-06-10 (uncommitted, quad-green — migration deploy-gated):** BA-1,
BA-8 (one stats migration), BA-2 (hide toggle wired), BA-5 (dead `hasBadge`
removed). **Open:** BA-3 (verification debt — needs a live-DB run, deploy-gated),
BA-4, BA-6, BA-7. See the remediation log below.

| ID   | Sev | One-line                                                                     | Status   |
| ---- | --- | ---------------------------------------------------------------------------- | -------- |
| BA-1 | P2  | Seasoned/Champion/Podium don't exclude `cancelled` events                    | ✅ fixed |
| BA-2 | P2  | "Hide a badge" is unreachable — RPC + column + view filter all ship dead     | ✅ fixed |
| BA-3 | P2  | The tournament/league stat joins have never been run or tested against data  | ⏳ open  |
| BA-4 | P2  | `/profile` runs two multi-table SECURITY DEFINER RPCs uncached on every load | ⏳ open  |
| BA-5 | P3  | `BadgeRepository.hasBadge` is dead code (no call sites)                      | ✅ fixed |
| BA-6 | P3  | on_attend host-badge grants fire no `badge.earned` bell and no unlock toast  | ⏳ open  |
| BA-7 | P3  | Retroactively-added on_attend badges miss attendees of events >7 days old    | ⏳ open  |
| BA-8 | P3  | `per_host` loyalty count groups all null-`host_id` events together           | ✅ fixed |

---

## Findings

### BA-1 (P2) — Seasoned / Champion / Podium count cancelled events

`compute_player_badge_stats` guards `cancelled` only in the `attended` CTE
(`e.status in ('published','completed')`). The **Seasoned** (`leagues_completed`)
expression instead gates on `e.status = 'completed' OR e.ends_at < now()`, and
its attendee `exists(...)` sub-select filters nothing on event status — so a
player who registered for a **league that was cancelled but whose `ends_at` is in
the past** earns "Seasoned." Champion/Podium likewise filter `e.type =
'tournament'` with no status guard (lower risk — they also require a
host-recorded `winner_entry_id`, but a cancelled-after-winner tournament would
still count).

[supabase/migrations/20260906000000_event_division_podium.sql#L99-L131](../../supabase/migrations/20260906000000_event_division_podium.sql#L99-L131)

**Fix:** in a _follow-up_ migration (never edit the applied one) replace the
Seasoned `e.status = 'completed' or e.ends_at < now()` with `e.status in
('published','completed') and e.ends_at < now()`, and add `e.status <>
'cancelled'` (or the same allow-list) to the Champion and Podium event filters.
This restores the ADR's "never mis-award" guarantee.

### BA-2 (P2) — "Hide a badge" is built end-to-end except the part a user can reach

ADR 0031 decision #6 promises owners can opt a badge out of public display via
`set_user_badge_hidden`. The whole backend exists — the `hidden` column, the
owner-only definer RPC, the `user_badges_public` `where ub.hidden = false`
filter, and `GrantedBadge.hidden` / the owner read carrying it — but **nothing
calls the RPC.** `grep` finds `set_user_badge_hidden` only in generated types,
and `ShelfBadge` ([badge-shelf.tsx#L4-L12](../../apps/web/src/components/badge-shelf.tsx#L4-L12))
drops `hidden`, so even on the owner's own trophy case there's no toggle and no
"hidden" indication.

- RPC: [supabase/migrations/20260902000000_user_badges.sql#L152-L166](../../supabase/migrations/20260902000000_user_badges.sql#L152-L166)
- Owner read drops `hidden`: [load-profile-page.ts#L150-L156](../../apps/web/src/app/profile/_loaders/load-profile-page.ts#L150-L156)

**Fix (pick one):** (a) wire it — thread `hidden` into `ShelfBadge`, add a
small per-badge "Hide from public" toggle on the owner shelf that calls a server
action wrapping `set_user_badge_hidden`, and `updateTag(profileCacheTag)` after;
or (b) if hide-a-badge isn't a launch requirement, delete the RPC + grant and
trim the ADR decision so the next reader doesn't assume it works. Don't leave it
half-built.

### BA-3 (P2) — The tournament/league stat joins are untested and unrun

The only badge test, [badge-rules.test.ts](../../packages/domain/src/badges/badge-rules.test.ts),
feeds the pure rules a synthetic `PlayerBadgeStats`. **Nothing exercises the SQL
aggregation** — the `user_entries` union (captain ∪ `event_team_entry_members` ∪
active `team_members`), the champion/podium `winner_entry_id` joins, or the
reconcile-cron's nested embed filter
`.gte('division.event.ends_at', …)` over `event_divisions!inner(events!inner(…))`
([reconcile/route.ts#L35-L41](../../apps/web/src/app/api/badges/reconcile/route.ts#L35-L41)).
ADR "Deferred" and the project memory both flag this as needing "a live-DB run to
confirm the joins" — still outstanding. A wrong join here mis-awards or silently
never awards a high-visibility "Champion."

**Fix:** run `compute_player_badge_stats(<known champion uuid>)` against dev with
a real finished tournament + finished league and assert the four
tournament/league counts by hand; confirm the cron candidate query returns the
expected attendee set. Capture the expectation as a Playwright/integration check
if practical, since it can't be a domain unit test.

### BA-4 (P2) — Every `/profile` load fires two multi-table SECURITY DEFINER RPCs, uncached

`loadProfilePage` awaits `reconcileUserBadges(user.id)` (which runs
`grant_attended_event_badges` **and** `compute_player_badge_stats`, both
multi-table scans) and then `getOwnBadges(user.id)`, sequentially, on the admin
client, on the most-visited authenticated page — with no `React.cache` and no
dirty-check. Reconcile is idempotent, so after the first grant this is pure
wasted latency on every subsequent visit.

[load-profile-page.ts#L145-L156](../../apps/web/src/app/profile/_loaders/load-profile-page.ts#L145-L156),
[badges.ts#L34-L59](../../apps/web/src/lib/badges.ts#L34-L59)

**Fix:** wrap `reconcileUserBadges` in `React.cache` for per-request dedup (the
performance-audit P3 #12 pattern used for `isPro`), and/or skip the reconcile
when nothing could have changed (e.g. a cheap `max(awarded_at)` vs. a
`last_active` watermark) — leaning on the 30-min cron as the safety net rather
than reconciling on every render.

### BA-5 (P3) — `hasBadge` is dead code

`BadgeRepository.hasBadge` and its adapter implementation have no callers
(`grep` finds only the port, the adapter, and the in-memory fake in the handler
test). Idempotent `grant` made it redundant.

[badge-repository.ts#L44-L45](../../packages/domain/src/badges/badge-repository.ts#L44-L45),
[supabase-badge-repository.ts#L90-L98](../../packages/infrastructure/src/supabase-badge-repository.ts#L90-L98)

**Fix:** remove the port method + adapter impl (and the fake's override), or
fold it into a real use case if one is planned. Trims surface and a needless
`count` round-trip from the contract.

### BA-6 (P3) — First host badge a player collects is silent

`grant_attended_event_badges` writes the on_attend grant in SQL and returns
`void`, so the facade can't tell which keys are new — they fire no `badge.earned`
bell and aren't part of the `newlyGranted` set that drives `BadgeUnlockToast`.
The system, manual-award, and easter-egg paths all notify; on_attend doesn't
(ADR "Still open"). A player's _first ever_ collectible badge can land with zero
acknowledgement.

[badges.ts#L38-L55](../../apps/web/src/lib/badges.ts#L38-L55),
[20260903000000_event_badges.sql#L130-L153](../../supabase/migrations/20260903000000_event_badges.sql#L130-L153)

**Fix:** have the RPC `returning badge_key, ... ` the rows it inserted (the
`on conflict do nothing` makes the returned set exactly the new grants), surface
them from the facade, and `notify('badge.earned', …)` per new host grant — same
shape as the system path.

### BA-7 (P3) — Retroactive on_attend badges miss older attendees

A host can add an on_attend badge to an event that finished weeks ago. Existing
attendees only receive it when they next open their own profile — the reconcile
cron's candidate set is bounded to events finished in the last
`LOOKBACK_DAYS = 7`
([reconcile/route.ts#L25-L41](../../apps/web/src/app/api/badges/reconcile/route.ts#L25-L41)),
so an attendee who never revisits never collects it.

**Fix:** in `addEventBadgeFromForm`, after a successful insert of an on_attend
badge, kick a targeted grant for that event's past attendees (call
`grant_attended_event_badges` for each, or add an event-scoped grant RPC), so the
badge backfills regardless of profile visits.

### BA-8 (P3) — Loyalty count lumps all null-host events together

`per_host` groups `attended` by `host_id` with no null guard, so every event
with a null `host_id` collapses into one bucket — inflating
`max_events_with_single_host` (Loyal) across unrelated hosts. Events normally
carry a `host_id`, so impact is small, but it's a latent miscount.

[20260906000000_event_division_podium.sql#L50-L61](../../supabase/migrations/20260906000000_event_division_podium.sql#L50-L61)

**Fix:** add `where host_id is not null` to the `attended`/`per_host` host
rollup (the reconcile cron already filters `.not('host_id','is',null)` for the
same reason).

---

## What's healthy (no action)

- **Threshold-in-TS / aggregate-in-SQL split** holds — one rule source, unit
  tested, no SQL copy to drift.
- **Idempotent grants** (`on conflict do nothing` / unique `(user_id,
badge_key)`) make reconcile-on-view + cron + backfill all safe to overlap.
- **Admin-client usage is correct** per AGENTS pitfall #8 — system-awarded,
  session-less grants with no per-user authorization to delegate to RLS; other
  viewers read the `user_badges_public` definer view.
- **Host authoring** is Pro-gated in the app layer (RLS only enforces "can
  manage this event"), label is hard-blocked (`assertCleanName`) and description
  masked (`maskPublicText`) — ADR 0030 discipline.
- **`unawardEventBadge` scopes the delete** to a `source='host'` badge of this
  event, so a host can't strip a player's system/easter-egg badge by guessing a
  key.
- **Orphan sweep** for the `event-badges` bucket follows AGENTS pattern #14
  (public-bucket cache-buster liveness, grace window).

## Remediation log

### 2026-06-10 — first bundle (BA-1, BA-2, BA-5, BA-8), uncommitted, quad-green

- **BA-1 + BA-8** — new migration
  [20261009000000_harden_badge_stat_aggregation.sql](../../supabase/migrations/20261009000000_harden_badge_stat_aggregation.sql)
  `create or replace`s `compute_player_badge_stats` (same signature → types
  unchanged, deploy-gated). Champion/Podium/Seasoned now gate on
  `status in ('published','completed')` (Seasoned keeps the host-marked-
  completed-early case via `status = 'completed' OR ends_at < now()`), and the
  `per_host` loyalty rollup adds `where host_id is not null`. Already-granted
  mis-awards are not revoked (grants are durable) — this only stops future
  ones.
- **BA-2** — wired the owner hide/show toggle. New action
  [badge-visibility-actions.ts](../../apps/web/src/app/profile/badge-visibility-actions.ts)
  (`setBadgeHidden`, user-scoped client → the `auth.uid()`-guarded
  `set_user_badge_hidden` RPC, then `revalidatePath` + `updateTag(profileCacheTag)`);
  `ShelfBadge` gained `hidden`, threaded from the owner read
  ([load-profile-page.ts](../../apps/web/src/app/profile/_loaders/load-profile-page.ts));
  `BadgeShelf` gained `manageHidden` + `returnPath`, renders a per-tile
  Hide/Show form and dims hidden tiles (owner shelf only — the public page never
  sees hidden badges, which the `user_badges_public` view already filters).
- **BA-5** — removed the dead `hasBadge` from the port
  ([badge-repository.ts](../../packages/domain/src/badges/badge-repository.ts)),
  the adapter
  ([supabase-badge-repository.ts](../../packages/infrastructure/src/supabase-badge-repository.ts)),
  and the handler-test fake.

Still open: BA-3 (live-DB verification of the tournament/league joins — can't be
a unit test; deploy-gated), BA-4 (`React.cache` / dirty-check the profile-load
reconcile), BA-6 (return on_attend grants from the RPC so they notify), BA-7
(backfill on_attend on badge-add for older events).
