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

## 2026-06-07 re-audit — status update (post-audit feature sweep)

Re-ran the privacy review focused on everything shipped **after** the 2026-05-31
re-audit (migrations `20260901000000` → `20260919000000` — profiles geo, badges,
walk-in roster teams on leagues, the capacity waitlist, room-message fan-out,
media posts/votes, broadcast notifications, save-event/bracket RPCs). The
2026-05-31 posture is intact; the new features mostly land sound RLS, but the
sweep surfaced **four new findings** (one P1, one P2, two P3).

- **#16 (P1, data leak) — walk-in captain phone is REST-readable.** The
  account-less walk-in/ad-hoc team feature stores a freeform `captain_phone` on
  `event_team_entries`, whose SELECT policy is `using (deleted_at is null)` —
  i.e. every live row is readable by **anon + authenticated** via the REST API.
  The rendered event page is safe (the loader only surfaces `captain_phone` in
  the host projection), but a direct `GET
/rest/v1/event_team_entries?select=name,captain_phone&captain_phone=not.is.null`
  with the public anon key bulk-harvests every walk-in captain's phone number —
  non-consenting third parties entered by hosts. **Exactly the P1 #5 mechanism**
  (the ad-hoc `event_team_registration_members.email` leak), which we fixed for
  the members table but the captain-phone column on the _entries_ table was
  never tightened. See #16.
- **#17 (P2, location exposure) — `profiles_public` publishes raw player
  coordinates to anon.** `20260901000000_profiles_geo.sql` added
  `latitude`/`longitude` (geocoded from the free-text `home_city`) and surfaced
  them on the anon-readable `profiles_public` view at full geocoder precision,
  with no rounding/fuzzing and no separate opt-out. City-typed input is harmless
  (centroid), but the field accepts a full street address → rooftop precision,
  published to the whole internet and bulk-queryable. See #17.
- **#18 (P3, export completeness) — new tables absent from the GDPR export.**
  `GET /api/account/export` predates several user-data tables and was never
  extended: `media_posts` (the user's submitted clips — clearly portable
  content), `media_post_votes`, `media_post_reports`, `user_badges`, and
  `event_waitlist` are all missing. See #18.
- **#19 (P3, retention) — `media_post_reports.reason` is freeform with no
  purge.** Same class as the resolved P2 #8 (`community_listing_reports`): a
  reporter's free text + `reporter_user_id` accumulate forever with no template
  dropdown and no purge cron. See #19.

**Verified sound (no change needed):** `user_badges` (owner-only base SELECT +
definer `user_badges_public` view filtering `hidden` + `deleted_at`),
`media_post_votes` (own-ballot-only SELECT + aggregate-only `media_post_vote_counts`
view with no voter ids), `event_waitlist` RLS (self-or-host), `list_room_recipients`
(SECURITY DEFINER, `service_role`-only, mirrors `can_access_conversation`),
`broadcast_notification` (per-recipient `realtime.messages` topic RLS),
`event_badge_access` (admin/webhook-only Stripe mirror, `purchased_by_user_id`
SET NULL). Account **deletion** covers the new tables via FK CASCADE to
`profiles` (`media_posts`, `media_post_votes`, `user_badges`, `event_waitlist`);
the gap is **export**, not deletion (#18). `media_posts` stores external
`https://` URLs only (no uploads) — no storage-orphan retention gap.

## 2026-05-31 re-audit — status update

Re-ran the privacy review against the current tree. **Compliance posture from
the 2026-05-24 bundle is intact** — owner-only `profiles` RLS + `profiles_public`
projection, FK `SET NULL` flips, `profiles.deleted_at` soft-delete column, masked
Sentry replay (`maskAllText: true`, `blockAllMedia: true`,
`replaysOnErrorSampleRate` lowered to 0.3), and the outbox / listing-report purge
crons all verified still present and unchanged.

The headline of this re-audit is a **regression caused by that hardening**: the
owner-only base-`profiles` SELECT policy (P1 #4 step 3) silently broke three
features shipped _afterward_ (chat/messaging, media posts) that read author /
sender display cards from the base `profiles` table over a user-scoped client
instead of from `profiles_public`. RLS was doing its job (failing safe — no
leak), but every _other_ user's name/avatar resolved to null. Filed and fixed
this bundle as **#13** (P1, correctness regression — not a data-leak).

- **Verified still compliant (no change):** P1 #1 (FK SET NULL), P1 #3 (regulatory
  CASCADE flips), P1 #4 (`profiles_public` + owner-only RLS), P1 #5 (ad-hoc roster
  email leak), P2 #5 (outbox purge), P2 #6 (Sentry mask), P2 #8 (listing-report
  dropdown + purge). New chat tables (`conversations` / `messages` /
  `user_blocks` / …) and `media_posts` have sound RLS + FK posture (private
  `chat-attachments` bucket gated by `can_access_conversation`; signed URLs only).
