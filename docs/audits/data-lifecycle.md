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

| Table                              | PII | `deleted_at` | FK posture                                                                                                                                                                           | Realtime | Recommended                                                                               |
| ---------------------------------- | --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `events`                           | —   | —            | `host_id` SET NULL (privacy P1 #1a)                                                                                                                                                  | ✓        | SOFT (status='cancelled' already exists; add `deleted_at` for host-initiated true delete) |
| `event_attendees`                  | —   | —            | `event_id` CASCADE, `user_id` SET NULL                                                                                                                                               | ✓        | HARD                                                                                      |
| `event_teams`                      | —   | —            | both CASCADE                                                                                                                                                                         | ✓        | HARD                                                                                      |
| `event_divisions`                  | —   | —            | `event_id` CASCADE                                                                                                                                                                   | —        | HARD                                                                                      |
| `event_free_agents`                | —   | —            | both CASCADE                                                                                                                                                                         | —        | HARD                                                                                      |
| `event_guests`                     | Low | —            | both CASCADE                                                                                                                                                                         | —        | HARD                                                                                      |
| `event_co_hosts`                   | —   | —            | both CASCADE; replica identity fixed 2026-06-26 ([20260626000000_event_co_hosts_replica_identity.sql](../../supabase/migrations/20260626000000_event_co_hosts_replica_identity.sql)) | —        | HARD                                                                                      |
| `event_sponsors`                   | —   | —            | `event_id` CASCADE                                                                                                                                                                   | —        | HARD                                                                                      |
| `tournament_brackets` + 3 children | —   | —            | CASCADE chain                                                                                                                                                                        | —        | HARD                                                                                      |
| `event_team_registrations`         | —   | —            | `event_id` CASCADE, `division_id` RESTRICT                                                                                                                                           | —        | HARD (pre-checkout) / SOFT (post-payment) — see P2 #5                                     |
| `event_team_registration_members`  | —   | —            | `registration_id` CASCADE                                                                                                                                                            | —        | HARD                                                                                      |
| `team_extra_members`               | —   | —            | both CASCADE                                                                                                                                                                         | —        | HARD                                                                                      |
| `reminder_tracking`                | —   | —            | `event_attendee_id` CASCADE                                                                                                                                                          | —        | HARD                                                                                      |

### Teams / groups

| Table                 | PII | `deleted_at` | FK posture                         | Realtime | Recommended |
| --------------------- | --- | ------------ | ---------------------------------- | -------- | ----------- |
| `teams`               | —   | —            | `captain_id` CASCADE               | —        | SOFT        |
| `team_members`        | —   | —            | both CASCADE                       | —        | HARD        |
| `team_member_invites` | Low | —            | both CASCADE                       | —        | HARD + TTL  |
| `groups`              | —   | —            | `created_by` SET NULL (privacy P1) | —        | SOFT        |
| `group_members`       | —   | —            | both CASCADE                       | —        | HARD        |
| `group_followers`     | —   | —            | both CASCADE                       | —        | HARD        |

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

| Table                      | PII                                     | `deleted_at`       | Notes                                                                                                              | Recommended                                     |
| -------------------------- | --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `notifications`            | Low                                     | — (only `read_at`) | [20260524000000_notifications.sql#L58-L74](../../supabase/migrations/20260524000000_notifications.sql#L58-L74)     | SOFT + **scheduled hard purge** (P2 #2)         |
| `notification_outbox`      | **High** (rendered body + `to_address`) | —                  | [20260524000000_notifications.sql#L91-L114](../../supabase/migrations/20260524000000_notifications.sql#L91-L114)   | **APPEND-ONLY w/ retention cap** (P1 #1 — GDPR) |
| `broadcasts`               | Medium (rendered body)                  | —                  | [20260524000000_notifications.sql#L117-L135](../../supabase/migrations/20260524000000_notifications.sql#L117-L135) | SOFT (host audit trail, ~1-yr retention)        |
| `push_subscriptions`       | —                                       | —                  | device endpoints                                                                                                   | HARD on 410/404; HARD after 90d inactive        |
| `notification_preferences` | —                                       | —                  | `user_id` CASCADE                                                                                                  | HARD on user delete (already)                   |

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
- `hero_images` — uploaded but orphaned hero rows are not garbage
  collected when the parent group/event is hard-deleted (only
  CASCADE-deletes if the FK is set up that way). Audit fix: nightly cron
  `delete from hero_images where resource_id not in (select id from
events) and resource_id not in (select id from groups)` — see P2 #2 in
  [hero-images.md](hero-images.md).

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

| Spec to add                                                    | Asserts                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `groups-manage.authed.spec.ts >> owner can delete group`       | Group disappears from `/groups`, RLS hides the slug                |
| `teams.authed.spec.ts >> captain can delete team`              | Team disappears from `/teams`, registered events refuse the delete |
| `profile-delete.authed.spec.ts` (new)                          | Account deletion grace, PII scrub, FK SET NULLs                    |
| `event-host.authed.spec.ts >> host deletes event` (vs. cancel) | Soft-deleted event 404s for non-admins                             |
| `broadcasts.authed.spec.ts >> host hides a broadcast`          | Broadcast disappears from host history                             |

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

| Severity  | Item                                                                                       | Estimated effort | Status                      |
| --------- | ------------------------------------------------------------------------------------------ | ---------------- | --------------------------- |
| ~~P1 #1~~ | `notification_outbox` 90-day purge (one migration, ~30 LOC)                                | XS               | ✅ Shipped 2026-05-26       |
| **P2 #1** | Group delete (`deleted_at` column, command, server action, RLS filter, partial index)      | M                | open                        |
| **P2 #2** | Team delete (same shape as group)                                                          | M                | open                        |
| ~~P2 #3~~ | `notifications` TTL purge (one migration)                                                  | XS               | ✅ Shipped 2026-05-26       |
| ~~P2 #4~~ | E2E test cleanup helper + per-spec `afterAll` deletes                                      | S                | ✅ Shipped 2026-05-26       |
| **P2 #5** | `event_team_registrations` soft-delete after Stripe checkout (vs hard-delete pre-checkout) | S                | open                        |
| **P3 #1** | `broadcasts.deleted_at` so hosts can hide broadcasts from their audit list                 | S                | open                        |
| **P3 #2** | `hero-images` Storage orphan-sweep (see correction above; needs `storage.objects` walker)  | S–M              | open — scope larger than XS |
| ~~P3 #3~~ | `marketing_attribution` 24-month cap                                                       | XS               | ✅ Shipped 2026-05-26       |

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
