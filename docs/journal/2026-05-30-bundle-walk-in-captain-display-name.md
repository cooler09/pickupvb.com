# 2026-05-30 — Bundle: walk-in registration column-mapping bug fix

Closes the P3 follow-up that was carried as "drop unused
`captain_display_name` column." Pre-action grep surfaced the
opposite: the column is required for every walk-in row by a CHECK
constraint, the form captures it, the aggregate enforces it, and
the application command threads it through to the repo — but the
boundary never wrote it. While verifying, a second column-name
mismatch came to light in the same surface: the repo and event-
detail loader both selected and wrote `display_name` against
`event_team_entries`, where the column was actually named `name`.
Both bugs hidden by `as never as EntryRow` and `data as unknown as
Raw` casts that bypass generated-types validation. Walk-in inserts
would have failed at runtime today.

## What shipped

**Schema (column rename):**

- [`20260807000000_event_team_entries_rename_name_to_display_name.sql`](../../supabase/migrations/20260807000000_event_team_entries_rename_name_to_display_name.sql) —
  `alter table event_team_entries rename column name to
display_name`. Postgres rewrites the inline CHECK predicate
  automatically. `events_view` and `metro_health_weekly` don't
  select the renamed column, so no view rebuild is required.

**Generated types
([`database.types.ts`](../../packages/supabase/src/database.types.ts)):**

- `event_team_entries` Row/Insert/Update: `name` → `display_name`.

**Repository wires `captain_display_name` end-to-end
([`supabase-event-team-registration-repository.ts`](../../packages/infrastructure/src/supabase-event-team-registration-repository.ts)):**

- `EntryRow` gains `captain_display_name: string | null`.
- `save()` payload writes it (`null` for ad-hoc, captain's typed
  name for walk-ins).
- `loadOne()` select string adds the column.
- Raw → EntryRow mapping copies it.
- `rehydrate` consumes `row.captain_display_name` for walk-ins
  instead of falling back to the team display name.

**Loader surfaces it for host UI
([`load-event-detail.ts`](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts)):**

- `AdHocRegRow` and the local `Raw` type gain
  `captain_display_name`.
- `loadAdHocRowsCached` select adds the column.
- `hostRows` mapping prefers `r.captain_display_name` for walk-ins
  instead of duplicating the team name as the captain identity.

**Domain regression tests
([`event-team-registration.test.ts`](../../packages/domain/src/events/event-team-registration.test.ts)):**

- New `describe('EventTeamRegistration walk-in source')` block
  pins the source ↔ identity discriminant: walk-in preserves
  `captainDisplayName` distinct from `name`, rejects empty/null
  captain display names, and rejects linked captain accounts.

## Why "rename column" instead of "fix repo to write `name`"

Every sibling table (`event_team_entry_members.display_name`,
`profiles.display_name`, `groups.display_name`-equivalent
`name`/`slug` pairs) uses `display_name` for human-readable labels.
Every consumer in the tree already writes/reads `display_name`
against `event_team_entries` — the original `name` was the
outlier introduced by the collapse migration's wording. Renaming
the column converges the entire system on one identifier and lets
the generated types catch the next divergence, instead of leaving
six write sites needing to be re-renamed back to `name`.

## Pattern this confirms — twice in a row this session

"Audit says X is unused" is a strong signal that X is actually
load-bearing in a way the audit author didn't see. The previous
bundle ([positional sign-up persistence](2026-05-30-bundle-position-roster-persistence.md))
started as "drop dead `position_roster`" and turned out to be
"hosts can't actually save positional sign-up." This bundle
started as "drop dead `captain_display_name`" and turned out to be
"walk-in inserts violate the CHECK constraint." In both cases
`as never as` casts at the Supabase boundary suppressed the
typecheck errors that would have surfaced the divergence.

**Durable takeaway for the next agent:** treat `as never as` and
`data as unknown as Raw` casts at the Supabase boundary as a
smell. They bypass the one cheap correctness check we have. When
adding a new column on either side of the boundary, prefer typed
`.from('table').insert<RowType>(...)` payloads or feed the cast
through `Database['public']['Tables']['x']['Row']` so a missing
field is a typecheck error, not a runtime CHECK violation that
ships to prod silently.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.
Domain suite: 208 passing (3 new walk-in tests added).

## Follow-ups unchanged

- `EventTeamRegistration.forfeitedAt` wiring (blocked on league
  host UI).
- `LeagueSchedule` RPC for cross-event reads.
- Bracket-reader `source='roster'` filter loosening.
- Bridge-view callers retargeting off `event_attendees` /
  `event_free_agents`.
