# 2026-05-29 — Bundle: Phase 1 — division-scoped team & free-agent entries (P1)

## Context

Phase 1 of the architecture refactor, closing the **P1** from the
[2026-05-29 re-audit](../audits/architecture.md#reevaluation--2026-05-29):
team and free-agent registrations were persisted through a path that
**sidestepped the `VolleyballEvent` aggregate**. The aggregate couldn't
represent which division an entry belonged to (`_teams: Set<TeamId>`,
`_freeAgents: Map<UserId, notes>`), so two `EventRepository` ports —
`attachTeamToDivision` / `attachFreeAgentToDivision` — wrote the join rows out
of band, and `save()` carried `soleDivisionId` fallbacks + `if (!soleDivisionId)
continue` skips. Decision recorded in
[ADR 0019](../adr/0019-division-scoped-aggregate-entries.md).

## Decisions

- **Honest re-grade.** Deep reading showed this is a **consistency-boundary /
  structural** defect, not the active data-corruption the audit P1 first
  implied: single-division FA was a redundant-but-harmless double write, and
  team registration was already a _single_ write. The real costs were the DDD
  modeling gap, three asymmetric write paths, and `save()`'s multi-division
  skip footgun. Kept it P1 ("fix before building more on top"), corrected the
  wording in the audit + ADR.
- **Aggregate owns the division (Option A), not a surgical RPC (Option B).**
  `_teams` → `Map<TeamId, DivisionId | null>`; `_freeAgents` →
  `Map<UserId, FreeAgentEntry>` (`{ divisionId, notes }`). `registerTeam` gains
  a `divisionId` arg and validates the division exists; `joinAsFreeAgent` now
  _stores_ the division it already validated. Chose this over a per-registration
  RPC because it makes the aggregate the authority (the DDD fix) with no DB
  migration. True multi-statement atomicity of `save()` is explicitly deferred
  (it's a pre-existing property shared with attendee/division reconciliation).
- **Backward-compatible getters.** Kept `get teams(): ReadonlySet<TeamId>` and
  `get freeAgents(): ReadonlyMap<UserId, string|null>` (derived) so the two
  existing consumers didn't churn; added `teamEntries` / `freeAgentEntries` for
  the adapter. `divisionId` is nullable only for legacy rows read from the DB.
- **`save()` reuses the existing `attach_team_to_division` RPC internally.**
  Rather than reimplement the partial-unique `ON CONFLICT DO NOTHING` (the RPC
  resolves captain/name and honours `event_team_entries_division_team_uidx`),
  `save()` now calls it per team-to-insert with the entry's division. FA inserts
  upsert on `(division_id, user_id)` with `ignoreDuplicates` — same idempotency
  the removed `attachFreeAgentToDivision` had. No migration; the RPC stays.
- **RegisterTeam now routes through `save()`** (like `withdrawTeam` already
  did), making the four team/FA write paths symmetric.

## Changes

Domain:

- `events/volleyball-event.ts` — `FreeAgentEntry` type; `_teams` → Map,
  `_freeAgents` → Map<…, FreeAgentEntry>; `registerTeam(teamId, divisionId)`
  validates division existence; `joinAsFreeAgent` stores the division;
  `teams`/`freeAgents` getters derived; new `teamEntries` / `freeAgentEntries`;
  `fromPersistence` accepts division-aware tuples (back-compat with bare/legacy
  shapes).
- `events/event-repository.ts` — removed `attachTeamToDivision` /
  `attachFreeAgentToDivision` from the port (replaced with an ADR-0019 note).

Infrastructure:

- `supabase-event-repository.ts` — `findById` loads `division_id` for teams +
  free agents; `save()` persists both with the per-entry division (teams via
  the `attach_team_to_division` RPC, FA via idempotent upsert); deleted both
  attach methods.

Application:

- `commands/team.handler.ts` — `RegisterTeamHandler` calls
  `event.registerTeam(team.id, DivisionId(divisionId))` + `save()`; removed the
  `pullEvents()`/`attachTeamToDivision` two-step + stale doc comment.
- `commands/join-event.handler.ts` — `JoinEventAsFreeAgentHandler` drops the
  `attachFreeAgentToDivision` call.

Tests:

- `volleyball-event.test.ts` — tournament-signup tests now build a division;
  assert `teamEntries` / `freeAgentEntries` carry the division (executable
  record of the fix); new "unknown division → NotFoundError" case.
- `team.handler.test.ts` — fake repo drops `attachTeamToDivision`; happy path
  asserts the saved aggregate carries the team↔division join.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(309 tests; lint 0 errors). No DB migration.

## Patterns observed

- **The two `attach…` ports weren't gratuitous — they encoded conflict
  semantics** (`attach_team_to_division`'s partial-unique `ON CONFLICT`, FA's
  `(division_id, user_id)` upsert). Removing a side-channel means re-homing its
  invariants, not just its insert. `save()` now owns them.
- **Re-grade as you implement.** The audit's P1 framing ("data-loss") was
  stronger than the code warranted; reading the actual `save()` + attach paths
  corrected it to "structural." Worth fixing, but the severity label should
  match the mechanism.

## Follow-ups

- **True `save()` atomicity** (wrap the multi-row reconciliation in a
  transaction / `SECURITY DEFINER` RPC). Pre-existing, broad (also affects
  attendees + divisions), deferred — tracked on the architecture audit.
- **Free-agent _changing_ divisions** isn't cleanly handled (the notes-only
  update path ignores a division change). Pre-existing; left as-is.
- **Attendees** keep the `soleDivisionId` path — correct because open-play is
  single-division by invariant, so they're intentionally out of ADR 0019's
  scope.