- **Found + fixed this bundle:** **#13** — profiles-RLS regression in chat
  `listMessages`, chat `get_inbox` DM titles, and media-post `decorate` author
  cards. All three now read `profiles_public`. See remediation log.
- **Newly logged:** **#14** (P2) chat `messages` + `chat-attachments` had no
  retention/purge (now resolved — see below); **#15** (P2) chat tables weren't in
  the account-deletion design sketch or the data-export inventory.
- **Data-export endpoint (P3 #12) — now shipped (2026-05-31):**
  `GET /api/account/export` + a profile "Download my data" link, covering the
  full table inventory incl. chat (resolves the export half of #15). See P3 #12
  - remediation log.
- **Account-deletion application path (P1 #2 follow-up) — now shipped
  (2026-05-31):** `DeletionRequest` aggregate + `deletion_requests` ledger,
  30-day grace, `/profile/account/delete` UI, the `execute-deletions` cron, and
  the `executeAccountDeletion` purge — resolves the deletion half of #15. See
  [ADR 0029](../adr/0029-account-deletion.md), P1 #2, and the remediation log.
- **`rate_limits.key` plaintext (P3 #10) — now resolved (2026-05-31):** a shared
  `rateLimitKey()` helper hashes the email/IP portion (salted via
  `RATE_LIMIT_SALT`) at all call sites. See P3 #10 + remediation log.
- **Chat retention (#14, P2) — now resolved (2026-05-31):**
  [20260829000000_chat_retention.sql](../../supabase/migrations/20260829000000_chat_retention.sql)
  adds a `chat-attachments` orphan-sweep walker + daily cron, a 30-day scrub of
  soft-deleted message body/attachments, and relaxes `messages_nonempty` so a
  tombstone can be emptied. See #14 + the remediation log; the data-lifecycle
  inventory is updated in [data-lifecycle.md](data-lifecycle.md) §1.
- **Remaining backlog:** **none.** Every privacy finding (P1–P3) is resolved. P3
  #11 (deleted-profile indexing) is **resolved by side-effect** (see its entry).

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
**Status:** ✅ resolved (2026-05-31) — soft-delete column shipped Bundle 89; the
full application deletion path shipped 2026-05-31 (ADR 0029). The user-facing
"delete my account" flow now exists end to end: a `deletion_requests` ledger +
`DeletionRequest` aggregate, a 30-day grace window, `/profile/account/delete`
UI, a `CRON_SECRET`-gated `/api/account/execute-deletions` daily cron, and the
`executeAccountDeletion` purge (scrub → Stripe cancel → notif cleanup → mark
executed → `auth.admin.deleteUser`). See [ADR 0029](../adr/0029-account-deletion.md)
and the remediation log below.

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

### 16. Walk-in captain phone is REST-readable on `event_team_entries` (PII leak)

**Files:**

- [supabase/migrations/20260731000000_collapse_team_registration_tables.sql#L104-L107](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql#L104-L107)
  — `captain_phone text` lives on `event_team_entries`.
- [supabase/migrations/20260731000000_collapse_team_registration_tables.sql#L386-L388](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql#L386-L388)
  — `event_team_entries_select … using (deleted_at is null)` (the whole live row,
  including `captain_phone`, is readable by every role).
- [apps/web/src/app/events/[id]/walk-in-team-actions.ts#L100-L118](../../apps/web/src/app/events/[id]/walk-in-team-actions.ts#L100-L118)
  — the host types the account-less captain's phone here.

**Category:** PII leak via public read path
**Status:** open (filed 2026-06-07)

The walk-in / host-added team feature (ADR 0017 → ADR 0033, generalized to
roster/league divisions in `20260909000000`) lets a host register a team that
paid off-platform, capturing the captain's **phone number** as a freeform
`captain_phone`. That column lives on `event_team_entries`, whose SELECT policy
is `using (deleted_at is null)` — permissive for **anon + authenticated** (the
default Supabase table grants apply). So a direct REST call with the public anon
key:

```
GET /rest/v1/event_team_entries?select=name,captain_phone&captain_phone=not.is.null
```

returns every live walk-in captain's name + phone across all events — a bulk PII
harvest of non-consenting third parties (the captain never signed up or accepted
a privacy policy; the host entered their number).

The **rendered page is safe**: `loadAdHocPublicRowsCached` reads only safe
columns on the admin client, and the loader surfaces `captain_phone` only in the
host (`hostRows`) projection
([load-event-detail.ts#L579-L610](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts#L579-L610)).
The exposure is the **table-level RLS**, exactly the residual P1 #5 fixed for the
ad-hoc _members_ table (`event_team_registration_members.email`) — we tightened
the members base SELECT + added a narrow public view, but the **entries** table
kept `using (deleted_at is null)` and that's where `captain_phone` sits.

**Recommended fix (cleanest, no app churn):** a column-level GRANT revoke — keep
the permissive row policy (lots of user-scoped reads of `event_team_entries`
rely on it for `name`/`source`/`display_name`), but stop exposing the phone
column to public roles:

```sql
-- captain_phone is host-only PII; the host read goes through the admin client
-- (loadAdHocRowsCached), so revoking the column grant breaks no app path.
revoke select on public.event_team_entries from anon, authenticated;
grant  select (id, division_id, source, team_id, captain_id,
               captain_display_name, name, registered_at, deleted_at,
               created_at, updated_at)
  on public.event_team_entries to anon, authenticated;
```

`captain_display_name` stays public (it's the roster name the page renders);
`captain_phone` is simply not selectable by anon/authenticated. Verify the
public roster loader (admin client) and any user-scoped `event_team_entries`
reads (bracket/schedule/league) don't select `captain_phone` — they don't today.
Add a follow-up migration (never edit `20260731000000`).

### 17. `profiles_public` publishes raw player coordinates to anon (location exposure)

**Files:**

- [supabase/migrations/20260901000000_profiles_geo.sql#L34-L59](../../supabase/migrations/20260901000000_profiles_geo.sql#L34-L59)
  — `latitude` / `longitude` added to the anon-readable `profiles_public` view at
  full precision.
- [apps/web/src/app/profile/actions.ts#L110-L121](../../apps/web/src/app/profile/actions.ts#L110-L121)
  — geocodes the free-text `home_city` and writes the raw coords.

**Category:** quasi-identifier / location exposure
**Status:** open (filed 2026-06-07)

`profiles_geo` (players "near me", PL-5) geocodes a profile's `home_city` to
lat/lng and exposes both columns on `profiles_public`, which is granted to
`anon, authenticated`. Two concerns:

1. **Unbounded precision.** `home_city` is a free-text field (up to 120 chars).
   A user who types just a city gets a harmless centroid, but the field accepts a
   full street address, and MapTiler will geocode that to rooftop precision. That
   precise home coordinate is then published to the entire internet.
2. **Bulk-queryable, no opt-out.** Anyone with the anon key can enumerate
   `profiles_public` and pull every player's coordinates — location profiling of
   the whole user base. There's no toggle to display a city without publishing
   coords, and the onboarding "complete your profile" rule encourages filling
   `home_city`.

A player's home coordinate is more sensitive than an event venue (which is
intentionally public). The directory only needs ~metro proximity, so full
precision buys nothing.

**Recommended fix:** round the coordinates **in the view** so precision is
bounded regardless of what the user typed — e.g. `round(latitude::numeric, 2)`
(~1.1 km) — keeping full precision (if ever needed) on the owner-only base
`profiles` row:

```sql
-- in the profiles_public rebuild
round(latitude::numeric,  2) as latitude,
round(longitude::numeric, 2) as longitude,
```

2-decimal rounding still drives the bounding-box "near me" filter + distance
chip. Optionally add a `share_location` opt-out column gating whether coords are
projected at all. Follow-up migration; rebuild `profiles_public` (DROP+CREATE,
re-grant) per the existing pattern.

### 18. New user-data tables are absent from the GDPR data export

**File:** [apps/web/src/app/api/account/export/route.ts#L37-L158](../../apps/web/src/app/api/account/export/route.ts#L37-L158)
**Category:** legal feature gap (Art. 20 portability)
**Status:** open (filed 2026-06-07)

The export (P3 #12) covers a fixed 15-category list and predates several tables
that store the caller's own data:

- `media_posts` (`submitter_user_id = uid`) — the user's submitted clips/streams
  (title, description, `video_url`). User-generated **content** — the clearest
  Art. 20 case of the four.
- `media_post_votes` (`voter_user_id = uid`) — their ballots.
- `media_post_reports` (`reporter_user_id = uid`) — their reports.
- `user_badges` (`user_id = uid`) — earned achievements (read via the
  `set_user_badge_hidden`-style owner SELECT policy).
- `event_waitlist` (`user_id = uid`) — their queue entries.

**Recommended fix:** add these as categories in the `Promise.all`, each filtered
to `uid` on the user-scoped client (every one has an owner/self RLS read path, so
the filter and policy agree — matching the existing pattern). `media_posts` and
`event_waitlist` read cleanly under their own RLS; `user_badges` SELECT-own is
owner-scoped. Keep the throw-on-partial guard so a missing category fails loudly.

### 19. `media_post_reports.reason` is freeform with no purge

**File:** [supabase/migrations/20260820000000_media_posts.sql#L67-L74](../../supabase/migrations/20260820000000_media_posts.sql#L67-L74)
**Category:** user-supplied PII / retention
**Status:** open (filed 2026-06-07)

`media_post_reports.reason` is freeform text + `reporter_user_id`, retained
indefinitely — the same shape as `community_listing_reports.reason`, which P2 #8
resolved with a template dropdown + a 180-day purge. The media-report path has
neither.

**Recommended fix:** mirror the P2 #8 remediation — front the report form with a
reason dropdown (spam, inappropriate, off-topic, broken link, other) so freeform
is the exception, truncate to 500 chars at the boundary, and add a
`media_post_reports` older-than-180-days delete to the existing daily maintenance
cron in
[api/notifications/outbox-purge/route.ts](../../apps/web/src/app/api/notifications/outbox-purge/route.ts)
(where the `community_listing_reports` purge already lives).

### 13. Owner-only `profiles` RLS broke display cards in chat + media (regression)

**Files (all fixed 2026-05-31 — see remediation log):**

- [packages/infrastructure/src/supabase-messaging-repository.ts#L249-L252](../../packages/infrastructure/src/supabase-messaging-repository.ts#L249-L252)
  — `listMessages` embedded `sender:profiles!messages_sender_id_fkey(...)`.
- [supabase/migrations/20260825000000_chat_inbox_rpcs.sql#L62-L68](../../supabase/migrations/20260825000000_chat_inbox_rpcs.sql#L62-L68)
  — `get_inbox` DM-title subquery `join public.profiles pr` (SECURITY INVOKER).
- [packages/infrastructure/src/supabase-media-post-repository.ts#L369-L370](../../packages/infrastructure/src/supabase-media-post-repository.ts#L369-L370)
  — `decorate` read `from('profiles')` for submitter cards.

**Category:** correctness regression caused by privacy hardening (no data leak)

P1 #4 step 3 tightened the base `profiles` SELECT policy to
`auth.uid() = id OR is_platform_admin()`. Three features shipped _after_ that
migration read other users' display cards (`display_name` / `avatar_url`)
straight from the base table over a **user-scoped** client (chat) or a
**SECURITY INVOKER** function (the inbox RPC). Under owner-only RLS each of
those reads resolves to the caller's own row only, so:

- **Chat thread (DM + team/event/group rooms):** every historical message from
  anyone other than the viewer rendered as "Member" with no avatar. (Live
  Realtime rows escaped it — `ConversationView` resolves those from the
  `participants` roster — which is exactly why single-user local testing missed
  it; it only shows with 2+ real users, matching the "live RLS path needs dev
  verification" note in the chat initiative.)
- **Inbox:** every DM row showed the literal "Direct message" instead of the
  counterpart's name (`get_inbox` title fell through to the kind label).
- **Media posts:** every clip authored by someone other than the viewer — and
  _all_ clips for anonymous/logged-out viewers — showed a null author name.

This is the same class as the bundle-89 migration of public reads to
`profiles_public` (and the AGENTS.md "PostgREST FK-join on a view" gotcha): the
fix is to route display-card reads through the `profiles_public` view, which is
definer-equivalent and readable by `anon` + `authenticated`. **Fixed this
bundle** — see the remediation log. Graded P1 because the features were live and
visibly broken in prod for the multi-user path; the privacy posture itself was
never at risk (RLS failed safe).

**Guardrail for the next reader:** any new feature that needs another user's
`display_name` / `avatar_url` must read `profiles_public`, never the base
`profiles` table, on any session-scoped or `SECURITY INVOKER` path. The base
table is owner-only by design.

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
**Status:** ✅ resolved — column dropped (2026-05-24)

`host_stripe_accounts` retained the most recent `account.updated`
webhook payload as JSON for debugging. That payload from Stripe
includes the host's legal name, DOB (verification), address, last4 of
SSN/EIN for US accounts, and the bank account last4 for payouts.

**Fix applied:** column dropped in
[20260624000000_pii_p2_drop_last_event_payload.sql](../../supabase/migrations/20260624000000_pii_p2_drop_last_event_payload.sql).
`lastEventPayload` parameter removed from `updateStatusByAccountId`
(domain port + infrastructure adapter), `mirrorStripeAccountUpdate`
(facade), and the `account.updated` webhook handler — the raw `account`
object is no longer passed or persisted. Only `charges_enabled`,
`payouts_enabled`, and `details_submitted` are written.

### 14. Chat `messages` + `chat-attachments` have no retention policy

**Files:**

- [supabase/migrations/20260824000000_chat_messaging.sql#L74-L93](../../supabase/migrations/20260824000000_chat_messaging.sql#L74-L93)
  — `messages` (body up to 4000 chars + `attachments` jsonb), no TTL.
- [supabase/migrations/20260826000000_chat_attachments.sql](../../supabase/migrations/20260826000000_chat_attachments.sql)
  — private `chat-attachments` bucket, no orphan sweep.

**Category:** data retention
**Status:** ✅ resolved (2026-05-31) —
[20260829000000_chat_retention.sql](../../supabase/migrations/20260829000000_chat_retention.sql).
Both sub-gaps closed: (1) `public.purge_chat_attachment_orphans(grace)` + a daily
06:45 UTC cron reclaims attachment objects no longer referenced by any
`messages.attachments[].path` (exact-path match — chat stores the bare object
path, not a cache-busted public URL, so no LIKE-wildcard needed); (2) a
`messages_scrub_soft_deleted_30d` cron (06:30 UTC) nulls `body`/`attachments` on
rows soft-deleted > 30 days ago (option (a) — keep the tombstone, strip the PII),
with `messages_nonempty` relaxed to allow an emptied tombstone. Ordering: scrub
de-references aged tombstones, then the sweep reclaims the same night. Validated
against the local DB (live-empty insert still rejected; orphan deleted while a
referenced object survives). See the remediation log + [data-lifecycle.md](data-lifecycle.md)
§1 (chat now in the inventory).

Direct messages and room messages are user-to-user free text — exactly where
people paste phone numbers, addresses, and payment details. They accumulate
forever with no purge, the same unbounded-PII-pool problem
[data-lifecycle.md](data-lifecycle.md) elevated `notification_outbox` to P1 over
(messages are higher-sensitivity but lower-volume). Two sub-gaps:

1. **No message/attachment retention cron.** Unlike `notification_outbox`
   (purged) there is no TTL on `messages` or a `chat-attachments` orphan sweep
   (the migration comment defers the sweep as "a follow-up cron, mirroring
   hero-images" — it hasn't landed).
2. **Soft-deleted message bodies are retained in place.** `messages_update`
   soft-deletes (sets `deleted_at`); the UI tombstones the row, but `body` and
   `attachments` stay in the table — a "deleted" message's content is still on
   disk and readable by the platform admin / via a future export.

**Recommended fix:** add the `chat-attachments` orphan sweep (clone
`purge_hero_image_orphans` — parse `{conversation_id}/{user_id}/{uuid}.{ext}`,
retain objects still referenced by a live `messages.attachments` element,
cache-buster-tolerant per the 20260819 hero fix). For message bodies, decide a
retention window with product (DMs especially) and either (a) a pg_cron that
nulls `body`/`attachments` on rows `deleted_at < now() - interval '30 days'`, or
(b) hard-delete soft-deleted rows past the window. Track alongside the
data-lifecycle retention tier.

### 15. Chat tables are absent from the account-deletion + data-export plans

**Files:** [docs/audits/privacy.md account-deletion sketch](#account-deletion-design-sketch)
(below) and P3 #12.
**Category:** legal feature gap (forward-looking)
**Status:** ✅ both halves resolved (2026-05-31)

The account-deletion design sketch and the data-export inventory (P3 #12)
predated chat; both now cover the chat surface:

- **Deletion:** ✅ shipped (ADR 0029). `conversation_participants` / `messages` /
  `message_reports` / `user_blocks` all FK `profiles(id) ON DELETE CASCADE`, and
  `conversations.created_by` / `messages.deleted_by` are `SET NULL` — so the
  `auth.users` delete in the purge cascades cleanly (a user's messages vanish;
  rooms survive with a null author). The DM side-effect (deleting one party
  removes the copy the **other** party received) is documented in
  [ADR 0029](../adr/0029-account-deletion.md) as an accepted-for-now behaviour to
  revisit with a tombstone if it proves jarring.
- **Export (GDPR Art. 20):** ✅ done — `GET /api/account/export` (P3 #12) now
  includes `chat_messages_sent` (`messages` as sender), `chat_conversations`
  (participated in), and `user_blocks`.

## P3 — nice-to-have

### 10. `rate_limits.key` may store raw emails / IPs

**File:** [apps/web/src/lib/rate-limit-key.ts](../../apps/web/src/lib/rate-limit-key.ts)
**Category:** quasi-identifier persistence
**Status:** ✅ resolved (2026-05-31)

`key` was built as `guest-signup:email:user@example.com` / `claim:ip:1.2.3.4`,
so raw identifiers lived in `rate_limits.key` for the window duration. Low risk
(service-role-only table, rows expire) but easy to harden.

**Fix applied:** a shared `rateLimitKey(scope, dimension, value)` helper
([rate-limit-key.ts](../../apps/web/src/lib/rate-limit-key.ts)) now SHA-256-hashes
the per-actor portion (salted with `RATE_LIMIT_SALT` when set — recommended for
the 2^32 IP space — falling back to unsalted in dev), lower-casing/trimming email
first. Deterministic, so the fixed-window lookup still resolves. Adopted at all
three call sites (6 keys): `guest-actions.ts`, `checkout-actions.ts`,
`claim/actions.ts`. Pure helper unit-tested
([rate-limit-key.test.ts](../../apps/web/src/lib/rate-limit-key.test.ts)) — pins
"raw email/IP never in the key" + determinism. `RATE_LIMIT_SALT` documented in
`.env.example`.

### 11. Public profile pages are fully indexable

**File:** [apps/web/src/app/players/[id]/page.tsx](../../apps/web/src/app/players/[id]/page.tsx)

- [apps/web/src/app/sitemap.ts](../../apps/web/src/app/sitemap.ts)
  **Category:** SEO + privacy intersection
  **Status:** ✅ resolved by side-effect (verified 2026-05-31)

Both the player page and the sitemap now read `profiles_public`, which filters
`deleted_at IS NULL`. A soft-deleted profile therefore returns no row → the page
`notFound()`s (404, not a stale PII render) and the handle is automatically
excluded from the sitemap. The explicit `robots: noindex` recommended below is
no longer needed; the 404 + sitemap exclusion is the stronger outcome. (Note:
the page route is `players/[id]`, not `[handle]` as originally filed.)

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

**File:** [apps/web/src/app/api/account/export/route.ts](../../apps/web/src/app/api/account/export/route.ts)
**Category:** legal feature gap
**Status:** ✅ resolved (2026-05-31)

GDPR Article 20 and CCPA § 1798.100 obligate us to provide a
machine-readable export of a user's data on request. Shipped as
`GET /api/account/export` + a "Download my data" link on
[apps/web/src/app/profile/page.tsx](../../apps/web/src/app/profile/page.tsx).

**Fix applied:** the route streams one JSON file
(`pickupvb-data-export-<date>.json`) covering `profile`, `events_hosted`,
`event_participation`, `tips_sent` / `tips_received`, `payment_history`
(`event_payment_audit`), `friendships`, `team_memberships`
(`event_team_entry_members`), `community_listings_submitted`, `notifications`,
`notification_preferences`, `push_subscriptions`, and the chat surface from
#15 (`chat_conversations`, `chat_messages_sent`, `user_blocks`). It runs on the
**user-scoped** client (no admin/RLS-bypass), filtering every category to the
caller's id so the filter and the owner/self RLS policy agree, and **throws on
any read error** rather than returning a partial file. Cross-user identifiers
are omitted (e.g. `tipper_user_id`) and the push `auth` secret is excluded.
This also does the data-inventory groundwork the account-deletion feature (P1
#2 follow-up) needs.

## Account-deletion design sketch

> ✅ **Implemented 2026-05-31 — see [ADR 0029](../adr/0029-account-deletion.md).**
> The shipped flow deviates from this sketch in two deliberate ways: (1) it drops
> the email-confirm gate (`pending → confirmed`) in favour of a streamlined
> `scheduled → executed | cancelled` machine (the requester is already
> authenticated; the 30-day grace + cancel + notice email are the safety net),
> and (2) anonymous users are excluded rather than special-cased. The sketch
> below is retained as the original design record.

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
- **Anonymous-auth users.** ✅ Resolved (ADR 0029): the deletion flow is gated
  to real users (`requireRealUser`) — anonymous users have no email and minimal
  data, so the product path is abandon-or-`/claim`, not deletion.
- **CUI.** No data we hold today qualifies as CUI under NIST SP 800-171
  (that's a federal-contractor category — controlled unclassified info
  like ITAR/EAR-adjacent data). Mentioned in the request title; flagging
  here so we don't conflate it with PII. If we ever take federal money
  this gets a separate audit.

## Remediation log

### 2026-05-31 — #14: chat retention (attachment orphan sweep + message scrub)

[20260829000000_chat_retention.sql](../../supabase/migrations/20260829000000_chat_retention.sql).
Two sub-gaps closed in one migration:

1. **Attachment orphan sweep.** `public.purge_chat_attachment_orphans(grace)` —
   a SECURITY DEFINER walker (cloned from the sponsor/hero walkers, `search_path=''`,
   `storage.allow_delete_query` escape hatch) deletes `chat-attachments` objects
   no longer referenced by any `messages.attachments[].path`. Chat stores the
   **bare** object path (not a cache-busted public URL like hero/sponsor), so
   liveness is an exact `o.name = path` membership test over the unnested
   attachments — no LIKE-wildcard. Daily cron at 06:45 UTC.
2. **Soft-deleted body scrub.** `messages_scrub_soft_deleted_30d` cron (06:30 UTC)
   nulls `body`/`attachments` on rows soft-deleted > 30 days ago (audit option (a)
   — keep the tombstone, strip the PII; the read path already renders deleted rows
   empty, so this is observable-behaviour-neutral). `messages_nonempty` relaxed to
   `deleted_at is not null OR <has content>` so an emptied tombstone is legal while
   live inserts still require content. The scrub runs before the sweep so
   de-referenced objects are reclaimed the same night.

Validated against the local DB: live-empty insert still rejected by
`messages_nonempty`; a 40-day-old soft-deleted row scrubs to empty; the walker
deletes an unreferenced object while retaining one pinned by a live message. No
typed-schema change (`gen:types` output unaffected — CHECK + functions + crons
only), so no app-code edits. Verify quad green.

### 2026-05-31 — P3 #10: hash email/IP in `rate_limits.key`

Added [`rateLimitKey(scope, dimension, value)`](../../apps/web/src/lib/rate-limit-key.ts)
— SHA-256 of the per-actor portion (salted with `RATE_LIMIT_SALT` when set,
unsalted fallback in dev), email lower-cased/trimmed first; deterministic so the
fixed-window lookup still resolves. Re-exported from `lib/rate-limit.ts` and
adopted at all three call sites / 6 keys (`guest-actions.ts`,
`checkout-actions.ts`, `claim/actions.ts`); raw emails/IPs no longer persist.
Pure helper in its own (dependency-free) module + a unit test
([rate-limit-key.test.ts](../../apps/web/src/lib/rate-limit-key.test.ts)) pinning
"raw actor never in the key" + determinism + email normalization.
`RATE_LIMIT_SALT` documented in `.env.example`. Verify quad green.

### 2026-05-31 — P1 #2 + #15 (deletion half): account-deletion flow (GDPR Art. 17)

Shipped the full "delete my account" path on top of the Bundle-89 FK/soft-delete
groundwork (ADR 0029). Streamlined model (no email-confirm gate — the requester
is authenticated), 30-day grace window, state machine `scheduled → executed |
cancelled`. Vertical slice:

- **Migration** [20260828000000_account_deletion_requests.sql](../../supabase/migrations/20260828000000_account_deletion_requests.sql)
  — `deletion_requests` ledger; partial unique index (one live request per user);
  `auth.uid() = user_id` RLS (no DELETE policy); `user_id ON DELETE SET NULL` so
  the `executed` row survives the auth-user cascade as an anonymized
  proof-of-erasure record.
- **Domain** `DeletionRequest` aggregate + `DeletionRequestRepository` port
  ([deletion-request.ts](../../packages/domain/src/users/deletion-request.ts)) —
  state-machine guards, 6 unit tests.
- **Application** `RequestAccountDeletionHandler` / `CancelAccountDeletionHandler`
  ([account-deletion.handler.ts](../../packages/application/src/commands/account-deletion.handler.ts))
  — one-live-request `ConflictError`, 4 handler tests.
- **Infra** [SupabaseDeletionRequestRepository](../../packages/infrastructure/src/supabase-deletion-request-repository.ts)
  (user-scoped for arm/cancel; admin for the cron).
- **Purge** [lib/account-purge.ts](../../apps/web/src/lib/account-purge.ts)
  `executeAccountDeletion` — closure email → Stripe subscription cancel (Connect
  kept) → profile scrub → notification cleanup → mark executed →
  `auth.admin.deleteUser`; ordered defense-in-depth + retry-safe.
- **Cron** [api/account/execute-deletions](../../apps/web/src/app/api/account/execute-deletions/route.ts)
  (`CRON_SECRET`, daily 04:30 UTC in vercel.json) + a unit-tested sweep core
  (cap + per-account failure isolation, 3 tests).
- **UI** [/profile/account/delete](../../apps/web/src/app/profile/account/delete/page.tsx)
  (`requireRealUser` — anon excluded) + flash-param actions; a "Delete account"
  link in the profile "Privacy & your data" section.
- **Notifications** `account.deletion.requested` + `account.deletion.cancelled`
  kinds (transactional; email + in-app).

Verify quad green (typecheck 15/15; lint 0 errors; test — +13 new across
domain/application/web; build 8/8, routes `ƒ /api/account/execute-deletions` +
`ƒ /profile/account/delete`). Migration applied locally + `gen:types`. **Live
two-user / Stripe round-trip e2e against dev is a follow-up** (not in the default
chain).

### 2026-05-31 — P3 #12: data-export endpoint (GDPR Art. 20 / CCPA)

Shipped [GET /api/account/export](../../apps/web/src/app/api/account/export/route.ts)
returning one machine-readable JSON file of the caller's own data across 16
categories (profile, hosted events, participation, tips sent/received, payment
history, friendships, team memberships, community listings, notifications +
prefs, push subscriptions, and the chat surface — conversations, sent messages,
blocks). Runs on the user-scoped client (RLS safety net; every category filtered
to the caller's id), throws on any read error so the file is never silently
partial, omits cross-user identifiers + the push `auth` secret. UI: a "Download
my data" link in a new "Privacy & your data" section on
[profile/page.tsx](../../apps/web/src/app/profile/page.tsx) (plain `<a download>`
— the route streams an attachment). Closes the export half of #15. Verify quad
green (typecheck; lint 0 errors; test 45 infra + 104 web; build 8/8, route
registered as `ƒ /api/account/export`).

### 2026-05-31 — #13: route chat + media display cards through `profiles_public`

Fixed the owner-only-`profiles`-RLS regression in all three sites:

- **Chat `listMessages`**
  ([supabase-messaging-repository.ts](../../packages/infrastructure/src/supabase-messaging-repository.ts)) —
  dropped the embedded `sender:profiles!messages_sender_id_fkey(...)` join.
  `listMessages` now fetches the message rows, collects the distinct sender ids,
  and resolves cards from `profiles_public` via a new private `loadSenderCards`
  helper, merging in JS. `rowToView` was refactored to take the resolved card as
  a second argument and is now exported + unit-tested
  ([supabase-messaging-repository.test.ts](../../packages/infrastructure/src/supabase-messaging-repository.test.ts) —
  4 cases: card resolution, null-card fallback, tombstone, edited flag).
- **Chat `get_inbox` DM title**
  ([20260827000000_fix_get_inbox_dm_title_profiles_public.sql](../../supabase/migrations/20260827000000_fix_get_inbox_dm_title_profiles_public.sql)) —
  `create or replace` of the SECURITY INVOKER function changing the DM-title
  subquery's `join public.profiles` to `join public.profiles_public` (the view
  bypasses base-table RLS regardless of the function's security mode). Signature
  unchanged → no `gen:types`. **Pending local `pnpm db:migrate`** (function-body
  change only; CI/CD auto-applies on deploy).
- **Media-post `decorate`**
  ([supabase-media-post-repository.ts](../../packages/infrastructure/src/supabase-media-post-repository.ts)) —
  submitter-card read switched from `from('profiles')` to
  `from('profiles_public')`.

Each site carries a comment explaining why `profiles_public` is mandatory so the
next reader doesn't "optimize" it back to a base-table embed. Verify quad green
(typecheck; lint 0 errors; test — 45 infra incl. the new 4 + 104 web; build 8/8).

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

- Soft-delete application path: `DeletionRequestAggregate`, cron, profile scrub UI

### 2026-05-24 — P1 #4 steps 2 + 3: migrate public queries to profiles_public + tighten RLS

**Step 2 — app-layer query migration:**

All public-facing `profiles` reads switched to `profiles_public`. Because
PostgREST FK-join syntax (`profiles!fk_name(...)`) does not work on views,
the 4 FK-join queries (groups/[id]/page.tsx, groups/[id]/members/page.tsx,
teams/page.tsx, teams/[id]/page.tsx, lib/mappers/friend.ts) were split into
two queries each: the parent-table query runs as before, profiles are fetched
separately via `profiles_public` by collected IDs, and results are merged in JS.

`profiles_public` exposes only: `id, handle, display_name, avatar_url, home_city,
primary_position, secondary_position, tertiary_position, instagram_handle,
tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url,
show_pro_badge, theme_preference, created_at`. `first_name`, `last_name`,
`business_name`, `business_address`, `tax_id` are deliberately excluded.

Two reads that needed non-public fields (not in the view) were switched to admin
client: `profile/receipts/[paymentIntentId]/page.tsx` (host's
`business_name/business_address` for the receipt) and `teams/actions.ts`
(invitee's `auto_accept_team_invites` preference). The health-check probe at
`api/health/deep/route.ts` and the annual statement CSV at
`api/receipts/[year]/statement.csv/route.ts` also moved to `profiles_public`.

**Step 3 — RLS tighten:**

[20260623000000_pii_p1_profiles_rls_owner_only.sql](../../supabase/migrations/20260623000000_pii_p1_profiles_rls_owner_only.sql) —
drops the permissive `using (true)` SELECT policy and replaces it with
`auth.uid() = id OR public.is_platform_admin()`. `is_platform_admin()` is
`SECURITY DEFINER` so it reads the `is_platform_admin` column without
re-entering RLS. `profiles_public` continues to serve all public reads
regardless of this change because the view runs as the view owner (not
`security_invoker`).

### 2026-05-24 — P1 #5 step 3: switch loadAdHocRowsCached public projection to view

[apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts) —
split `loadAdHocRowsCached` into two cached loaders:

- `loadAdHocPublicRowsCached` — reads `event_team_registrations` (name,
  division_id, captain_id, payment_status), `event_team_registration_members_public`
  (id, registration_id, display_name, sort_order), and `profiles_public`
  (captain display names). Contains no `email` or `user_id`. Used exclusively
  for the `allRegistrations` public projection.
- `loadAdHocRowsCached` — unchanged admin-client query with full member
  fields including `email` and `user_id`. Now fetched only when the viewer
  is signed in (`viewerRegistrations`) or is managing the event (`hostRows`).

Anonymous visitors — including SEO crawlers and logged-out users — hit only
the public cache. The sensitive fields never enter the shared in-memory result
for public reads.

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
