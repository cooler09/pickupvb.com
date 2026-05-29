-- ============================================================================
-- Bracket matches: add entry-id columns alongside team-id columns (groundwork
-- for ad-hoc/walk-in bracket support). See docs/audits/event-data-model.md —
-- carry-over follow-up "bracket-reader `source='roster'` filter loosening".
--
-- Context: `bracket_matches.{team_a_id, team_b_id, winner_team_id}` are all FK
-- → `teams.id` (the persistent team identity). That excludes ad-hoc and walk-in
-- registrations from bracket wiring, since those entries live in
-- `event_team_entries` with `team_id IS NULL`. `SupabaseBracketRepository.
-- listRegisteredTeams` accordingly filters `.eq('source', 'roster')` and the
-- Step 5b cleanup comment in that method explicitly defers the surface to a
-- follow-up that "teaches the bracket reader to handle [ad-hoc/walk-in]
-- entries — at which point teamId may become an entry id and downstream
-- consumers will need to be reviewed."
--
-- This migration is the schema half of that work and only the schema half. It
-- adds three nullable `*_entry_id` columns parallel to the existing `team_*_id`
-- columns, FK → `event_team_entries.id`, backfills them for existing rostered
-- matches, and adds a check constraint that at most one of (`team_a_id`,
-- `entry_a_id`) is populated per slot (same for b, same for winner). The
-- application layer does not change in this bundle — `listRegisteredTeams`
-- still filters `source='roster'` and the repo still writes `team_*_id`. The
-- new columns sit ready for follow-up bundles to: (i) extend the read path to
-- emit `entryId` on `BracketTeamLite`, (ii) flip writes onto the entry
-- columns, and eventually (iii) drop the `team_*_id` columns.
--
-- Impact: additive. Existing reads and writes that only touch `team_*_id`
-- continue to work unchanged. The new check constraint is permissive — a row
-- with only `team_a_id` set (today's state) satisfies it. Nothing here is
-- destructive; no rows are deleted; no columns are dropped. The polymorphic
-- pair is intentional and temporary; a follow-up migration will drop
-- `team_*_id` after callers have flipped to the entry columns.
--
-- Note: `bracket_seeds.team_id` (PK component) is also FK → `teams.id` and
-- has the same limitation. It is *not* included here — seeding for ad-hoc
-- entries is deferred to its own follow-up; this migration covers match
-- wiring only.
-- ============================================================================

alter table public.bracket_matches
    add column entry_a_id      uuid references public.event_team_entries(id) on delete set null,
    add column entry_b_id      uuid references public.event_team_entries(id) on delete set null,
    add column winner_entry_id uuid references public.event_team_entries(id) on delete set null;

create index bracket_matches_entry_a_idx      on public.bracket_matches (entry_a_id);
create index bracket_matches_entry_b_idx      on public.bracket_matches (entry_b_id);
create index bracket_matches_winner_entry_idx on public.bracket_matches (winner_entry_id);

-- Backfill: for every existing roster match wiring, find the corresponding
-- `event_team_entries` row (source='roster', live, in the same division as the
-- match's bracket) and copy its id into the new column. Division scoping is
-- required because a single persistent team may have roster entries in
-- multiple divisions across history.

update public.bracket_matches m
   set entry_a_id = e.id
  from public.event_brackets b,
       public.event_team_entries e
 where m.bracket_id = b.id
   and m.team_a_id is not null
   and m.entry_a_id is null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = m.team_a_id;

update public.bracket_matches m
   set entry_b_id = e.id
  from public.event_brackets b,
       public.event_team_entries e
 where m.bracket_id = b.id
   and m.team_b_id is not null
   and m.entry_b_id is null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = m.team_b_id;

update public.bracket_matches m
   set winner_entry_id = e.id
  from public.event_brackets b,
       public.event_team_entries e
 where m.bracket_id = b.id
   and m.winner_team_id is not null
   and m.winner_entry_id is null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = m.winner_team_id;

-- Polymorphic guard: each slot is identified by at most one of
-- (team_*_id, entry_*_id). Both null is allowed (unwired slot / pending
-- result). Both non-null is rejected as ambiguous. We do NOT require
-- exactly-one — that would force every existing row to flip atomically; the
-- whole point of the polymorphic pair is to let the cutover happen one
-- caller at a time.

alter table public.bracket_matches
    add constraint bracket_matches_team_xor_entry_a
        check (team_a_id is null or entry_a_id is null),
    add constraint bracket_matches_team_xor_entry_b
        check (team_b_id is null or entry_b_id is null),
    add constraint bracket_matches_team_xor_winner_entry
        check (winner_team_id is null or winner_entry_id is null);
