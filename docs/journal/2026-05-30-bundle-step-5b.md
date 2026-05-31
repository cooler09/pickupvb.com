# Step 5b — Collapse team-entry tables (thin pass) (2026-05-30)

## Context

P2 #6.6 from [docs/audits/event-data-model.md](../audits/event-data-model.md).
Three tables (`event_teams`, `event_team_registrations`,
`event_team_registration_members`) all model "a team registered for a
division" with a different `source` discriminator (roster vs.
captain-built ad-hoc vs. host walk-in). Each carries its own RLS
policy, payment join, and embedded SELECT shape — every read that
wanted "all teams in division X" branched on which table to hit.

Collapsed into a single `event_team_entries` + `event_team_entry_members`
pair with a unified `source` enum (`roster | ad_hoc | walk_in`). The
two captain-built variants (formerly `captain` / `host`) merged into
`ad_hoc` since the only distinguishing fact was _who created the row_,
which is already captured by `captain_id` (set ⇒ captain, null ⇒
walk-in) and the new `created_by` audit column.

Retargeted `event_team_payments` from the legacy composite
`(division_id, team_id)` FK onto a single `entry_id` FK (unique). Also
collapsed `event_divisions`'s two winner FKs (`winner_team_id` →
`teams`, `winner_team_registration_id` → `event_team_registrations`)
into one `winner_entry_id` → `event_team_entries`.

