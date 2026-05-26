-- ===========================================================================
-- PII audit P1 #1 + #2 + #3 — soft-delete columns and FK nullability
--
-- Covers three findings from docs/audits/privacy.md:
--
--   P1 #1  events.host_id / groups.created_by / broadcasts.sender_id are
--          ON DELETE RESTRICT (or NO ACTION), blocking all user deletion.
--          Flip to ON DELETE SET NULL so deleting a user's auth row leaves
--          the event/group/broadcast intact with host_id = NULL.
--
--   P1 #2  profiles has no soft-delete column. Add deleted_at +
--          deletion_reason so the application can tombstone the profile
--          before calling auth.admin.deleteUser — FKs that still point at
--          the profile row survive long enough for the FK SET NULL cascade
--          to run, then the auth row is removed.
--
--   P1 #3  Several FKs ON DELETE CASCADE would destroy regulatory/financial
--          records on user deletion. Flip each to ON DELETE SET NULL and
--          make the column nullable:
--            - event_tips.host_id        (payout history / tax)
--            - host_stripe_accounts.user_id (1099-K reconciliation)
--            - host_subscriptions.user_id   (Pro billing history)
--            - event_attendees.user_id      (paid RSVP record)
--            - event_team_payments.captain_id (team payment record)
--            - community_listings.submitter_user_id
--
--  host_stripe_accounts.user_id and host_subscriptions.user_id were PRIMARY
--  KEYS, so this migration adds surrogate UUID PKs to each table before
--  making user_id nullable.
--
--  event_attendees had a composite PK (event_id, user_id); a surrogate id
--  column is added to replace that PK while preserving a partial unique
--  index for (event_id, user_id) WHERE user_id IS NOT NULL.
-- ===========================================================================

-- ---- P1 #2: soft-delete columns on profiles --------------------------------

alter table public.profiles
  add column deleted_at     timestamptz,
  add column deletion_reason text
    check (deletion_reason in (
      'user_requested', 'admin_action', 'spam_suspension', 'inactive_purge'
    ));

create index profiles_deleted_at_idx
  on public.profiles (deleted_at)
  where deleted_at is not null;

-- ---- P1 #1a: events.host_id  RESTRICT → SET NULL ---------------------------

alter table public.events
  drop constraint events_host_id_fkey;
alter table public.events
  alter column host_id drop not null;
alter table public.events
  add constraint events_host_id_fkey
    foreign key (host_id) references public.profiles(id) on delete set null;

-- ---- P1 #1b: groups.created_by  RESTRICT → SET NULL ------------------------

alter table public.groups
  drop constraint groups_created_by_fkey;
alter table public.groups
  alter column created_by drop not null;
alter table public.groups
  add constraint groups_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

-- ---- P1 #1c: broadcasts.sender_id  NO ACTION → SET NULL -------------------

alter table public.broadcasts
  drop constraint broadcasts_sender_id_fkey;
alter table public.broadcasts
  alter column sender_id drop not null;
alter table public.broadcasts
  add constraint broadcasts_sender_id_fkey
    foreign key (sender_id) references auth.users(id) on delete set null;

-- ---- P1 #3a: event_tips.host_id  CASCADE → SET NULL -----------------------
-- Preserves payout history / tax records when a host's account is deleted.

alter table public.event_tips
  drop constraint event_tips_host_id_fkey;
alter table public.event_tips
  alter column host_id drop not null;
alter table public.event_tips
  add constraint event_tips_host_id_fkey
    foreign key (host_id) references auth.users(id) on delete set null;

-- ---- P1 #3b: host_stripe_accounts  CASCADE → SET NULL ---------------------
-- user_id was the PRIMARY KEY; a surrogate UUID PK is added so that user_id
-- can become nullable while the row (and its stripe_account_id) survives.

alter table public.host_stripe_accounts
  add column id uuid not null default gen_random_uuid();

-- Drop PK (releases user_id from primary-key NOT NULL) then drop FK.
alter table public.host_stripe_accounts
  drop constraint host_stripe_accounts_pkey;
alter table public.host_stripe_accounts
  drop constraint host_stripe_accounts_user_id_fkey;

alter table public.host_stripe_accounts
  alter column user_id drop not null;

alter table public.host_stripe_accounts
  add primary key (id);

-- Partial unique index: one live account per user; NULL values are excluded
-- (deleted users' rows remain without violating uniqueness).
create unique index host_stripe_accounts_user_idx
  on public.host_stripe_accounts (user_id)
  where user_id is not null;

alter table public.host_stripe_accounts
  add constraint host_stripe_accounts_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete set null;

-- ---- P1 #3c: host_subscriptions  CASCADE → SET NULL -----------------------
-- Same pattern: user_id was PK; add surrogate PK, make user_id nullable.

alter table public.host_subscriptions
  add column id uuid not null default gen_random_uuid();

alter table public.host_subscriptions
  drop constraint host_subscriptions_pkey;
alter table public.host_subscriptions
  drop constraint host_subscriptions_user_id_fkey;

alter table public.host_subscriptions
  alter column user_id drop not null;

alter table public.host_subscriptions
  add primary key (id);

create unique index host_subscriptions_user_idx
  on public.host_subscriptions (user_id)
  where user_id is not null;

alter table public.host_subscriptions
  add constraint host_subscriptions_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete set null;

-- ---- P1 #3d: event_attendees  CASCADE → SET NULL --------------------------
-- Paid RSVP records must survive user deletion. The composite PK
-- (event_id, user_id) is replaced with a surrogate UUID PK; a partial
-- unique index preserves the one-registration-per-user-per-event invariant
-- for non-deleted users.

alter table public.event_attendees
  add column id uuid not null default gen_random_uuid();

alter table public.event_attendees
  drop constraint event_attendees_pkey;
alter table public.event_attendees
  drop constraint event_attendees_user_id_fkey;

alter table public.event_attendees
  alter column user_id drop not null;

alter table public.event_attendees
  add primary key (id);

-- Partial unique index: one attendee row per live user per event.
-- Deleted-user rows (user_id IS NULL) are excluded and can coexist.
create unique index event_attendees_event_user_uidx
  on public.event_attendees (event_id, user_id)
  where user_id is not null;

alter table public.event_attendees
  add constraint event_attendees_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete set null;

-- ---- P1 #3e: event_team_payments.captain_id  CASCADE → SET NULL -----------

alter table public.event_team_payments
  drop constraint event_team_payments_captain_id_fkey;
alter table public.event_team_payments
  alter column captain_id drop not null;
alter table public.event_team_payments
  add constraint event_team_payments_captain_id_fkey
    foreign key (captain_id) references public.profiles(id) on delete set null;

-- ---- P1 #3f: community_listings.submitter_user_id  CASCADE → SET NULL -----

alter table public.community_listings
  drop constraint community_listings_submitter_user_id_fkey;
alter table public.community_listings
  alter column submitter_user_id drop not null;
alter table public.community_listings
  add constraint community_listings_submitter_user_id_fkey
    foreign key (submitter_user_id) references public.profiles(id) on delete set null;
