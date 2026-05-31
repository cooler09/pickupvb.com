# 2026-12-04 — Bundle: Bracket matches `entry_*_id` groundwork

Schema-only groundwork closing the pre-work half of the carry-over
"bracket-reader `source='roster'` filter loosening" follow-up on
the [event data model audit](../audits/event-data-model.md). The
application half (read path, write path, `BracketTeamLite.entryId`)
is deliberately deferred to follow-up bundles — see "What did not
ship" below.

## Why this bundle exists

The Step 5b cleanup left a comment in
[`SupabaseBracketRepository.listRegisteredTeams`](../../packages/infrastructure/src/supabase-bracket-repository.ts)
that's been quoted into every subsequent audit entry:
_"Ad-hoc / walk-in entries are intentionally excluded here
(deferred to a 5b.ii follow-up that teaches the bracket reader to
handle them — at which point teamId may become an entry id and
downstream consumers will need to be reviewed)."_

The root cause is in the schema, not the repo: `bracket_matches.
team_a_id` / `team_b_id` / `winner_team_id` are all FK → `teams.id`.
Ad-hoc and walk-in entries have `event_team_entries.team_id IS NULL`
because they don't have a persistent `teams` row. The repo's
`.eq('source', 'roster')` filter is just downstream of the FK shape
— removing it without a place for the entry id to live would
violate the FK on the first ad-hoc bracket save.

The user asked for "option B" of the proposal in chat: land the
schema migration as its own bundle so the follow-up bundles (read
extension, write cutover, eventual column drops) don't have to
coordinate a destructive migration with code changes. That keeps
each application-layer bundle reversible and lets the migration
sit in production for as long as it needs to before the cutover
flips.

Two design choices were live:

- **Polymorphic pair vs. unified FK.** Unifying on a single
  `entry_*_id` (FK → `event_team_entries`) would have required an
  immediate full cutover — every existing bracket match's
  `team_*_id` would have to flip to its entry id in the same
  migration as the column rename. Polymorphic pair keeps both
  columns side by side and lets the application-layer cutover
  happen incrementally. Cost is the two-FKs-per-slot redundancy,
  which is temporary by construction.
- **At-most-one check vs. exactly-one check.** Exactly-one would
  reject the existing unwired-match state (both null is valid for
  matches whose feeder hasn't completed yet). At-most-one allows
  unwired, allows roster-only (today's state for every row),
  allows entry-only (the future state), and rejects the only
  ambiguous combination — both set, where the bracket reader
  wouldn't know which to trust.

## What shipped

**Migration** —
[supabase/migrations/20260809000000_bracket_matches_entry_id_columns.sql](../../supabase/migrations/20260809000000_bracket_matches_entry_id_columns.sql):

- Three new nullable columns on `bracket_matches`: `entry_a_id`,
  `entry_b_id`, `winner_entry_id`, all FK → `event_team_entries(id)
on delete set null` (matching the existing `team_*_id` cascade
  semantics — set null preserves the match row when the entry is
  hard-deleted).
- Three matching b-tree indexes (`bracket_matches_entry_a_idx`,
  `bracket_matches_entry_b_idx`, `bracket_matches_winner_entry_idx`)
  mirroring the existing `team_*_idx` indexes.
- Backfill for every existing rostered wiring: join
  `bracket_matches` → `event_brackets` (for division scope) →
  `event_team_entries` (`source='roster' AND deleted_at IS NULL
AND team_id = m.team_*_id`), copy the entry id into the new
  column. Division scope is required because a single persistent
  team can appear in roster entries across multiple divisions
  over time.
- Three check constraints: per slot, `team_*_id IS NULL OR
entry_*_id IS NULL`. Both-null permitted; both-set rejected.

**Types stub** —
[packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts).
Hand-patched per the Docker-off convention (see
[/memories/repo/supabase-types-stub.md](memory)). Added three
fields to `bracket_matches`'s Row/Insert/Update with the
alphabetical placement the regenerator would produce, plus three
FK Relationships entries (alphabetical by constraint name)
pointing at `event_team_entries`.

## What did not ship

- **`BracketTeamLite.entryId`** — no change to the domain
  read-model interface.
- **`SupabaseBracketRepository.listRegisteredTeams`** — the
  `.eq('source', 'roster')` filter and the
  `team:teams!inner(name, captain_id)` embed are unchanged.
  Roster reads continue to project through the persistent
  `teams` row.
- **Write path** — `SupabaseBracketRepository.save`,
  [`record-division-winner-actions.ts`](../../apps/web/src/app/events/%5Bid%5D/record-division-winner-actions.ts),
  and any other writer of `team_*_id` / `winner_team_id` are
  untouched. The polymorphic pair allows them to keep writing
  the old columns as long as needed.
- **Bracket UI** — no change.
- **`bracket_seeds`** — also FK → `teams.id` and has the same
  limitation, but is scoped to its own follow-up. This bundle
  only covers match wiring.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` —
15/15 typecheck, lint at the 3 pre-existing unrelated warnings,
test counts unchanged from the previous bundle, 8/8 build.
Migration not applied locally (Docker off); CI/CD picks it up on
deploy.

## Follow-ups created by this bundle

Added to the audit's "Follow-ups remaining" list:

1. Bracket-reader application half — extend
   `listRegisteredTeams` to drop the `source='roster'` filter
   and emit `entryId` on `BracketTeamLite`. Downstream consumers
   (generators, standings, bracket UI, record-winner action,
   winner-label resolution) take an `entryId` in addition to (or
   in place of) `teamId`.
2. Write-side cutover — flip
   `SupabaseBracketRepository.save` and the record-winner action
   to write `entry_*_id` instead of `team_*_id`. Then a clean-up
   migration drops `team_*_id` columns.
3. `bracket_seeds.team_id` polymorphic pair for ad-hoc seeding,
   sequenced after #1 so seeding has a typed read model to feed.

## Follow-ups remaining on the audit

- `LeagueSchedule` RPC (consumer of the forfeit flag).
- Bracket-reader filter loosening — application half (see
  follow-up #1 above).
- `bracket_seeds` polymorphic pair (new — see #3).
