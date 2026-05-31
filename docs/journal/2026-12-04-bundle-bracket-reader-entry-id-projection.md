# 2026-12-04 — Bundle: Bracket-reader `entryId` projection + filter swap

First slice of the application half of the carry-over
"bracket-reader `source='roster'` filter loosening" follow-up on
the [event data model audit](../audits/event-data-model.md). The
two schema-groundwork bundles shipped earlier today
([matches](2026-12-04-bundle-bracket-matches-entry-id-groundwork.md),
[seeds](2026-12-04-bundle-bracket-seeds-entry-id-groundwork.md))
landed the polymorphic `entry_id` columns + check constraints;
this bundle starts moving the reader onto them.

## Why this bundle exists

With both `bracket_matches.entry_*_id` and
`bracket_seeds.entry_id` in place, the next step is to thread
the entry id through the read model so downstream callers
(generators, standings, record-winner action, bracket UI) have
something to write into the new columns. That's the obvious
prerequisite for the upcoming match-write-path cutover.

The unit of work for this bundle deliberately stops at
"emit `entryId`" — no consumer rewires yet. Two reasons:

1. The match write-path cutover is structurally larger
   ( `Match.teamAId` / `teamBId` / `winnerTeamId` likely need a
   rename to `entryAId` / `entryBId` / `winnerEntryId` across
   the domain — `standings.ts`, `generators.ts`, plus tests and
   web consumers). Landing the read-side field first keeps the
   write-side bundle reviewable on its own terms.
2. Until the write side flips, ad-hoc / walk-in entries can't
   actually be wired into matches even if the reader emitted
   them. So the user-visible behaviour change must be batched
   with the writes anyway.

## What's different from the schema bundles

The schema bundles were pure migrations + types-stub patches.
This is the first bundle to touch the domain interface
(`BracketTeamLite`) and the infra port implementation. No
migration. No behaviour change for any code path that already
existed; the new field is additive.

The reader's filter changed from
`.eq('source', 'roster')` to `.not('team_id', 'is', null)`. Why
swap a filter that's semantically equivalent?

- The
  [`event_team_entries_team_matches_source`](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql)
  check constraint pins `(source = 'roster') = (team_id IS NOT
NULL)` — so the two predicates select the same rows today.
- But the downstream FK constraint we actually care about is
  the FK shape, not the discriminator. `bracket_seeds.team_id`
  and `bracket_matches.team_*_id` reference `teams(id)`; they
  need a non-null `event_team_entries.team_id` to write into
  the legacy slot. Filtering on the shape is the right
  boundary as more sources gain support.
- When the write-side cutover lands and the filter eventually
  drops entirely, removing
  `.not('team_id', 'is', null)` reads as "now we accept all
  entries"; removing `.eq('source', 'roster')` would have read
  as "now we accept all sources," which is the same intent but
  via the wrong axis.

The two-axis equivalence isn't load-bearing — the swap is a
documentation choice, not a behaviour choice.

## What shipped

**Domain.** [`BracketTeamLite`](../../packages/domain/src/brackets/bracket-repository.ts)
grew a required `entryId: string` field. Always populated from
`event_team_entries.id`; stable across the pending write-side
cutover so callers don't have to re-resolve once writes flip
onto the polymorphic columns. `teamId` is unchanged — still
`string`, still the FK target for the legacy
`bracket_seeds.team_id` / `bracket_matches.team_*_id`
columns.

**Infra.** [`SupabaseBracketRepository.listRegisteredTeams`](../../packages/infrastructure/src/supabase-bracket-repository.ts):

- `select` adds `id` (projected onto the new `entryId` field).
- Filter swaps `.eq('source', 'roster')` for
  `.not('team_id', 'is', null)`. The
  `event_team_entries_team_matches_source` check constraint
  guarantees the two predicates select the same rows today; the
  new framing matches the FK-shape boundary the downstream
  legacy columns actually need.
- The pre-existing TS-narrowing filter
  (`rows.filter((r) => r.teams !== null && r.team_id !== null)`)
  stays — `team_id` is now `string | null` per the bracket-seeds
  bundle's stub patch, so the runtime guard is still earning its
  keep until the field is unconditionally non-null again.

## What did not ship

- **Match read-model entry id projection.** `Match.teamAId` /
  `teamBId` / `winnerTeamId` continue to read from
  `bracket_matches.team_*_id` only; the new `entry_*_id`
  columns are written by the schema bundle's backfill but the
  read path ignores them.
- **Domain rename.** `Match.teamAId` / `teamBId` /
  `winnerTeamId` are unchanged. The eventual rename to
  `entryAId` / `entryBId` / `winnerEntryId` is the natural
  next move but stays bundled with the write-path cutover so
  there's one atomic switch of meaning.
- **Match write path.** `SupabaseBracketRepository.save` still
  writes `team_a_id` / `team_b_id` / `winner_team_id` only.
  The polymorphic check constraint is satisfied because the
  insert doesn't supply `entry_*_id`.
- **Seed read or write path.** Unchanged.
- **Record-winner action.** Unchanged.
- **Bracket UI.** Unchanged.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` —
15/15 typecheck, lint at the 3 pre-existing unrelated warnings,
test counts unchanged from the previous bundle, 8/8 build. No
test fakes construct `BracketTeamLite` literals, so the new
required field didn't ripple into test setups.

## Follow-ups remaining on the audit

1. **`LeagueSchedule` RPC** — consumer of the
   `event_team_entries.forfeited_at` flag shipped 2026-05-30.
2. **Match write-path cutover.** Flip
   `SupabaseBracketRepository.save` +
   [`record-division-winner-actions.ts`](../../apps/web/src/app/events/%5Bid%5D/record-division-winner-actions.ts)
   onto `entry_*_id` / `winner_entry_id`. Likely paired with a
   domain rename `Match.teamAId` / `teamBId` / `winnerTeamId`
   → `entryAId` / `entryBId` / `winnerEntryId` (touches
   `standings.ts`, `generators.ts`, the bracket UI components,
   plus tests).
3. **Seed write-path cutover.** Flip the
   `SupabaseBracketRepository` seed-insert onto
   `bracket_seeds.entry_id`.
4. **Drop the filter.** Once readers + writers are fully off
   `team_*_id`, drop
   `.not('team_id', 'is', null)` from `listRegisteredTeams`
   and let ad-hoc / walk-in entries flow through to the
   bracket reader. Also drop the runtime `r.team_id !== null`
   narrowing filter — at that point the projection is
   `entryId` only.
5. **Cleanup migration.** Drop the legacy `team_*_id` columns
   from `bracket_seeds` + `bracket_matches`, drop their
   matching indexes, and drop the per-slot check constraints
   on `bracket_matches` (the seeds `xor` check becomes a
   trivial `entry_id IS NOT NULL`).
