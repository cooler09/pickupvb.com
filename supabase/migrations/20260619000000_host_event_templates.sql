-- ============================================================================
-- Host event templates (Bundle 86)
--
-- Context: Monetization audit P1 #1 identified saved event templates as a
-- high-value host feature that justifies Pro for low-GMV hosts. Bundle 86
-- adds first-party template storage so hosts can prefill new-event form
-- drafts from prior setups.
--
-- Impact:
--   - New table `host_event_templates` storing a host-owned named template
--     and a JSON payload of form values.
--   - RLS: user-owned rows only (select/insert/update/delete by `user_id`).
--   - No runtime coupling to domain/application layers; this is a web-level
--     productivity feature.
-- ============================================================================

create table public.host_event_templates (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index host_event_templates_user_idx
  on public.host_event_templates (user_id, created_at desc);

comment on table public.host_event_templates is
  'Saved new-event form templates for hosts (Bundle 86).';

create or replace function public.touch_host_event_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_host_event_templates_touch
  before update on public.host_event_templates
  for each row execute function public.touch_host_event_templates_updated_at();

alter table public.host_event_templates enable row level security;

create policy host_event_templates_select_own
  on public.host_event_templates
  for select
  using (auth.uid() = user_id);

create policy host_event_templates_insert_own
  on public.host_event_templates
  for insert
  with check (auth.uid() = user_id);

create policy host_event_templates_update_own
  on public.host_event_templates
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy host_event_templates_delete_own
  on public.host_event_templates
  for delete
  using (auth.uid() = user_id);
