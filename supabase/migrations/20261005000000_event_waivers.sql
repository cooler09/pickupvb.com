-- ============================================================================
-- Per-event waiver acknowledgement + signature tracking (monetization O-9).
-- See docs/audits/monetization.md § O-9.
--
-- Context: hosts who care about liability already have their OWN waiver (insurer
-- / sanctioning body / DocuSign) and often collect signatures in person. So this
-- is NOT a legal-waiver substitute — it's a lightweight, FREE-for-any-host,
-- SOFT (never blocks registration) tool to (a) show the rules / link the host's
-- real waiver and collect an online acknowledgement, and (b) let the host
-- manually track who signed in person, at their discretion.
--
-- Impact:
--   * New `event_waivers` (one per event): host-authored title + optional body
--     and/or an optional `external_url` to their real waiver (at least one of the
--     two). `version` bumps on body change so a stale acknowledgement is visible.
--     Public read; writes admin-only (edit action checks canManage).
--   * New `waiver_signatures`: an acknowledgement record. `method = 'self'`
--     (attendee click-wrap, RLS self-insert, user_id = them) or `'in_person'`
--     (host-recorded, admin client, `recorded_by_user_id` = host, `user_id` may
--     be NULL for a free-text name / walk-in). One row per known (event,user);
--     many NULL-user in-person rows allowed (Postgres NULLs are distinct).
-- ============================================================================

-- ---- 1. event_waivers (host-authored) --------------------------------------
create table public.event_waivers (
  event_id     uuid primary key references public.events(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 120),
  -- Body and/or external_url; at least one must be present (see CHECK below).
  body         text check (body is null or length(btrim(body)) between 1 and 10000),
  external_url text check (external_url is null or external_url ~ '^https://'),
  version      int not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint event_waivers_has_content check (body is not null or external_url is not null)
);

comment on table public.event_waivers is
  'Per-event waiver acknowledgement (monetization O-9). NOT a legal-waiver substitute — host links their own waiver (external_url) and/or pastes rules text (body). Free, soft (never blocks sign-up). One per event.';

create or replace function public.touch_event_waivers_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_event_waivers_touch
  before update on public.event_waivers
  for each row execute function public.touch_event_waivers_updated_at();

alter table public.event_waivers enable row level security;

-- Anyone who can reach the event can read its waiver to acknowledge it. The
-- content is host-authored (not sensitive); writes go through the admin client
-- from the event-edit action (after a canManage check) — no write policy.
create policy event_waivers_select_all
  on public.event_waivers for select
  using (true);

-- ---- 2. waiver_signatures (the acknowledgement record) ---------------------
create table public.waiver_signatures (
  id                   uuid primary key default uuid_generate_v4(),
  event_id             uuid not null references public.events(id) on delete cascade,
  -- NULL for a host-recorded free-text name (e.g. a paper/in-person signer with
  -- no account); set for an attendee's own click-wrap acknowledgement.
  user_id              uuid references public.profiles(id) on delete cascade,
  -- the event_waivers.version acknowledged; a later body edit bumps the version
  -- so the UI can show "acknowledged an older version".
  waiver_version       int not null,
  signed_name          text not null check (length(btrim(signed_name)) between 1 and 120),
  -- 'self' = attendee click-wrap; 'in_person' = host-recorded at their discretion.
  method               text not null default 'self' check (method in ('self', 'in_person')),
  -- the host who recorded an in_person signature (NULL for self).
  recorded_by_user_id  uuid references public.profiles(id) on delete set null,
  signed_at            timestamptz not null default now(),
  -- One acknowledgement per (event, known user); re-signing upserts. NULL
  -- user_ids are distinct in Postgres, so many in-person free-text rows coexist.
  unique (event_id, user_id)
);

create index waiver_signatures_event_idx on public.waiver_signatures (event_id);

comment on table public.waiver_signatures is
  'Waiver acknowledgements (O-9). method self (attendee click-wrap, self-RLS) or in_person (host-recorded via admin client). Host reads the full list via admin.';

alter table public.waiver_signatures enable row level security;

-- The attendee manages + reads their OWN self-acknowledgement. Host-recorded
-- (in_person) rows are written + read on the admin client (host gated by
-- canManage), so they need no policy here.
create policy waiver_signatures_select_own
  on public.waiver_signatures for select
  using (auth.uid() = user_id);

create policy waiver_signatures_insert_own
  on public.waiver_signatures for insert
  with check (auth.uid() = user_id and method = 'self');

create policy waiver_signatures_update_own
  on public.waiver_signatures for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and method = 'self');
