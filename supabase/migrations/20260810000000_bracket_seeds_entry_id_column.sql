-- ============================================================================
-- Bracket seeds: add entry_id column + make team_id nullable + check constraint
-- (groundwork for ad-hoc/walk-in bracket support). Companion to
-- supabase/migrations/20260809000000_bracket_matches_entry_id_columns.sql.
-- See docs/audits/event-data-model.md — carry-over follow-up
-- "bracket-reader `source='roster'` filter loosening" + the new
-- `bracket_seeds` polymorphic pair follow-up surfaced by the matches bundle.
--
-- Context: `bracket_seeds.team_id` is a NOT NULL FK → `teams.id` and is a
-- component of the existing primary key `(bracket_id, team_id)`. That makes
-- ad-hoc / walk-in seeding impossible at the schema level: those entries
-- have `event_team_entries.team_id IS NULL`. The matches bundle landed the
-- equivalent polymorphic pair on `bracket_matches`; this one finishes the
-- schema half so the app-side cutover can land in a single bundle without
-- being blocked half-way by the seed table.
--
-- Differs from the matches bundle in two ways. (i) `team_id` is in the PK,
-- so we have to rotate the PK before we can drop NOT NULL. The natural
-- replacement is the existing `unique (bracket_id, seed)` constraint — seeds
-- are already unique per bracket by construction. (ii) A seed without a
-- participant is nonsense (unlike a bracket_matches slot, which is legitimately
-- both-null when its feeder hasn't completed), so the check constraint is
-- `team_id IS NULL <> entry_id IS NULL` (exactly-one), not at-most-one.
--
-- Impact: additive at the data level — every existing row keeps its `team_id`
-- and gains an `entry_id` (backfilled for rostered seeds, null otherwise — but
-- there shouldn't be any non-rostered seeds today). PK swap is transparent to
-- the only caller, `SupabaseBracketRepository`, which neither references the
-- PK by name nor sets `bracket_seeds.id`. App layer is otherwise unchanged
-- (`save` keeps writing `team_id`); follow-up bundles will flip writes onto
-- `entry_id` and eventually drop `team_id`.
--
-- The `unique (bracket_id, seed)` constraint name is auto-assigned by Postgres
-- and can vary across snapshots, so the swap is done in a DO block that finds
-- and drops every unique constraint on the table before promoting the pair to
-- the new PK. There is only one such constraint today.
-- ============================================================================

-- 1. Add nullable entry_id, FK → event_team_entries
alter table public.bracket_seeds
    add column entry_id uuid references public.event_team_entries(id) on delete cascade;

create index bracket_seeds_entry_idx
    on public.bracket_seeds (entry_id);

-- 2. Backfill entry_id for existing rostered seeds (same join pattern as the
--    bracket_matches backfill in 20260809000000).
update public.bracket_seeds s
   set entry_id = e.id
  from public.event_brackets b,
       public.event_team_entries e
 where s.bracket_id = b.id
   and s.team_id is not null
   and s.entry_id is null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = s.team_id;

-- 3. Rotate PK: drop (bracket_id, team_id) and the auto-named unique
--    (bracket_id, seed), then promote (bracket_id, seed) to the new PK.
alter table public.bracket_seeds
    drop constraint bracket_seeds_pkey;

do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.bracket_seeds'::regclass
       and contype = 'u'
  loop
    execute format('alter table public.bracket_seeds drop constraint %I', c);
  end loop;
end $$;

alter table public.bracket_seeds
    add primary key (bracket_id, seed);

-- 4. team_id can now be null (PK no longer forbids it). The FK stays —
--    a nullable FK is valid and just means "no reference."
alter table public.bracket_seeds
    alter column team_id drop not null;

-- 5. Participant uniqueness: partial unique indexes per id variant so each
--    (bracket, participant) appears at most once regardless of which column
--    identifies the participant.
create unique index bracket_seeds_bracket_team_uidx
    on public.bracket_seeds (bracket_id, team_id)
    where team_id is not null;

create unique index bracket_seeds_bracket_entry_uidx
    on public.bracket_seeds (bracket_id, entry_id)
    where entry_id is not null;

-- 6. Exactly-one check: every seed identifies a participant via exactly one
--    of (team_id, entry_id). Both-null is rejected (orphan seed); both-set is
--    rejected (ambiguous identity).
alter table public.bracket_seeds
    add constraint bracket_seeds_team_xor_entry
        check ((team_id is null) <> (entry_id is null));
