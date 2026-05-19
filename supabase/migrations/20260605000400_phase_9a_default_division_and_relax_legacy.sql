-- ===========================================================================
-- Phase 9a (ADR 0006 cleanup, step 1 of N): pricing off legacy columns.
--
-- Two changes:
--
--   1. Make the ADR-0006 legacy single-event columns NULLABLE so application
--      code can stop populating them without DB constraints firing. The
--      columns themselves stay (and are still read by some legacy code
--      paths — those get migrated in Phase 9b before the final DROP).
--
--   2. Add an AFTER INSERT trigger on `events` that auto-creates a default
--      `event_divisions` row when the event was inserted without one. This
--      closes a gap introduced by ADR Phase 4: the create form only
--      populates `event_divisions` when the host explicitly adds a
--      division, leaving newly-created events with zero divisions. Every
--      page added in ADR Phases 5–7 (detail, search filters, bracket)
--      assumes at least one division exists, so this trigger guarantees
--      that invariant for both legacy and future inserts.
--
-- Both changes are backwards-compatible with code that still writes the
-- legacy columns.
-- ===========================================================================

-- ---- 1. Relax NOT NULL on legacy single-event columns ---------------------
-- Phase 9b will route the remaining reads off these columns, then Phase 9c
-- will DROP them. Until then they're allowed to be NULL.

alter table public.events alter column format        drop not null;
alter table public.events alter column gender        drop not null;
alter table public.events alter column skill_level   drop not null;
alter table public.events alter column price_cents   drop not null;
alter table public.events alter column capacity_kind drop not null;
-- `max_spots` is already nullable (only required when capacity_kind='fixed')
-- and `position_roster` is already a nullable jsonb. Leave them as-is.

-- ---- 2. Auto-create a default division on event insert --------------------
-- Mirrors the Phase 6 backfill mapping (legacy skill_level → skill_tier,
-- nullable format/gender → safe defaults). Idempotent: if any divisions
-- already exist for this event (e.g. the create handler inserted them in
-- the same transaction), the trigger is a no-op.

create or replace function public.create_default_event_division()
returns trigger language plpgsql as $$
declare
  v_existing int;
begin
  select count(*) into v_existing
    from public.event_divisions
   where event_id = new.id;
  if v_existing > 0 then
    return new;
  end if;

  insert into public.event_divisions (
    event_id, sort_order, label,
    surface, format, gender,
    skill_tier, age_group,
    team_composition, team_size,
    capacity_kind, max_spots,
    price_cents, price_unit
  ) values (
    new.id,
    0,
    case
      when new.format is null then upper(coalesce(new.skill_level::text, 'open'))
      else initcap(coalesce(new.gender::text, 'coed')) || ' ' ||
           initcap(new.format::text) || ' · ' ||
           upper(coalesce(new.skill_level::text, 'open'))
    end,
    new.surface,
    coalesce(new.format, 'sixes'::format),
    coalesce(new.gender, 'coed'::gender),
    case new.skill_level
      when 'beginner'     then 'b'::skill_tier
      when 'intermediate' then 'bb'::skill_tier
      when 'advanced'     then 'a'::skill_tier
      when 'competitive'  then 'open'::skill_tier
      else 'bb'::skill_tier  -- defensive default when skill_level is NULL
    end,
    'adult'::age_group,
    case new.type
      when 'tournament' then 'team'::team_composition
      else 'solo'::team_composition
    end,
    null,
    new.capacity_kind,
    new.max_spots,
    coalesce(new.price_cents, 0),
    'per_player'::price_unit
  );
  return new;
end;
$$;

drop trigger if exists events_create_default_division on public.events;
create trigger events_create_default_division
  after insert on public.events
  for each row execute function public.create_default_event_division();
