# Data lifecycle — soft-delete vs hard-delete strategy

**Date:** 2026-05-26
**Scope:** every `public.*` table — recommended delete posture (HARD vs SOFT
vs APPEND-ONLY), app-layer delete coverage gaps, e2e cleanup gaps,
soft-delete scaling risk, and a retention strategy. The user-account
deletion design is **not** re-litigated here; it lives in
[docs/audits/privacy.md](privacy.md) (P1 #1–#3). This audit is the
broader entity-by-entity strategy.

> Status: initial audit, no remediation landed. Findings are graded P1/P2/P3
> per [docs/audits/README.md](README.md).
>
> **2026-05-31 update — chat retention (privacy.md #14, P2):**
>
> The chat surface (`conversations` / `messages` / `chat-attachments` bucket,
> shipped 20260824–20260826) was absent from this audit's §1 inventory and had
> no retention policy — logged in [privacy.md #14](privacy.md). Closed in
> [20260829000000_chat_retention.sql](../../supabase/migrations/20260829000000_chat_retention.sql):
>
> - **`chat-attachments` orphan sweep.** `public.purge_chat_attachment_orphans(grace)`
>   - a daily 06:45 UTC pg_cron job, mirroring the hero/sponsor walkers but with an
>     exact-path liveness match (chat stores the **bare** object path in
>     `messages.attachments[].path`, not a cache-busted public URL — so no
>     LIKE-wildcard guard is needed).
> - **Soft-deleted message scrub.** `messages_scrub_soft_deleted_30d` cron
>   (06:30 UTC) nulls `body`/`attachments` on rows soft-deleted > 30 days ago,
>   keeping the tombstone but stripping the PII. `messages_nonempty` was relaxed
>   to permit an emptied tombstone (`deleted_at is not null OR <has content>`).
> - §1 Messaging/notifications inventory below now lists the chat tables. Live
>   `messages` (DMs especially) are deliberately **not** on a blanket TTL — only
>   soft-deleted rows are scrubbed. Validated against the local DB.
>
> **2026-05-30 update — sponsor-logo Storage migration + hero-walker data-loss fix (P1):**
>
> - **`event_sponsors.logo_url` now sourced from Storage, not a pasted CDN URL.**
>   Arbitrary third-party logo URLs failed two independent browser walls — the
>   CSP `img-src` allowlist (apps/web/next.config.mjs) and cross-origin
>   embedding protections (CORP / hotlink / signed-URL expiry) — so logos often
>   didn't render. Logos now upload to a new public `sponsor-logos` bucket
>   ([20260817000000_sponsor_logos_bucket.sql](../../supabase/migrations/20260817000000_sponsor_logos_bucket.sql)),
>   served from `*.supabase.co` which is already on the allowlist. Same posture
>   as `hero-images`: public read, owner-prefix write. Lifecycle = HARD orphan
>   sweep (below).
> - **P3 #7 (new) — `sponsor-logos` orphan sweep** mirrors the hero P3 #2 walker:
>   [20260818000000_sponsor_logos_orphan_cleanup.sql](../../supabase/migrations/20260818000000_sponsor_logos_orphan_cleanup.sql)
>   adds `public.purge_sponsor_logo_orphans(grace_hours)` + a daily 06:15 UTC
>   pg_cron job over `{user_id}/{event_id}/logo.{ext}` paths, retaining objects
>   still referenced by a live `event_sponsors.logo_url`. Cache-buster-tolerant
>   from the start (see the P1 below).
> - **P1 #2 (new — regression in P3 #2) — the hero orphan walker silently deletes
>   _live_ images.** `HeroImageUpload`
>   ([hero-image-upload.tsx](../../apps/web/src/components/hero-image-upload.tsx#L55-L58))
>   persists every URL with a `?t=<ms>` cache-buster, but
>   `purge_hero_image_orphans` matched `hero_image_url like '%/' || name` with no
>   trailing wildcard — the `?t=…` suffix sits past `name`, so **no live row ever
>   matches**. After the 24h grace window the daily 06:00 UTC cron classifies
>   every live hero as an orphan and deletes it, so hero images would vanish
>   ~a day after upload. Graded **P1** (silent data-loss of user-uploaded
>   content). Fixed in
>   [20260819000000_fix_hero_image_orphan_cache_buster.sql](../../supabase/migrations/20260819000000_fix_hero_image_orphan_cache_buster.sql)
>   (`create or replace`; liveness now matches the bare path OR `… || '?%'` on
>   all three events/groups/profiles branches; the named cron picks up the new
>   body, no re-schedule). **Caveats:** not reproduced against a live DB (Docker
>   down at fix time), and the cron's prod-active status wasn't independently
>   confirmed — but it's scheduled in an auto-applied migration, so it is almost
>   certainly live. All three migrations are pending `pnpm db:migrate` (Docker).
>
> **2026-05-26 update — partial remediation shipped:**
>
> - **P1 #1, P2 #3, P3 #3** — retention cron jobs landed in
>   [supabase/migrations/20260627000000_retention_cron_jobs.sql](../../supabase/migrations/20260627000000_retention_cron_jobs.sql).
>   Five pg_cron jobs: `notification_outbox` sent>90d + failed>30d,
>   `notifications` read>30d + unread>180d, `marketing_attribution` >24mo.
>   Applied locally; CI/CD auto-applies on deploy.
> - **P2 #4** — [apps/web/tests/e2e/\_helpers/cleanup.ts](../../apps/web/tests/e2e/_helpers/cleanup.ts)
>   landed (opt-in via `E2E_CLEANUP_SUPABASE_URL` / `E2E_CLEANUP_SUPABASE_SECRET_KEY`).
>   Wired into the two leaky `@destructive` specs
>   ([groups.authed.spec.ts](../../apps/web/tests/e2e/groups.authed.spec.ts),
>   [teams.authed.spec.ts](../../apps/web/tests/e2e/teams.authed.spec.ts)).
> - **P3 #2 correction:** `hero_images` is not a table — it's a
>   `hero_image_url` column on `events`/`groups`/`profiles` plus a
>   `hero-images` Storage bucket. The recommended one-line `DELETE FROM
hero_images` is wrong; orphan cleanup requires a `storage.objects`
>   walker that parses `{user_id}/{entity_type}/{entity_id}/hero.{ext}`
>   paths against live entity ids. Still P3 but no longer XS effort.
> - **P2 #1, P2 #2, P3 #1 (schema slice)** — soft-delete for groups,
>   teams, and broadcasts landed in
>   [supabase/migrations/20260628000000_soft_delete_groups_teams_broadcasts.sql](../../supabase/migrations/20260628000000_soft_delete_groups_teams_broadcasts.sql).
>   `deleted_at timestamptz` + partial index on each, SELECT-policy
>   filter so soft-deleted rows vanish from every read path. Owner-only
>   delete UI on the group edit page; captain-only delete UI inside
>   `TeamViewerChrome`. `hideBroadcastAction` shipped without a UI
>   consumer — host broadcast history list is the follow-up that
>   unlocks it.
> - **P2 #5** — `event_team_registrations` soft-delete after Stripe
>   checkout landed in
>   [supabase/migrations/20260629000000_event_team_registrations_soft_delete.sql](../../supabase/migrations/20260629000000_event_team_registrations_soft_delete.sql).
>   Same shape (`deleted_at timestamptz` + partial index + SELECT-policy
>   filter). `hostForceWithdrawTeamRegistration` now hard-deletes when
>   `payment_status='none'` and soft-deletes when `='refunded'`, keeping
>   the row queryable for refund reconciliation. The repository port
>   gained a `softDelete` method alongside the existing `delete`.
>   `existsForCaptainInDivision` filters `deleted_at IS NULL` so a
>   refunded + withdrawn captain can re-register in the same division.
>   Admin-client reads in `load-event-detail.ts` filter explicitly
>   (RLS doesn't apply); webhook lookups (`findByCheckoutSessionId`,
>   `findByPaymentIntentId`) intentionally do not filter so late Stripe
>   retries resolve to idempotent no-ops.
> - **P3 #2** — `hero-images` Storage orphan sweep landed in
>   [supabase/migrations/20260630000000_hero_images_orphan_cleanup.sql](../../supabase/migrations/20260630000000_hero_images_orphan_cleanup.sql).
>   Added `public.purge_hero_image_orphans(grace_hours int)` + daily
>   pg_cron schedule (`hero_images_purge_orphans`, `0 6 * * *`) that
>   walks `storage.objects` for the `hero-images` bucket, parses
>   `{user_id}/{entity_type}/{entity_id}/hero.{ext}`, and purges
>   objects that no longer map to a live owner row and current
>   `hero_image_url`. The 24-hour grace window avoids racing immediate
>   upload->DB-update flows.
> - **P3 #4, P3 #5** — Pending team-invite TTL + push-subscription
>   inactive purge landed in
>   [supabase/migrations/20260701000000_retention_team_invites_push_subs.sql](../../supabase/migrations/20260701000000_retention_team_invites_push_subs.sql).
>   Two pg_cron jobs: 30-day cap on `team_members.status='pending'` rows
>   (corrects the §1 row that referenced a non-existent
>   `team_member_invites` table — invites are `team_members` rows with
>   `status='pending'` + `invited_at`) and 90-day inactive cap on
>   `push_subscriptions` keyed on `coalesce(last_used_at, created_at)`,
>   complementing the delivery worker's 410/404 HARD-delete.
> - **P3 #6 — decided NOT pursued.** `events.deleted_at` was an open
>   recommendation in §1; calling it explicitly: `status='cancelled'`
>   is the canonical host-delete posture. Cancelled events disappear
>   from public reads, the host's `host_id` SET NULLs on account
>   deletion (privacy.md P1 #1), and the row is required for
>   `event_payment_audit` / `event_tips` RESTRICT FKs. Revisit only
>   if a concrete product need surfaces.
> - **§3 tier-2 e2e specs** — group + team delete specs were noted as
>   uncovered; they're actually covered inline in the destructive
>   create flows (Bundle 93). Updated the §3 table to reflect that.
>   `profile-delete`, `host deletes event`, and `broadcasts hide`
>   remain blocked on upstream app work (privacy.md P1; P3 #6
>   decision; broadcast history UI follow-up).
> - **Soft-delete RLS bug (Bundle 93 regression) — fixed.** The
>   destructive group e2e surfaced `new row violates row-level
security policy for table "groups"` on the soft-delete UPDATE.
>   Root cause: PostgreSQL applies the SELECT policy as an implicit
>   WITH CHECK on UPDATE — flipping `deleted_at` to non-NULL makes
>   the after-image fail `deleted_at IS NULL`, so the UPDATE is
>   rejected even when the UPDATE policy itself (owner-via-
>   `group_members`) passes and even with an explicit `WITH CHECK
(true)`. The
>   [20260628000000](../../supabase/migrations/20260628000000_soft_delete_groups_teams_broadcasts.sql)
>   migration's claim that "owners can still UPDATE the row to flip
>   `deleted_at` because the WITH CHECK on `groups_update` /
>   `teams_update` doesn't reference `deleted_at`" was wrong — it
>   missed the SELECT-as-WITH-CHECK behavior. Same latent bug
>   affected `teams.deleted_at` and `broadcasts.deleted_at` (sender
>   filter also restrictive). Fix: switched the actual `deleted_at`
>   write in `deleteGroupAction`, `deleteTeamAction`, and
>   `hideBroadcastAction` to the admin (service-role) client, which
>   bypasses RLS. App-layer owner/sender authorization is unchanged
>   and remains the gate; soft-deleted rows still 404 for all
>   readers (including the owner) on subsequent loads, which matches
>   the test expectation and the original product intent.

---

## 1. Entity inventory and recommended delete posture

Verified against `supabase/migrations/`. "Realtime" = present in the
`supabase_realtime` publication and therefore needs a `REPLICA IDENTITY`
for DELETE to succeed.

### Core / identity

| Table         | PII  | `deleted_at`       | FK posture on user delete | Realtime | Recommended                                                               |
| ------------- | ---- | ------------------ | ------------------------- | -------- | ------------------------------------------------------------------------- |
| `profiles`    | High | ✓ yes (2026-06-20) | `auth.users` CASCADE      | —        | SOFT + scheduled hard purge (30-day grace; design sketched in privacy.md) |
| `friendships` | Low  | —                  | both CASCADE              | —        | HARD                                                                      |

### Events & participation

| Table                              | PII | `deleted_at`       | FK posture                                                                                                                                                                           | Realtime | Recommended                                                                               |
| ---------------------------------- | --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `events`                           | —   | —                  | `host_id` SET NULL (privacy P1 #1a)                                                                                                                                                  | ✓        | SOFT (status='cancelled' already exists; add `deleted_at` for host-initiated true delete) |
| `event_attendees`                  | —   | —                  | `event_id` CASCADE, `user_id` SET NULL                                                                                                                                               | ✓        | HARD                                                                                      |
| `event_teams`                      | —   | —                  | both CASCADE                                                                                                                                                                         | ✓        | HARD                                                                                      |
| `event_divisions`                  | —   | —                  | `event_id` CASCADE                                                                                                                                                                   | —        | HARD                                                                                      |
| `event_free_agents`                | —   | —                  | both CASCADE                                                                                                                                                                         | —        | HARD                                                                                      |
| `event_guests`                     | Low | —                  | both CASCADE                                                                                                                                                                         | —        | HARD                                                                                      |
| `event_co_hosts`                   | —   | —                  | both CASCADE; replica identity fixed 2026-06-26 ([20260626000000_event_co_hosts_replica_identity.sql](../../supabase/migrations/20260626000000_event_co_hosts_replica_identity.sql)) | —        | HARD                                                                                      |
| `event_sponsors`                   | —   | —                  | `event_id` CASCADE                                                                                                                                                                   | —        | HARD                                                                                      |
| `tournament_brackets` + 3 children | —   | —                  | CASCADE chain                                                                                                                                                                        | —        | HARD                                                                                      |
| `event_team_registrations`         | —   | ✓ yes (2026-05-26) | `event_id` CASCADE, `division_id` RESTRICT                                                                                                                                           | —        | HARD (pre-checkout) / SOFT (post-payment) — shipped via P2 #5                             |
| `event_team_registration_members`  | —   | —                  | `registration_id` CASCADE                                                                                                                                                            | —        | HARD                                                                                      |
| `team_extra_members`               | —   | —                  | both CASCADE                                                                                                                                                                         | —        | HARD                                                                                      |
| `reminder_tracking`                | —   | —                  | `event_attendee_id` CASCADE                                                                                                                                                          | —        | HARD                                                                                      |

### Teams / groups

| Table             | PII | `deleted_at` | FK posture                         | Realtime | Recommended                                                                  |
| ----------------- | --- | ------------ | ---------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `teams`           | —   | —            | `captain_id` CASCADE               | —        | SOFT                                                                         |
| `team_members`    | Low | —            | both CASCADE                       | —        | HARD (active rows); **TTL on `status='pending'` rows** — see P3 #4 (shipped) |
| `groups`          | —   | —            | `created_by` SET NULL (privacy P1) | —        | SOFT                                                                         |
| `group_members`   | —   | —            | both CASCADE                       | —        | HARD                                                                         |
| `group_followers` | —   | —            | both CASCADE                       | —        | HARD                                                                         |

### Money

| Table                   | PII | `deleted_at` | FK posture                         | Recommended                                             |
| ----------------------- | --- | ------------ | ---------------------------------- | ------------------------------------------------------- |
| `host_stripe_accounts`  | —   | —            | `user_id` SET NULL (privacy P1)    | **APPEND-ONLY** (7-yr / tax)                            |
| `host_subscriptions`    | —   | —            | `user_id` SET NULL (privacy P1)    | **APPEND-ONLY** (audit)                                 |
| `event_tips`            | —   | —            | `host_id` SET NULL (privacy P1)    | **APPEND-ONLY** (1099-K)                                |
| `event_payment_audit`   | —   | —            | `event_id` CASCADE                 | **APPEND-ONLY** (7-yr)                                  |
| `event_team_payments`   | —   | —            | `captain_id` SET NULL (privacy P1) | **APPEND-ONLY** (tax)                                   |
| `stripe_webhook_events` | —   | —            | none                               | **APPEND-ONLY**, hot for ~7d, archive after — see P2 #4 |

### Messaging / notifications

| Table                      | PII                                     | `deleted_at`       | Notes                                                                                                              | Recommended                                               |
| -------------------------- | --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `notifications`            | Low                                     | — (only `read_at`) | [20260524000000_notifications.sql#L58-L74](../../supabase/migrations/20260524000000_notifications.sql#L58-L74)     | SOFT + **scheduled hard purge** (P2 #2)                   |
| `notification_outbox`      | **High** (rendered body + `to_address`) | —                  | [20260524000000_notifications.sql#L91-L114](../../supabase/migrations/20260524000000_notifications.sql#L91-L114)   | **APPEND-ONLY w/ retention cap** (P1 #1 — GDPR)           |
| `broadcasts`               | Medium (rendered body)                  | —                  | [20260524000000_notifications.sql#L117-L135](../../supabase/migrations/20260524000000_notifications.sql#L117-L135) | SOFT (host audit trail, ~1-yr retention)                  |
| `push_subscriptions`       | —                                       | —                  | device endpoints                                                                                                   | HARD on 410/404; HARD after 90d inactive (P3 #5, shipped) |
| `notification_preferences` | —                                       | —                  | `user_id` CASCADE                                                                                                  | HARD on user delete (already)                             |

### Chat / messaging (shipped 20260824–20260826; retention 20260829)

| Table                       | PII                                           | `deleted_at`                        | FK posture on user delete                  | Realtime      | Recommended                                                                                                                     |
| --------------------------- | --------------------------------------------- | ----------------------------------- | ------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `conversations`             | Low (DM `title` / `dm_key`)                   | ✓ yes                               | `created_by` SET NULL                      | —             | SOFT (room/DM survives with null author)                                                                                        |
| `conversation_participants` | —                                             | —                                   | both CASCADE                               | —             | HARD                                                                                                                            |
| `messages`                  | **High** (free-text body + image attachments) | ✓ yes (`deleted_at` + `deleted_by`) | `sender_id` CASCADE, `deleted_by` SET NULL | ✓ (broadcast) | **KEEP live** (DM/room history); **scrub body/attachments 30d after soft-delete** — privacy #14, shipped 20260829               |
| `message_reports`           | Low (`reason`)                                | —                                   | both CASCADE                               | —             | HARD                                                                                                                            |
| `user_blocks`               | —                                             | —                                   | both CASCADE                               | —             | HARD                                                                                                                            |
| `chat-attachments` (bucket) | **High** (user-uploaded images)               | n/a (Storage)                       | n/a — reclaimed by orphan sweep            | —             | HARD orphan sweep (`purge_chat_attachment_orphans`, daily) — retains objects referenced by a live `messages.attachments[].path` |

### Community

| Table                       | PII | `deleted_at` | FK posture                   | Recommended                                                                                                                               |
| --------------------------- | --- | ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `community_listings`        | Low | —            | `submitter_user_id` SET NULL | HARD (delete handler already exists at [community/[slug]/listing-actions.ts](../../apps/web/src/app/community/[slug]/listing-actions.ts)) |
| `community_listing_reports` | —   | —            | both CASCADE                 | HARD                                                                                                                                      |

### Templates / hero images / analytics / misc

| Table                   | PII | `deleted_at` | Recommended                                                                                              |
| ----------------------- | --- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `host_event_templates`  | —   | —            | HARD (delete shipped — [template-actions.ts](../../apps/web/src/app/events/new/template-actions.ts#L12)) |
| `hero_images`           | —   | —            | HARD (orphan once resource gone)                                                                         |
| `marketing_attribution` | Low | —            | APPEND-ONLY (2-yr cap — see P2 #3)                                                                       |
| `rate_limits`           | —   | —            | TTL (windowed; trivial size)                                                                             |

---

## 2. Missing app-layer delete functionality

### P1 — Account deletion

**Status:** privacy.md P1 #1–#3 already cover this; schema is now ready
(2026-06-20 migration flipped the RESTRICT FKs and added
`profiles.deleted_at`) but **the application path is not built**: no
`/profile/delete` route, no `requestAccountDeletion` server action, no
two-step confirmation, no PII scrub. This is the single largest
deletion gap in the app. Track this finding in privacy.md, not here.

### P2 #1 — No way to delete a group

**Files:**
[apps/web/src/app/groups/](../../apps/web/src/app/groups/) — `new/` exists,
`[id]/edit/` exists, but `grep` for `deleteGroup` / `DeleteGroupCommand` /
`groups.delete()` returns **zero matches** across `apps/web/` and
`packages/application/`. A user who creates a test group has no
in-product path to remove it. The hero-image upload migration
([hero-images.md](hero-images.md)) makes this worse — orphan groups now
own storage objects.

**Recommended fix:**

1. Add `groups.deleted_at timestamptz` (SOFT — keep historical
   co-host/member references intact).
2. New aggregate command `DeleteGroupCommand` in
   `packages/application/src/commands/`, dispatched by a `deleteGroup`
   server action under `apps/web/src/app/groups/[id]/edit/`. Only the
   owner can call it; if the group is the `host_group_id` on any future
   event, refuse with `ConflictError`.
3. Wire RLS so `select` policies filter `deleted_at is null` for the
   public read paths; admin reads keep full visibility.
4. Add `groups_deleted_at_idx … where deleted_at is not null` (partial,
   matches the `profiles` pattern) so the common path stays full-cardinality.

### P2 #2 — No way to delete a team

**Files:** `apps/web/src/app/teams/` has no `delete*` handler;
`packages/application/src/commands/` has no team-deletion command. The
captain can `removeMemberFromForm` ([teams/actions.ts](../../apps/web/src/app/teams/actions.ts))
or leave, but the team row survives. Tournament team registrations
(`event_team_registrations`) point back at `teams.id` via the team-aware
captaincy path, so the recommendation here is SOFT-delete (mark the
roster snapshot inactive without breaking historical tournament
records).

**Recommended fix:** mirror the group pattern — `teams.deleted_at`,
`DeleteTeamCommand`, partial index, RLS filter. Refuse delete while any
`event_team_registrations.team_id` for a future-dated event references
it.

### P2 #3 — Broadcasts are immutable post-send (no edit, no retract)

**File:** [broadcasts table](../../supabase/migrations/20260524000000_notifications.sql#L117-L135).
The host has no way to delete a broadcast after sending — `broadcasts`
contains a rendered body that may include PII or an embarrassing typo,
and the corresponding `notification_outbox` rows render the same text
in attendee mailboxes.

**Recommended fix:** add `broadcasts.deleted_at` so the host can _remove
the row from their own audit trail_ (purely cosmetic — the email has
already left). Don't try to recall delivered email/SMS; rendered
`notification_outbox` rows are immutable by design. Add `Hide` UX on
the host broadcast history list.

### P3 — Other surfaces

- `event_tips` — refund-only, no user-facing delete (correct by design).
- `event_sponsors` — `removeSponsor` exists at [sponsor-actions.ts](../../apps/web/src/app/events/[id]/edit/sponsor-actions.ts).
  Logo objects now live in the `sponsor-logos` Storage bucket (2026-05-30); orphan
  sweep shipped in [20260818000000_sponsor_logos_orphan_cleanup.sql](../../supabase/migrations/20260818000000_sponsor_logos_orphan_cleanup.sql)
  via `public.purge_sponsor_logo_orphans(...)` + daily pg_cron (P3 #7).
- `hero-images` Storage objects — ✅ shipped 2026-05-26 in
  [20260630000000_hero_images_orphan_cleanup.sql](../../supabase/migrations/20260630000000_hero_images_orphan_cleanup.sql)
  via `public.purge_hero_image_orphans(...)` + daily pg_cron schedule.
  **⚠️ P1 #2 cache-buster data-loss fix (2026-05-30):** the walker's liveness
  LIKE missed `?t=…`-suffixed URLs and would have purged live images; corrected
  in [20260819000000_fix_hero_image_orphan_cache_buster.sql](../../supabase/migrations/20260819000000_fix_hero_image_orphan_cache_buster.sql).
  See the top-of-file status block.

---

## 3. E2E cleanup gaps

### P2 #4 — Tests create artifacts, never delete them

The e2e suite runs against `dev.pickupvb.com` (real Supabase project),
not against a snapshot. Today's specs create:

- An event per `event-host.authed.spec.ts` run (the `beforeAll`
  creates the `eventUrl` and the suite never deletes it).
- A group per `groups-manage.authed.spec.ts` run.
- A team per `teams.authed.spec.ts` run.
- A community listing per `community.authed.spec.ts` run.
- A broadcast per the `broadcast` test inside event-host.

**Evidence in the test output already shared:** the "Add co-host"
dropdown in [event-host.authed.spec.ts](../../apps/web/tests/e2e/event-host.authed.spec.ts)
lists 27 groups all named `E2E Test Group 1779…` — every prior run
leaked one. The dev DB is now polluted with hundreds of orphan rows,
which makes future tests slower (UserPicker scans more rows, the
groups page paginates over them, etc.) and the dropdown screenshots
above are unreadable.

**Recommended fix (tier 1 — needs no schema work):**

- Add a `test.afterAll` in each spec that owns a fixture to delete
  what it created. For e2e specs that lack a UI delete path
  (groups, teams), call the admin Supabase client directly from
  `tests/e2e/_helpers/cleanup.ts` using `SUPABASE_SECRET_KEY`. Tag
  rows on creation with a sentinel (`name LIKE 'E2E Test %'`) so the
  helper can also do a periodic broad sweep.
- Add an explicit "cancel event" assertion to the host spec so the
  fixture event is at least marked cancelled.

**Recommended fix (tier 2 — proper coverage):**

Add positive create→delete specs once the P2 #1/#2 features ship:

| Spec to add                                                    | Asserts                                                            | Status                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `groups-manage.authed.spec.ts >> owner can delete group`       | Group disappears from `/groups`, RLS hides the slug                | ✅ Covered inline in [groups.authed.spec.ts @destructive](../../apps/web/tests/e2e/groups.authed.spec.ts) (2026-05-26)  |
| `teams.authed.spec.ts >> captain can delete team`              | Team disappears from `/teams`, registered events refuse the delete | ✅ Covered inline in [teams.authed.spec.ts @destructive](../../apps/web/tests/e2e/teams.authed.spec.ts) (2026-05-26)    |
| `profile-delete.authed.spec.ts` (new)                          | Account deletion grace, PII scrub, FK SET NULLs                    | Blocked on privacy.md P1 #1–#3 app-layer work (`/profile/delete` route, `requestAccountDeletion` server action)         |
| `event-host.authed.spec.ts >> host deletes event` (vs. cancel) | Soft-deleted event 404s for non-admins                             | Deferred — `events.deleted_at` not pursued (see P3 #6 below); `status='cancelled'` is the canonical host-delete posture |
| `broadcasts.authed.spec.ts >> host hides a broadcast`          | Broadcast disappears from host history                             | Blocked on host broadcast history UI (P3 #1 follow-up)                                                                  |

### P3 — Cleanup boilerplate

The cleanup story (admin-client deletes from tests) deserves a single
helper at `tests/e2e/_helpers/cleanup.ts` rather than reinventing the
`createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)` dance in each
`afterAll`. Same shape as the existing `_helpers/auth.ts` /
`_helpers/paths.ts`.

---

## 4. Soft-delete scaling — what fills the DB

Order-of-magnitude back-of-envelope for the tables that would grow
without a retention policy. Assumptions: 10k MAU at 12 months, 100k
MAU at 24 months, ~3 emails/day/active-user.

| Table                   | Current retention | 2-yr row count (100k MAU)        | 2-yr storage | Risk                      |
| ----------------------- | ----------------- | -------------------------------- | ------------ | ------------------------- |
| `notification_outbox`   | **Forever**       | ~220M rows @ 3 emails/day        | ~80–110 GB   | **P1**                    |
| `notifications`         | Forever           | ~330M rows (in-app feed)         | ~40–60 GB    | **P2**                    |
| `event_payment_audit`   | Forever           | 100k events × 50 attendees × 7yr | ~50–80 GB    | P3 (regulatory, accepted) |
| `marketing_attribution` | Forever           | 5 events × 10k DAU × 730d        | ~3 GB        | P3                        |
| `broadcasts`            | Forever           | ~5/host × 5k hosts × 24m         | ~600 MB      | low                       |
| `rate_limits`           | Windowed (in-app) | bounded                          | < 100 MB     | low                       |

### P1 #1 — `notification_outbox` has no retention policy

**File:** [20260524000000_notifications.sql#L91-L114](../../supabase/migrations/20260524000000_notifications.sql#L91-L114).
Rows contain `to_address` (email/phone) and a full `payload jsonb` of
the rendered message. Already flagged in privacy.md as P2 (PII), but
the **scaling** angle elevates it to P1 here: at 100k MAU this table
alone is the single biggest line on the database bill, and Supabase's
PITR window costs scale with WAL volume, which scales with insert
volume on hot tables like this one.

**Recommended fix:** pg_cron job, daily off-peak:

```sql
-- supabase/migrations/yyyymmddhhmmss_notification_outbox_retention.sql
create extension if not exists pg_cron;

select cron.schedule(
  'notification_outbox_purge_90d',
  '0 4 * * *',
  $$ delete from public.notification_outbox
     where sent_at is not null
       and sent_at < now() - interval '90 days' $$
);

-- Failed rows older than 30 days have given up; purge them too.
select cron.schedule(
  'notification_outbox_purge_failed_30d',
  '15 4 * * *',
  $$ delete from public.notification_outbox
     where status = 'failed'
       and created_at < now() - interval '30 days' $$
);
```

90 days satisfies the typical "send a follow-up about that thing"
window without crossing the GDPR-prudence line on retained PII.

### P2 #2 — `notifications` (in-app feed) has no retention policy

**File:** [20260524000000_notifications.sql#L58-L74](../../supabase/migrations/20260524000000_notifications.sql#L58-L74).
The bell icon never shows old items but the rows persist. The schema
has `read_at` and an unread partial index — both ready to drive a
TTL.

**Recommended fix:** same shape as above:

```sql
select cron.schedule(
  'notifications_purge_read_30d',
  '30 4 * * *',
  $$ delete from public.notifications
     where read_at is not null
       and read_at < now() - interval '30 days' $$
);
select cron.schedule(
  'notifications_purge_unread_180d',
  '45 4 * * *',
  $$ delete from public.notifications
     where read_at is null
       and created_at < now() - interval '180 days' $$
);
```

180-day unread cap matches the privacy "data minimization" rationale —
if a user hasn't logged in for six months, the bell doesn't need to
remember that they got a reminder for an event that's long since
happened.

### P3 #3 — `marketing_attribution` retention cap

Cap at 24 months — beyond that the cohort analyses get noisier than the
data adds value. Easy daily cron, low priority.

---

## 5. Retention strategy options

Three tiers. Pick by need, not all-at-once.

### Tier 1 — `pg_cron` periodic delete (recommended starting point)

- Already available in Supabase (`create extension if not exists pg_cron`).
- Jobs live in a migration, so they're versioned with the schema and
  apply to every environment via the CI auto-migrate.
- Use **one job per table** so a single bad query doesn't block the
  whole purge pipeline; stagger start times.
- Pair every cron job with a Sentry breadcrumb or `audit_log` entry —
  silent deletes are the worst kind of database bug.

This covers everything called out above. **No tier-2/tier-3 work is
required at current scale; defer until the cron jobs are no longer
keeping up.**

### Tier 2 — Native declarative partitioning (`pg_partman` or hand-rolled)

When a hot append-only table (`notification_outbox`, `event_payment_audit`)
crosses ~10 GB and the cron `DELETE` starts blocking on tuple I/O:

- Convert to a range-partitioned table by `created_at` (monthly).
- Drop entire month partitions instead of `DELETE`ing rows. Detach +
  drop is `O(1)` regardless of row count and doesn't touch
  the heap.
- Trade-off: schema rewrites, harder cross-partition unique
  constraints, and Supabase's PGRest needs a small policy
  reapplication after partition creation. **Not worth doing until
  scale forces it.**

### Tier 3 — Logical-decoding archive to cold storage

When even partitions feel heavy or compliance requires long-tail
retention without paying for Postgres pages:

- Stream `delete`d rows via logical decoding to S3 (Parquet, Glacier
  storage class). Total compliance retention without OLTP bloat.
- Cost: another piece of infrastructure (a Lambda or a Supabase
  Edge Function) and an S3 bucket. Worth it once the analytics or
  legal stories outgrow the OLTP database.

**No existing pg_cron jobs in the repo today** (`grep -r 'pg_cron\|cron.schedule' supabase/migrations` is empty). That's the entire installed retention strategy: zero.

---

## Open backlog

| Severity  | Item                                                                                                                        | Estimated effort | Status                                                                                                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~P1 #1~~ | `notification_outbox` 90-day purge (one migration, ~30 LOC)                                                                 | XS               | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| **P1 #2** | Hero-image orphan walker deletes **live** images — `?t=…` cache-buster defeats the liveness LIKE (regression in P3 #2)      | XS               | ✅ Fixed 2026-05-30 — [20260819000000_fix_hero_image_orphan_cache_buster.sql](../../supabase/migrations/20260819000000_fix_hero_image_orphan_cache_buster.sql). Not yet applied locally (Docker down).                                                                                                                                                              |
| ~~P2 #1~~ | Group delete (`deleted_at` column, server action, RLS filter, partial index)                                                | M                | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| ~~P2 #2~~ | Team delete (same shape as group)                                                                                           | M                | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| ~~P2 #3~~ | `notifications` TTL purge (one migration)                                                                                   | XS               | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| ~~P2 #4~~ | E2E test cleanup helper + per-spec `afterAll` deletes                                                                       | S                | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| **P2 #5** | ~~`event_team_registrations` soft-delete after Stripe checkout (vs hard-delete pre-checkout)~~                              | S                | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| ~~P3 #1~~ | `broadcasts.deleted_at` so hosts can hide broadcasts from their audit list                                                  | S                | ✅ Schema + action shipped 2026-05-26; host history UI is the follow-up                                                                                                                                                                                                                                                                                             |
| ~~P3 #2~~ | `hero-images` Storage orphan-sweep (see correction above; needs `storage.objects` walker)                                   | S–M              | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| **P3 #7** | `sponsor-logos` Storage orphan-sweep (mirrors P3 #2; cache-buster-tolerant from the start)                                  | S                | ✅ Shipped 2026-05-30 — [20260818000000_sponsor_logos_orphan_cleanup.sql](../../supabase/migrations/20260818000000_sponsor_logos_orphan_cleanup.sql)                                                                                                                                                                                                                |
| ~~P3 #3~~ | `marketing_attribution` 24-month cap                                                                                        | XS               | ✅ Shipped 2026-05-26                                                                                                                                                                                                                                                                                                                                               |
| ~~P3 #4~~ | Pending team-invite TTL (30-day cap on `team_members.status='pending'`)                                                     | XS               | ✅ Shipped 2026-05-26 — [20260701000000_retention_team_invites_push_subs.sql](../../supabase/migrations/20260701000000_retention_team_invites_push_subs.sql). Doc-correction: there is no separate `team_member_invites` table; invites are `team_members` rows with `status='pending'` + `invited_at`.                                                             |
| ~~P3 #5~~ | `push_subscriptions` 90-day inactive purge (`coalesce(last_used_at, created_at)`)                                           | XS               | ✅ Shipped 2026-05-26 — same migration as P3 #4. Belt-and-suspenders with the delivery worker's 410/404 HARD-delete.                                                                                                                                                                                                                                                |
| **P3 #6** | `events.deleted_at` for host-initiated true delete (vs `status='cancelled'`)                                                | M                | **Not pursued.** `status='cancelled'` is the canonical host-delete posture: cancelled events are invisible to attendees and `event_payment_audit` / `event_tips` need the row for referential integrity (RESTRICT FKs). Account-deletion path is `host_id` SET NULL (privacy.md P1 #1). Revisit only if a concrete product need surfaces.                           |
| **P3 #8** | Chat retention: `chat-attachments` orphan sweep + 30-day scrub of soft-deleted `messages` body/attachments (privacy.md #14) | S                | ✅ Shipped 2026-05-31 — [20260829000000_chat_retention.sql](../../supabase/migrations/20260829000000_chat_retention.sql). `purge_chat_attachment_orphans` + daily cron; `messages_scrub_soft_deleted_30d` cron; `messages_nonempty` relaxed for emptied tombstones. Live message history (DMs especially) intentionally kept — only soft-deleted rows are scrubbed. |

Cross-references:

- [docs/audits/privacy.md](privacy.md) — owns the account-deletion P1
  (profiles, FK posture, RLS scrub). The 2026-06-20 migration that did
  the schema work is verified in §1 above.
- [docs/audits/hero-images.md](hero-images.md) — already flags
  hero-orphan cleanup; cross-listed here as P3 #2.
- [docs/audits/e2e-tests.md](e2e-tests.md) — owns the broader test-helpers
  refactor; P2 #4 above is the data-cleanup slice.
- Repo-memory note: see `event_co_hosts` replica-identity fix at
  [supabase/migrations/20260626000000_event_co_hosts_replica_identity.sql](../../supabase/migrations/20260626000000_event_co_hosts_replica_identity.sql)
  — every new realtime-published table needs a PK (replica identity)
  before it gets DELETE traffic. Add a contributor-doc note in
  [docs/database-operations.md](../database-operations.md) when next
  touched.
