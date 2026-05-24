# Privacy / PII Audit + Account-Deletion Readiness

**Date:** 2026-05-24
**Scope:** all PII-bearing tables in `supabase/migrations/`, the request
path (logs, Sentry, email, analytics) in `apps/web/`, and the gap
analysis for a future "Delete my account" feature that preserves
historical / regulatory data.
**Method:** read-only static review of migrations + app code. No live
DB inspection.

## Headline

- There is **no account-deletion path today**. Even a manual delete is
  blocked by `events.host_id ON DELETE RESTRICT` + the symmetric
  `groups.created_by ON DELETE RESTRICT` + `broadcasts.sender_id` (no
  cascade clause). Any host can never be removed without first nuking
  every event and group they touched.
- The opposite problem also exists: several FKs CASCADE to `profiles` /
  `auth.users` in ways that would **destroy regulatory records** if we
  ever do flip the RESTRICT — notably `event_tips.host_id` (host's
  payout history), `host_stripe_accounts.user_id` (1099-K lookup),
  `host_subscriptions.user_id` (Pro billing history), and
  `event_attendees.user_id` (tournament attendance for paid events).
- The public surface is also wider than ideal: `profiles` is **fully
  publicly readable** (every column, including `business_name`,
  `business_address`, `tax_id`, all social handles, `home_city`). Most
  apps gate at least the business / tax columns behind owner-only RLS.
- `notification_outbox` retains full rendered email/SMS bodies + the
  recipient address indefinitely with no purge policy. Sent rows
  accumulate forever.
- Sentry browser config has `maskAllText: false` + `replaysOnErrorSampleRate: 1.0`,
  so any form that errors mid-fill (login, signup, RSVP, profile edit,
  guest RSVP with email/phone) **records the visible PII into session
  replay**.
- The ad-hoc team roster public projection falls back to a teammate's
  email as their `displayName` when the captain didn't supply one, so
  emails could surface on the event detail page to every viewer.
  Compounded by an unrestricted `using (true)` SELECT policy on the
  underlying member table, which exposes `email` and `user_id` to any
  authenticated client regardless of what the React layer renders.

## P1 — fix before adding any "Delete account" feature

### 1. `events.host_id` and `groups.created_by` are `ON DELETE RESTRICT`

**Files:**