User picked the **thin 5b** (Option 4 in this turn's planning): land
the schema migration + minimum repo changes to keep verify green;
defer read-shape cleanups (bracket reader treating ad-hoc entries as
first-class, dropping the `EventTeamRegistration` aggregate's
`captain | host` source variants, simplifying `attachTeamToDivision`
to a real upsert once the partial unique index is reconsidered) to a
follow-up **Step 5b.ii**.

## Decisions

- **Preserve aggregate APIs at the boundary.** The
  `EventTeamRegistration` aggregate still exposes
  `RegistrationSource = Captain | Host | WalkIn` (a 3-valued enum). The
  repo translates lossy at the adapter edge: aggregate `Captain` /
  `Host` both map to DB `ad_hoc`; DB `ad_hoc` always rehydrates as
  aggregate `Captain` (the old `Host` distinction is now data-equivalent
  to `Captain`). Zero call sites had to change. The aggregate-level
  distinction will be deleted in 5b.ii once we confirm no UI surface
  branches on the old `Host` value.
- **`event_team_entries.display_name` doubles as the walk-in captain
  name.** For walk-ins there is no profile to look up, so the captain's
  display name was previously stored in
  `event_team_registrations.captain_display_name`. Folding it into
  `display_name` is reasonable because walk-in entries are never team
  rosters — the entry _is_ the captain. Boundary code (`load-event-detail`,
  registration repo) reconstructs `captainDisplayName = walk_in ?
display_name : profile.display_name` so the read shape is unchanged.
- **Payment columns moved off `event_team_entries` onto
  `event_team_payments`** (1:1 via `entry_id` unique). The registration
  repo now upserts both rows on save and embeds
  `payment:event_team_payments(...)` on read. Keeping payment state on a
  separate table mirrors how roster payments already worked and lets
  Stripe-side updates write a single table.
- **`attachTeamToDivision` does select-then-insert, not upsert.** The
  unique index on `event_team_entries(division_id, team_id) WHERE
team_id IS NOT NULL AND deleted_at IS NULL` is partial; PostgREST's
  `onConflict` can't target a partial index. Idempotence is achieved by
  pre-checking for an existing roster entry. Real upsert path is a 5b.ii
  candidate (either by adding a deferred trigger or by giving roster
  entries their own unique constraint).
- **Bracket reader stays roster-only.** `listRegisteredTeams` keeps the
  `source='roster'` filter, so ad-hoc bracket inclusion is not enabled
  by this bundle. The `BracketTeamLite.teamId` field would have to become
  an entry id to support ad-hoc, which is a wider downstream change
  (winner recording, score reporting, etc.).
- **`event_divisions.winner_entry_id` replaces both winner FKs.** The
  `record-division-winner-actions` server action still accepts the
  `kind:id` discriminator from the form, but uses it only to resolve the
  _entry id_ — for `kind=team` it looks up the roster entry by
  `(team_id, division_id, source='roster')`. Single FK column makes
  winner-label rendering a single lookup with `teams.name` as a
  preferred fallback over `display_name`.

## Changes

- [supabase/migrations/20260731000000_collapse_team_registration_tables.sql](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql)
  — schema migration. Creates `event_team_entries` +
  `event_team_entry_members` + `event_team_entry_members_public` view;
  backfills from the three legacy tables; retargets
  `event_team_payments(entry_id)`; collapses
  `event_divisions.winner_entry_id`; drops the three legacy tables and
  their policies / triggers / indexes.
- [packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts)
  — hand-edited (Docker still off): removed the three legacy table
  blocks, added `event_team_entries` + `event_team_entry_members` +
  `event_team_entry_members_public`; collapsed
  `event_divisions.winner_team_id` / `winner_team_registration_id` →
  `winner_entry_id` + updated the FK relationship list.
- Infra: [packages/infrastructure/src/supabase-event-team-registration-repository.ts](../../packages/infrastructure/src/supabase-event-team-registration-repository.ts)
  rewritten end-to-end (boundary translation, split payment table,
  embedded-payment read shape); [packages/infrastructure/src/supabase-event-team-payment-repository.ts](../../packages/infrastructure/src/supabase-event-team-payment-repository.ts)
  rewritten (resolve `entry_id` from `(event_id, team_id)` on save;
  hydrate via `entry → division → event_id`);
  [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
  (roster reads switched to `event_team_entries` w/ `source='roster'`;
  winner-label resolution rewritten for `winner_entry_id`; reconcile
  delta in `save()` inserts entries with `display_name + captain_id`;
  `attachTeamToDivision` uses select-then-insert);
  [packages/infrastructure/src/supabase-bracket-repository.ts](../../packages/infrastructure/src/supabase-bracket-repository.ts)
  (roster filter).
- App (~7 files): [apps/web/src/app/teams/[id]/delete-actions.ts](../../apps/web/src/app/teams/%5Bid%5D/delete-actions.ts),
  [apps/web/src/app/events/[id]/record-division-winner-actions.ts](../../apps/web/src/app/events/%5Bid%5D/record-division-winner-actions.ts)
  (resolves `entry_id`; writes single `winner_entry_id` column),
  [apps/web/src/app/events/[id]/roster-team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/roster-team-checkout-actions.ts),
  [apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
  (public + private cached snapshots; eligibility loader; payment
  fields now read via embedded `event_team_payments`; walk-in captain
  name reconstructed at boundary),
  [apps/web/src/app/events/[id]/\_components/host-ad-hoc-teams-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/host-ad-hoc-teams-panel.tsx),
  [apps/web/src/app/events/[id]/\_components/ad-hoc-team-signup-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/ad-hoc-team-signup-panel.tsx)
  (source union narrowed to `ad_hoc | walk_in`).
- [docs/audits/event-data-model.md](../audits/event-data-model.md) —
  remediation log entry under "P2 #6.6 (Step 5b — thin pass) landed."
- [docs/audits/README.md](../audits/README.md) — bumped index date to
  2026-05-30.

## Patterns observed

- **Lossy boundary translation as an aggregate-stability tool.** When
  the DB enum widens or narrows, mapping at the repo edge (not in the
  aggregate) lets the rest of the codebase keep its existing
  invariants. The cost is one place where the mapping is irreversible
  (`Captain ⇄ ad_hoc`, `Host → ad_hoc`); that cost is documented in
  the repo file's header so 5b.ii knows what it inherited.
- **PostgREST embedded reads as a denormalization replacement.** Once
  `payment_status` etc. moved off the entries table, every read shape
  that previously got payment cols for free now embeds
  `payment:event_team_payments(...)`. For 1:1 relations Supabase returns
  either an object or a 1-element array depending on the FK direction;
  code that consumes the embed has to normalize. Worth a small helper
  if this pattern shows up a third time.
- **Partial unique indexes don't compose with PostgREST upserts.** The
  `WHERE deleted_at IS NULL` qualifier on
  `event_team_entries_division_team_uidx` makes it invisible to
  `onConflict`. Select-then-insert is the workaround; a real upsert
  needs either a different index design or a deferred unique trigger.

## Follow-ups (Step 5b.ii)

- **Drop the `EventTeamRegistration.RegistrationSource.Host` enum
  value.** Audit all call sites for branches on `Host`; if none
  remain, delete the variant and tighten the boundary translation to a
  bijection.
- **Teach the bracket reader (and downstream winner / score paths) to
  treat ad-hoc / walk-in entries as first-class.** Today
  `listRegisteredTeams` filters `source='roster'`; ad-hoc tournaments
  can't render a bracket. Likely needs `BracketTeamLite.teamId` to
  become `entryId` and a label projection that respects roster vs.
  ad-hoc.
- **Real upsert in `attachTeamToDivision`.** Either give the roster
  entry shape its own non-partial unique constraint, or add a deferred
  trigger that enforces the soft-delete partial. Removes the
  select-then-insert race window.
- **Drop legacy `captain_display_name` and the boundary fallback** once
  callers that read it are confirmed gone. Walk-in captain name now
  lives on `display_name`; the column at the DB level is already gone,
  but the boundary helpers still synthesize the old field for one
  consumer's convenience.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
Domain + application + web Vitest suites pass (cached). Lint emits the
same 3 pre-existing `react-hooks/set-state-in-effect` warnings in the
scoreboard pages (untouched). Migration not applied locally (Docker
off); CI/CD applies on deploy per AGENTS.md.
