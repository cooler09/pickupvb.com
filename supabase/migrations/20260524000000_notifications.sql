-- Notifications foundation: per-user preferences, in-app feed, and a
-- delivery outbox for email/sms/push.
--
-- Design notes
-- ------------
--   * `notification_preferences` is opt-out for email/in-app and opt-in
--     for SMS/push. Transactional kinds (receipts, password resets) are
--     always sent regardless of preference — CAN-SPAM allows this.
--   * `notifications` is the in-app feed (bell icon). Realtime publishes
--     INSERTs on this table to subscribers filtered by `user_id`.
--   * `notification_outbox` is drained by a cron worker. One row per
--     (user, kind, channel). Idempotency key prevents double-sends when
--     webhooks retry.
--   * SMS opt-in is recorded with timestamp + phone for TCPA compliance.
--     STOP keyword webhook sets `sms_opted_out_at`.

-- ─── 1. Preferences ────────────────────────────────────────────────────
create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  email_enabled  boolean not null default true,
  sms_enabled    boolean not null default false,   -- opt-in
  push_enabled   boolean not null default false,   -- opt-in
  in_app_enabled boolean not null default true,

  -- Per-category overrides. Keys are notification kind prefixes
  -- (e.g. 'event_reminders', 'social', 'marketing'). Values are
  -- { email?: bool, sms?: bool, push?: bool, in_app?: bool }.
  channel_overrides jsonb not null default '{}'::jsonb,

  quiet_hours_start time,
  quiet_hours_end   time,
  timezone          text default 'America/New_York',

  sms_phone        text,
  sms_opted_in_at  timestamptz,
  sms_opted_out_at timestamptz,

  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select_self
  on public.notification_preferences for select
  using (auth.uid() = user_id);

create policy notification_preferences_insert_self
  on public.notification_preferences for insert
  with check (auth.uid() = user_id);

create policy notification_preferences_update_self
  on public.notification_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 2. In-app feed ────────────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  href        text,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Users can only read / mark-read their own notifications.
create policy notifications_select_own
  on public.notifications for select
  using (auth.uid() = user_id);

create policy notifications_update_own_read
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- INSERTs are service-role only — no client-side policy.

-- ─── 3. Delivery outbox (email/sms/push) ───────────────────────────────
create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  channel         text not null check (channel in ('email','sms','push')),
  kind            text not null,
  to_address      text not null,
  payload         jsonb not null,
  idempotency_key text unique,
  status          text not null default 'pending'
    check (status in ('pending','sending','sent','failed','skipped')),
  attempts        int  not null default 0,
  last_error      text,
  provider_id     text,
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notification_outbox_drain_idx
  on public.notification_outbox (status, scheduled_for)
  where status in ('pending', 'sending');

alter table public.notification_outbox enable row level security;
-- No policies: service-role only.

-- ─── 4. Broadcasts (host/group → many recipients) ──────────────────────
create table public.broadcasts (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references auth.users(id),
  audience_type text not null check (audience_type in ('event_attendees','group_members')),
  audience_id   uuid not null,
  subject       text,
  body          text not null,
  channels      text[] not null default array['email','in_app'],
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index broadcasts_sender_idx on public.broadcasts (sender_id, created_at desc);
create index broadcasts_audience_idx on public.broadcasts (audience_type, audience_id, created_at desc);

alter table public.broadcasts enable row level security;

-- Sender can read their own broadcasts.
create policy broadcasts_select_sender
  on public.broadcasts for select
  using (auth.uid() = sender_id);

-- Event hosts can insert event_attendees broadcasts for events they host.
create policy broadcasts_insert_event_host
  on public.broadcasts for insert
  with check (
    audience_type = 'event_attendees'
    and exists (
      select 1 from public.events e
      where e.id = audience_id and e.host_id = auth.uid()
    )
  );

-- Group owners/admins can insert group_members broadcasts.
create policy broadcasts_insert_group_admin
  on public.broadcasts for insert
  with check (
    audience_type = 'group_members'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = audience_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
    )
  );

-- ─── 5. Helper: ensure a prefs row exists when a user is created ───────
create or replace function public.ensure_notification_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_notif_prefs on auth.users;
create trigger on_auth_user_created_notif_prefs
  after insert on auth.users
  for each row execute function public.ensure_notification_preferences();

-- Backfill for existing users.
insert into public.notification_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;