- [supabase/migrations/20260512000000_init.sql#L78](../../supabase/migrations/20260512000000_init.sql#L78)
  — `host_id uuid not null references public.profiles(id) on delete restrict`
- [supabase/migrations/20260513000700_groups_and_co_hosts.sql#L29](../../supabase/migrations/20260513000700_groups_and_co_hosts.sql#L29)
  — `created_by uuid not null references public.profiles(id) on delete restrict`
- [supabase/migrations/20260524000000_notifications.sql#L119](../../supabase/migrations/20260524000000_notifications.sql#L119)
  — `sender_id uuid not null references auth.users(id)` (no `on delete`
  clause → defaults to `NO ACTION`, behaves like RESTRICT)

**Category:** account deletion blocker

A user who has ever hosted an event, founded a group, or sent a
broadcast **cannot be deleted** without first orphaning every related
aggregate. This is the right default for accidental deletion of an
auth row, but it has to change before we can offer a delete-my-account
flow.

**Recommended fix:** in the same migration that introduces
`profiles.deleted_at` (see P1 #2), flip these three FKs to
`ON DELETE SET NULL` and update the corresponding RLS so:

- `events` with `host_id IS NULL` are read-only (no UPDATE, no INSERT
  of child rows that require an authoring host).
- `groups` with `created_by IS NULL` are read-only.
- `broadcasts` with `sender_id IS NULL` continue to display as "Former
  member".

Co-host membership (`event_co_hosts`, `event_co_host_groups` —
[20260513000700_groups_and_co_hosts.sql#L62-L65](../../supabase/migrations/20260513000700_groups_and_co_hosts.sql#L62))
already CASCADEs and is fine.

### 2. No `profiles.deleted_at` / scrubbing column

**File:** [supabase/migrations/20260512000000_init.sql#L27-L48](../../supabase/migrations/20260512000000_init.sql#L27-L48)
**Category:** account deletion blocker

`profiles` has no soft-delete column. Until one exists there is no
"hard-delete the auth row, leave a scrubbed tombstone in profiles"
pattern available; FKs that point at `profiles(id)` will CASCADE-delete
everything (see P1 #3).

**Recommended fix:** add `deleted_at timestamptz` + `deletion_reason text`

- a check constraint on `deletion_reason in ('user_requested', 'admin_action',
'spam_suspension', 'inactive_purge')`. Application-layer deletion path
  then runs a single UPDATE that nulls out `first_name`, `last_name`,
  `avatar_url`, all social handles, `business_name`, `business_address`,
  `tax_id`, `home_city`, sets `display_name = 'Former member'`, and stamps
  `deleted_at`. Update every public-reading RLS policy and query to filter
  `deleted_at is null` (or to substitute placeholder text in joins).

### 3. CASCADE FKs that would destroy regulatory / historical data

**Files & FKs:**

- [supabase/migrations/20260518000000_event_tips.sql#L21](../../supabase/migrations/20260518000000_event_tips.sql#L21)
  — `host_id uuid not null references auth.users(id) on delete cascade`
  → deleting a host **erases every paid tip they received**. Tax-relevant.
- [supabase/migrations/20260515000000_stripe_foundation.sql#L26](../../supabase/migrations/20260515000000_stripe_foundation.sql#L26)
  — `host_stripe_accounts.user_id ... on delete cascade` → loses the
  `stripe_account_id ↔ user_id` linkage needed to reconcile Stripe
  1099-Ks issued under that Connect account.
- [supabase/migrations/20260517000000_pro_subscriptions.sql#L18](../../supabase/migrations/20260517000000_pro_subscriptions.sql#L18)
  — `host_subscriptions.user_id ... on delete cascade` → loses Pro
  billing history (subscription period, cancellation reason).
- [supabase/migrations/20260512000000_init.sql#L126](../../supabase/migrations/20260512000000_init.sql#L126)
  — `event_attendees.user_id ... on delete cascade` → deletes paid RSVPs.
  These rows are the only authoritative record of who paid for what
  tournament slot.
- [supabase/migrations/20260608000000_event_team_payments.sql#L27](../../supabase/migrations/20260608000000_event_team_payments.sql#L27)
  — `event_team_payments.captain_id ... on delete cascade` → loses team
  payment history.
- [supabase/migrations/20260530000100_community_listings.sql#L39](../../supabase/migrations/20260530000100_community_listings.sql#L39)
  — `community_listings.submitter_user_id ... on delete cascade` → would
  delete the listing, including any claimed/approved redirects to
  PickupVB events.

**Category:** data preservation

**Recommended fix:** flip each to `ON DELETE SET NULL` (and make the
column nullable where it's currently `not null`). The associated reads
must then tolerate a `null` user — surface "Former member" / "Deleted
host" in the UI rather than crashing. `host_stripe_accounts` and
`host_subscriptions` are special: they should **never CASCADE-delete**,
even on full purge, because of tax reconciliation. Migrate them to
`SET NULL` with a separate `stripe_account_id` / `stripe_customer_id`
that survives the user.

The exceptions where CASCADE is correct and should stay:

- `friendships` ([init.sql#L51-L52](../../supabase/migrations/20260512000000_init.sql#L51-L52))
  — social graph has no retention value.
- `team_members` ([init.sql#L70](../../supabase/migrations/20260512000000_init.sql#L70))
  — roster history, low business value.
- `push_subscriptions` ([20260527000000_push_subscriptions.sql#L10](../../supabase/migrations/20260527000000_push_subscriptions.sql#L10))
  — device tokens become useless.
- `notification_preferences` + `notifications`
  ([20260524000000_notifications.sql#L19](../../supabase/migrations/20260524000000_notifications.sql#L19),
  [#L60](../../supabase/migrations/20260524000000_notifications.sql#L60))
  — user-private settings + transient feed.
- `event_free_agents`
  ([20260514000200_event_free_agents.sql#L10](../../supabase/migrations/20260514000200_event_free_agents.sql#L10))
  — availability signal, no historical record value.

### 4. `profiles` exposes business + tax fields publicly via RLS

**File:** [supabase/migrations/20260523000000_profiles_business_fields.sql](../../supabase/migrations/20260523000000_profiles_business_fields.sql)

- original SELECT policy in [20260512000000_init.sql](../../supabase/migrations/20260512000000_init.sql)
  **Category:** RLS exposure

`profiles` has a single permissive SELECT policy that allows every
anon/authenticated viewer to read every column, including:

- `business_name`, `business_address`, `tax_id` (added 2026-05-23 for
  1099 issuance)
- All social handles + `website_url` (publicly listed today, which is
  intentional)
- `home_city` (intentional)
- `first_name`, `last_name` (currently public — likely unintended; the
  app primarily displays `display_name`)

**Recommended fix:** keep a single permissive SELECT but split the
table column visibility via a public view, or use a more restrictive
policy that excludes sensitive columns from anon clients. The cleanest
pattern is:

1. Create a `profiles_public` view that projects only the columns
   meant for public display (`id`, `handle`, `display_name`,
   `avatar_url`, `home_city`, social handles, `theme_preference`,
   `show_pro_badge`, `created_at`).
2. Switch every public read site (player pages, attendee lists, host
   chips) to read from the view.
3. Tighten the `profiles` SELECT policy to owner-only + platform-admin
   for the full row.

`first_name`, `last_name`, `business_*`, `tax_id` then become
owner-only at the row level even if a join sneaks them in.

### 5. Ad-hoc team roster leaks teammate emails to event viewers

**Files:**

- [apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts#L555](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts#L555)
  — public `allRegistrations` projection: `displayName: m.display_name ?? m.email ?? 'Player'`
  (partially fixed 2026-05-24 — see remediation log).
- [supabase/migrations/20260606000000_team_registration_model.sql#L153-L154](../../supabase/migrations/20260606000000_team_registration_model.sql#L153-L154)
  — `event_team_registration_members` SELECT policy is `using (true)`,
  so even after the loader is fixed any authenticated client can
  query the table directly and read every member's `email` and
  `user_id`.

**Category:** PII leak via public read path

The ad-hoc team registration roster is rendered to every event viewer
(see [\_components/ad-hoc-team-list.tsx](../../apps/web/src/app/events/[id]/_components/ad-hoc-team-list.tsx)
— `AdHocTeamPublicEntry`). The loader was projecting
`displayName: m.display_name ?? m.email ?? 'Player'`, which meant a
teammate added by email with no display name had their email rendered
as their public name. Captain (`viewerRegistrations`) and host
(`hostRows`) projections keep `email` as a separate field by design —
those audiences are authorized to see it.

Even with the loader fixed, the underlying `event_team_registration_members`
table has an unrestricted SELECT policy, so a determined caller can
read `email` directly via the Supabase JS client.

**Recommended fix:**

1. ✅ Drop the `?? m.email` fallback from `allRegistrations` so the
   public surface never falls through to email.
2. Replace the `using (true)` SELECT policy on
   `event_team_registration_members` with a captain-or-host-or-self
   policy (mirror the UPDATE/DELETE policies that already exist on
   the same table). Public reads then go through a new view
   `event_team_registration_members_public` that projects only
   `(id, registration_id, display_name, sort_order)` — no `email`,
   no `user_id`.
3. Switch `loadAdHocRowsCached` to read from the view for the public
   projection and from the base table (admin client) only when
   constructing the captain / host projections.

Until step 2 ships, the leak surface is narrower (anyone calling the
Supabase REST API directly with an anon key, not anyone loading the
event page) but it's still a real exposure.

## P2 — schedule into the next sprint

### 5. `notification_outbox` retains rendered message bodies forever

**File:** [supabase/migrations/20260524000000_notifications.sql#L81-L120](../../supabase/migrations/20260524000000_notifications.sql#L81)
**Category:** data retention

The outbox stores `to_address`, `payload` (full rendered email/SMS
body), and `provider_id` per delivery. There is no purge cron and the
table grows unbounded. For email containing event details + co-host
names + tip-receipt amounts this is a meaningful PII pool.

**Recommended fix:** schedule a daily cron route at
`apps/web/src/app/api/notifications/outbox-purge/route.ts` that deletes
outbox rows where `status in ('sent', 'skipped')` and `sent_at < now() -
interval '30 days'`. Failed rows (`status in ('failed')`) older than
90 days can also be purged (they've been retried enough). Pair with a
new column `payload_purged_at` if we want to keep the row as a
delivery-receipt skeleton (status + provider_id + sent_at) but null
`payload` + `to_address` for older entries — that gives the support
team enough audit trail without retaining bodies.

### 6. Sentry session replay captures form PII on errors

**Files:**

- [apps/web/instrumentation-client.ts](../../apps/web/instrumentation-client.ts)
  — `replaysOnErrorSampleRate: 1.0`, `maskAllText: false`,
  `blockAllMedia: false`
- Global error boundaries: [apps/web/src/app/error.tsx](../../apps/web/src/app/error.tsx),
  [apps/web/src/app/events/[id]/error.tsx](../../apps/web/src/app/events/[id]/error.tsx),
  [apps/web/src/app/events/new/error.tsx](../../apps/web/src/app/events/new/error.tsx)

**Category:** third-party data exposure

When any client error fires, Sentry uploads a session replay with the
visible DOM intact. Forms hit by errors include sign-up (`email`,
`password`), profile edit (business/tax fields), guest RSVP (`email`,
`phone`, `notes`), and any Stripe Elements page. Sentry replay does
mask `<input type="password">` automatically but **not** standard text
inputs.

**Recommended fix:** turn on `maskAllText: true` + `blockAllMedia: true`
in [instrumentation-client.ts](../../apps/web/instrumentation-client.ts).
For high-signal debugging on specific pages, opt in via the
`data-sentry-unmask` attribute on the elements that genuinely need
unmasking (button labels, status text). Alternatively use the
`Sentry.Replay`-style `maskTextSelector`/`unmaskTextSelector` config.

### 7. `event_guests` rows are orphaned forever (no FK, no purge)

**File:** [supabase/migrations/20260513000800_event_guests.sql](../../supabase/migrations/20260513000800_event_guests.sql)
**Category:** data retention
**Status:** ✅ resolved — table dropped in anon auth pivot

`event_guests` was dropped in
[20260513001100_anon_auth_pivot.sql](../../supabase/migrations/20260513001100_anon_auth_pivot.sql).
Anonymous RSVPers now sign in via `supabase.auth.signInAnonymously()`,
getting a real `auth.users` row (`is_anonymous = true`), a `profiles`
row, and a normal `event_attendees` row. No separate email/phone/notes
table exists anymore; the soft-delete path from P1 #2 covers anonymous
profiles the same as regular ones.

### 8. `community_listing_reports.reason` is freeform with no PII filter

**File:** [supabase/migrations/20260530000100_community_listings.sql#L64-L75](../../supabase/migrations/20260530000100_community_listings.sql#L64)
**Category:** user-supplied PII

The `reason` text column captures whatever the reporter types. A
report saying "the host @JaneDoe is a known scammer at 555-1212" lives
in the table indefinitely with the reporter's `user_id` attached.

**Recommended fix:** truncate the `reason` to 500 chars at the
application boundary (already does this? confirm in
`reportCommunityListing` handler), purge rows for listings older than
6 months via the same cron in P2 #7, and front the reason text with a
template dropdown ("spam", "broken link", "duplicate", "wrong
location", "other") so the freeform path is the exception.

### 9. `host_stripe_accounts.last_event_payload` stores raw Stripe webhook

**File:** [supabase/migrations/20260515000000_stripe_foundation.sql#L24-L50](../../supabase/migrations/20260515000000_stripe_foundation.sql#L24)
**Category:** PII via third-party payload

`host_stripe_accounts` retains the most recent `account.updated`
webhook payload as JSON for debugging. That payload from Stripe
includes the host's legal name, DOB (verification), address, last4 of
SSN/EIN for US accounts, and the bank account last4 for payouts.

**Recommended fix:** either (a) stop persisting the full payload and
keep only the fields we explicitly need (`charges_enabled`,
`payouts_enabled`, `details_submitted`, `requirements.currently_due`),
or (b) gate the column behind owner-only RLS even from service-role
clients used in non-payment code paths, and add a 30-day purge so it's
only available for incident debugging.

## P3 — nice-to-have

### 10. `rate_limits.key` may store raw emails / IPs

**File:** [supabase/migrations/20260610000000_rate_limits.sql#L19](../../supabase/migrations/20260610000000_rate_limits.sql#L19)
**Category:** quasi-identifier persistence

If `key` is constructed as `email:user@example.com` or `ip:1.2.3.4`,
those raw identifiers live in the DB for the duration of the window.
Low risk — table is service-role only and rows expire — but easy to
harden.

**Recommended fix:** hash the per-actor portion at the call site
(`'email:' + sha256(email).slice(0,16)` or `'ip:' + sha256(ip+SECRET).slice(0,16)`)
before writing. Lookups still work because the hash is deterministic.

### 11. Public profile pages are fully indexable

**File:** [apps/web/src/app/players/[handle]/page.tsx](../../apps/web/src/app/players/[handle]/page.tsx)

- [apps/web/src/app/sitemap.ts](../../apps/web/src/app/sitemap.ts)
  **Category:** SEO + privacy intersection

Player profile pages are listed in the production sitemap with no
opt-out flag. After a user is soft-deleted (P1 #2), their handle URL
will still resolve and may live in Google's index for weeks. Not a
data leak — the page should already render "Former member" with no
PII — but worth a `robots: noindex` for soft-deleted profiles, and a
sitemap filter that excludes them.

**Recommended fix:** in `generateMetadata` on the player page, return
`robots: { index: false, follow: false }` when `profile.deleted_at` is
non-null. Filter the sitemap loader (same file) to exclude deleted
profiles.

### 12. No data-export endpoint (GDPR Article 20 / CCPA portability)

**Files:** none — the feature doesn't exist.
**Category:** legal feature gap

GDPR Article 20 and CCPA § 1798.100 obligate us to provide a
machine-readable export of a user's data on request. We have no
endpoint and no UI. Even before adding "Delete my account" this is
worth shipping because (a) it forces the data-inventory work, and
(b) it gives us a safe answer when a user emails asking for their
data.

**Recommended fix:** ship `GET /api/account/export` returning a single
JSON file with `profile`, `events_hosted`, `event_attendees`,
`event_tips` (as tipper and as host), `event_payment_audit`,
`friendships`, `team_members`, `teams` captained, `community_listings`
submitted, `notifications`, `notification_preferences`,
`push_subscriptions`. Pair with a UI button on
`apps/web/src/app/profile/` that downloads it.

## Account-deletion design sketch

If/when we build "Delete my account", the recommended shape:

- **Two-stage flow with a 30-day grace period.** User clicks "Delete
  account" → server creates a `deletion_requests` row with
  `status='pending'`, `scheduled_for = now() + 30 days`. We send a
  confirmation email; on confirm the row moves to `status='confirmed'`.
  A daily cron under `apps/web/src/app/api/account/execute-deletions/route.ts`
  (Vercel cron, same shape as
  [apps/web/src/app/api/notifications/reminders/route.ts](../../apps/web/src/app/api/notifications/reminders/route.ts))
  picks up `confirmed` rows whose `scheduled_for <= now()` and
  executes the purge. Until then the user can cancel from
  `/profile/account/delete`.
- **Two layers of removal, not one.** First the cron updates
  `profiles` in place: scrub display fields → "Former member",
  null all PII/business columns, stamp `deleted_at`. Second it calls
  `supabase.auth.admin.deleteUser(userId)`, which removes the
  `auth.users` row. With P1 #1+#3 done the auth row deletion cascades
  cleanly: regulatory rows stay (SET NULL), transient rows go away
  (CASCADE).
- **Stripe side-effects, in order.**
  - Cancel `host_subscriptions.stripe_subscription_id` via
    Stripe API (Pro Host) if active.
  - **Do not** delete the Stripe Connect account — it's tied to
    1099-K issuance and historical payouts. Keep
    `host_stripe_accounts` with `user_id` SET NULL so the
    `stripe_account_id` survives as a Stripe-side reconciliation key.
- **Notifications cleanup.** Delete `push_subscriptions` (tokens become
  useless), `notification_preferences` (user settings), and
  `notifications` (in-app feed). Mark `notification_outbox` rows for
  the user `status='cancelled'` if still pending.
- **New domain primitive.** Add `DeletionRequestAggregate` under
  `packages/domain/src/users/deletion-request.ts` with state machine
  `pending → confirmed → executed | cancelled`. Application-layer
  handlers: `RequestAccountDeletionHandler`, `ConfirmAccountDeletionHandler`,
  `CancelAccountDeletionHandler`, `ExecuteAccountDeletionHandler`
  (cron-only).
- **Notification kinds.** Add `account.deletion.requested`,
  `account.deletion.confirmed`, `account.deletion.executed`,
  `account.deletion.cancelled` to
  [packages/notifications/src/kinds.ts](../../packages/notifications/src/kinds.ts).
- **ADR.** Worth an ADR (`docs/adr/`) documenting the soft-delete
  decision, the FK migration strategy, and the retention windows for
  each table (tax records: 7 years; outbox: 30 days; guest PII: 180
  days). Once those numbers are pinned they shouldn't drift.

Total scope: ~1 migration (FK flips + soft-delete + deletion_requests
table), ~1 domain aggregate + 4 application handlers, 1 composition
wire-up, 1 cron route, 1 profile UI page, 1 export endpoint, and
RLS / view rework for `profiles` public columns. Roughly the same
shape as bundle 74 (moderation queue) but heavier on migrations and
RLS than UI.

## Open questions

- **Retention windows.** US Federal tax-record retention is 7 years.
  Do we want to enforce that on `event_payment_audit` + `event_tips`
  rows by pinning them in place (already SET NULL on user) or do we
  want a separate "anonymized after 7y" pass? Talk to whoever signs
  the 1099s before deciding.
- **CCPA "Limit the Use of My Sensitive Personal Information" toggle.**
  We're not consumer-targeted enough to need this yet but worth tracking
  as we add California traffic.
- **Anonymous-auth users.** They have `auth.users` rows and `profiles`
  rows but no email. The deletion flow needs to special-case them
  (no confirmation email to send → can we skip the grace period?). Per
  AGENTS.md, anonymous users have `is_anonymous=true` in the JWT, so
  the check is easy.
- **CUI.** No data we hold today qualifies as CUI under NIST SP 800-171
  (that's a federal-contractor category — controlled unclassified info
  like ITAR/EAR-adjacent data). Mentioned in the request title; flagging
  here so we don't conflate it with PII. If we ever take federal money
  this gets a separate audit.

## Remediation log

### 2026-05-24 — P1 #5 step 1: drop email-as-displayName fallback in public roster

[apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts#L549-L562](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts#L549-L562) —
the public `allRegistrations` projection now falls back to `'Player'`
directly instead of leaking the teammate email. Captain
(`viewerRegistrations`) and host (`hostRows`) projections are
unchanged — those audiences need the email and are gated by membership
in the registration. Steps 2 + 3 shipped in Bundle 89 (see below).

### 2026-05-24 — Bundle 89: P1 #1 + #2 + #3 + #4 step 1 + #5 steps 2 + 3

**P1 #2** — `profiles.deleted_at` (timestamptz) and `deletion_reason`
(text, check-constrained enum) added in
[20260620000000_pii_p1_soft_delete_and_fk_nullability.sql](../../supabase/migrations/20260620000000_pii_p1_soft_delete_and_fk_nullability.sql).
Partial index on `deleted_at` for efficient soft-delete filtering.

**P1 #1** — `events.host_id`, `groups.created_by`, `broadcasts.sender_id`
flipped from RESTRICT / NO ACTION to `ON DELETE SET NULL`, columns made
nullable. Same migration as P1 #2.

**P1 #3** — Six CASCADE FKs flipped to `ON DELETE SET NULL` with
nullable columns: `event_tips.host_id`, `host_stripe_accounts.user_id`
(+ surrogate PK added), `host_subscriptions.user_id` (+ surrogate PK
added), `event_attendees.user_id` (+ surrogate UUID PK replacing
composite PK, partial unique index `WHERE user_id IS NOT NULL`),
`event_team_payments.captain_id`, `community_listings.submitter_user_id`.
Same migration as P1 #2.

**P1 #4 step 1** — `profiles_public` view created in
[20260621000000_pii_p1_profiles_public_view.sql](../../supabase/migrations/20260621000000_pii_p1_profiles_public_view.sql)
projecting safe public columns only; filters `deleted_at IS NULL`.
Granted to `anon, authenticated`. Base-table policy unchanged — steps
2 + 3 (app query migration + policy tighten) remain open.

**P1 #5 steps 2 + 3** —
[20260622000000_pii_p1_team_members_rls.sql](../../supabase/migrations/20260622000000_pii_p1_team_members_rls.sql)
drops the `using (true)` SELECT policy on `event_team_registration_members`,
replaces it with captain-or-host-or-self, and creates
`event_team_registration_members_public` view `(id, registration_id,
display_name, sort_order)` granted to `anon, authenticated`.
App-layer loader step (switch `loadAdHocRowsCached` public projection to
use the view) remains open as a follow-up.

**Open from this bundle:**

- P1 #4 steps 2 + 3: app-wide query migration to `profiles_public` + policy tighten
- P1 #5 step 3 (app-layer): `loadAdHocRowsCached` public projection
- Soft-delete application path: `DeletionRequestAggregate`, cron, profile scrub UI

### 2026-05-24 — P2 #5: notification_outbox purge cron

[apps/web/src/app/api/notifications/outbox-purge/route.ts](../../apps/web/src/app/api/notifications/outbox-purge/route.ts) —
daily cron (04:00 UTC, registered in `vercel.json`) that deletes
`notification_outbox` rows where `status in ('sent', 'skipped')` and
`sent_at < now() - 30 days`, and `status = 'failed'` rows where
`created_at < now() - 90 days`. Both deletes run concurrently via
`Promise.all`. Pattern mirrors the existing reminders cron route.

### 2026-05-24 — P2 #8: community_listing_reports reason dropdown + purge

**Reason dropdown** —
[apps/web/src/app/community/[slug]/page.tsx](../../apps/web/src/app/community/%5Bslug%5D/page.tsx):
replaced the bare submit button in the report form with a `<select name="reason">` dropdown
(spam, broken link, duplicate, wrong location, other) so freeform text is never
collected. [listing-actions.ts](../../apps/web/src/app/community/%5Bslug%5D/listing-actions.ts):
`reportListingFromForm` now reads `reason` from FormData; `reportListing` accepts
and truncates it to 500 chars before passing to the command.

**Report purge** — added to the daily maintenance cron in
[apps/web/src/app/api/notifications/outbox-purge/route.ts](../../apps/web/src/app/api/notifications/outbox-purge/route.ts):
deletes `community_listing_reports` rows older than 180 days. Reporter `user_id`
and reason have no moderation value past the initial review window.

### 2026-05-24 — P2 #6: mask Sentry session replay

[apps/web/instrumentation-client.ts](../../apps/web/instrumentation-client.ts) —
set `maskAllText: true` and `blockAllMedia: true` on `replayIntegration`.
Session replays on error no longer capture visible DOM text (form field
values, display names, addresses) or media. Use `data-sentry-unmask`
on specific elements if high-signal debugging needs a targeted opt-in.
