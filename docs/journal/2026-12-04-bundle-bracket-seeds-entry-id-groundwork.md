# 2026-12-04 — Bundle: Bracket seeds `entry_id` groundwork

Schema-only companion to the
[bracket matches `entry_*_id` groundwork bundle](2026-12-04-bundle-bracket-matches-entry-id-groundwork.md)
shipped earlier today. Lands the polymorphic pair on
`bracket_seeds` so the future bracket-reader filter-loosening
bundle can flip seeds and matches together. Application layer is
again deliberately unchanged.

## Why this bundle exists

The matches bundle's follow-up list explicitly carried
"`bracket_seeds` polymorphic pair for ad-hoc seeding" as its own
slice. The reasoning was the same as for matches —
`bracket_seeds.team_id` is FK → `teams.id`, ad-hoc / walk-in
entries have `event_team_entries.team_id IS NULL`, and the
existing seeding path therefore can't reach them without a typed
entry-side identifier on the seed row.

Leaving seeds on the roster-only path while matches gain the
polymorphic pair would have created an awkward state where the
bracket reader knows how to wire an ad-hoc team into a match but
can't seed it — so the bracket-reader filter-loosening bundle
would still be blocked. Closing both schema halves in adjacent
bundles keeps the application-half bundle small and atomic when
its turn comes.

## What's different from the matches bundle

Two design choices diverged:

- **PK rotation required.** `bracket_matches`'s PK is on an
  identity `id uuid` column, so making the `team_*_id` columns
  nullable required no structural change. `bracket_seeds`'s PK is
  `(bracket_id, team_id)` from the original
  [20260514000400_tournament_brackets.sql](../../supabase/migrations/20260514000400_tournament_brackets.sql)
  migration — `team_id` is part of the PK and Postgres won't let
  a PK column become nullable. The original table also carried a
  `unique (bracket_id, seed)` constraint, and `seed` is unique
  per bracket by construction (a seed is just the integer
  position). So the cleanest path was to **promote the existing
  unique constraint to the PK**: drop the old PK, drop the
  auto-named unique, add `primary key (bracket_id, seed)`. No
  synthetic id column needed.

  The DO block that drops the unique constraint is intentional —
  Postgres auto-names unique constraints (typical convention
  `bracket_seeds_bracket_id_seed_key`, but not guaranteed across
  Postgres versions or future renames) and I'd rather scan
  `pg_constraint` for the right name at apply-time than encode a
  brittle assumption.

- **Exactly-one check, not at-most-one.** Matches use
  `team_*_id IS NULL OR entry_*_id IS NULL` per slot — both-null
  is a valid unwired-feeder state, so at-most-one is the correct
  invariant. Seeds are different: a seed without a participant
  is meaningless (there's no upstream-feeder analogue for a
  seeding row), so the invariant is
  `(team_id IS NULL) <> (entry_id IS NULL)` — exactly one of
  the two must be set. This rejects both the all-null state and
  the both-set ambiguity.

## What shipped

**Migration** —
[supabase/migrations/20260810000000_bracket_seeds_entry_id_column.sql](../../supabase/migrations/20260810000000_bracket_seeds_entry_id_column.sql):

- Nullable `entry_id uuid references public.event_team_entries(id)
on delete cascade` + `bracket_seeds_entry_idx` index. Cascade
  matches the existing `team_id` semantics — when an entry is
  hard-deleted (which only happens for un-paid ad-hoc rows in
  practice) the seed row goes with it.
- Backfill via the same join used by the matches bundle:
  `bracket_seeds` → `event_brackets` (for division scope) →
  `event_team_entries` (`source='roster' AND deleted_at IS NULL
AND team_id = s.team_id`). Same division-scope rationale —
  the same persistent team can have roster entries across
  multiple divisions.
- `team_id` drops `NOT NULL`. The existing FK to `teams(id)`
  stays — nullable FK columns are valid SQL; `null` means
  "no rostered team reference," not "broken reference."
- PK rotation: drop `bracket_seeds_pkey`, DO block drops all
  auto-named unique constraints, add `primary key (bracket_id,
seed)`.
- Two partial unique indexes for participant uniqueness:
  `bracket_seeds_bracket_team_uidx WHERE team_id IS NOT NULL`
  and `bracket_seeds_bracket_entry_uidx WHERE entry_id IS NOT
NULL`. Mirrors the partial-unique pattern already used on
  `event_team_entries`.
- Check constraint `bracket_seeds_team_xor_entry`
  `((team_id IS NULL) <> (entry_id IS NULL))` — exactly-one.

**Types stub** —
[packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts).
Hand-patched per the Docker-off convention (see
[/memories/repo/supabase-types-stub.md](memory)):
`team_id` flipped to `string | null` on Row, became optional on
Insert/Update; added `entry_id: string | null` (Row) plus its
FK Relationships entry alphabetically between
`bracket_seeds_bracket_id_fkey` and `bracket_seeds_team_id_fkey`.

## What did not ship

- **`SupabaseBracketRepository`** — the seed-insert path at
  `~L230` continues to write `team_id` only. The exactly-one
  check is satisfied because the insert doesn't supply
  `entry_id`. The seed-read path at `~L141` continues to project
  `team_id` from the local `SeedRow` cast. Both will move to
  `entry_id` in the same future bundle that flips the matches
  write path.
- **Domain / application layer** — no change to bracket aggregates,
  no new command handlers, no test changes.
- **Bracket UI** — no change.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` —
15/15 typecheck, lint at the 3 pre-existing unrelated warnings,
test counts unchanged from the previous bundle, 8/8 build.
Migration not applied locally (Docker off); CI/CD picks it up on
deploy.

## Follow-ups remaining on the audit

Both schema halves of the filter-loosening pre-work have now
landed. What's left:

1. **`LeagueSchedule` RPC** — consumer of the
   `event_team_entries.forfeited_at` flag shipped 2026-05-30.
2. **Bracket-reader filter loosening — application half.** Now
   spans both matches and seeds. Concretely:
   - Extend `SupabaseBracketRepository.listRegisteredTeams` to
     drop the `.eq('source', 'roster')` filter and emit
     `entryId` on `BracketTeamLite` (replacing or alongside
     `teamId`).
   - Flip the match write path
     (`SupabaseBracketRepository.save`,
     [`record-division-winner-actions.ts`](../../apps/web/src/app/events/%5Bid%5D/record-division-winner-actions.ts))
     onto `entry_*_id` / `winner_entry_id`.
   - Flip the seed write path
     (`SupabaseBracketRepository`'s seed-insert at ~L230) onto
     `entry_id`.
   - Once readers + writers are off the `team_*_id` columns,
     a follow-up cleanup migration drops them.
