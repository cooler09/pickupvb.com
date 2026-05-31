# 0019. Division-scoped team & free-agent entries live inside the event aggregate

- **Status:** Accepted
- **Date:** 2026-05-29
- **Relates to:** [ADR 0001 — Hexagonal architecture with CQRS-lite](0001-hexagonal-cqrs.md), [ADR 0006 — Event divisions](0006-event-divisions.md), [ADR 0016 — Per-division team registration mode](0016-per-division-team-registration-mode.md)
- **Addresses:** [architecture audit P1 (2026-05-29)](../audits/architecture.md#reevaluation--2026-05-29)

## Context

The [2026-05-29 architecture re-audit](../audits/architecture.md#reevaluation--2026-05-29)
graded as **P1** the fact that team and free-agent registrations are persisted
through a code path that **sidesteps the `VolleyballEvent` aggregate**.

The aggregate cannot represent which division an entry belongs to:

- `_teams: Set<TeamId>` — team ids only, no division.
- `_freeAgents: Map<UserId, notes>` — user → notes, no division.

But the underlying tables require a division: `event_team_entries.division_id`
and the `event_participants` free-agent rows are both keyed on `division_id`
(NOT NULL). To bridge the gap, the application layer added two
aggregate-sidestepping repository ports:

- `EventRepository.attachTeamToDivision(eventId, teamId, divisionId)`
- `EventRepository.attachFreeAgentToDivision(eventId, userId, divisionId)`

and the handlers wrote registrations as **two operations**:

```ts
// JoinEventAsFreeAgentHandler (today)
event.joinAsFreeAgent(userId, divisionId, notes); // validates, then DROPS divisionId
await repo.save(event); // writes FA row (single-div) or SKIPS (multi-div)
await repo.attachFreeAgentToDivision(eventId, userId, divisionId); // sets the division

// RegisterTeamHandler (today)
event.registerTeam(team.id); // runs invariants, then the in-memory mutation is DISCARDED
event.pullEvents();
await repo.attachTeamToDivision(eventId, teamId, divisionId); // the only write
```

`save()` itself is riddled with the consequences: a `soleDivisionId` fallback
and `if (!soleDivisionId) continue` skips for both teams and free agents,
because it can't know which division a newly-added entry belongs to.

### Honest re-grade of the severity

On close inspection this is a **structural / consistency-boundary** defect, not
the active data-corruption hazard the audit P1 first implied:

- Single-division free-agent: `save()` already inserts the row with the sole
  division, and the follow-up `attach…` upsert is to the _same_ division —
  redundant, not corrupting.
- Multi-division free-agent: `save()` skips, `attach…` does the only insert —
  a failure between them leaves the operation **un-done** (retryable), not
  half-written.
- Team registration is a **single** write (`attach…`); there is no second
  write to be inconsistent with.

So the real cost is: the aggregate is **not the consistency boundary it claims
to be** (DDD violation), there are **three asymmetric write paths**
(register→attach-only, withdraw→save, FA-join→save+attach, FA-leave→save) that
are a footgun for the next change, and `save()` carries dual-logic that silently
no-ops on multi-division inserts. Worth fixing as the first structural phase;
graded P1 for "fix before building more on top," not "production data loss."

## Decision

**Model the division on the aggregate's entries, and make `save()` the single
authoritative write path. Delete both `attach…` ports.**

1. **Aggregate shape.**
   - `_teams: Set<TeamId>` → `Map<TeamId, DivisionId | null>`.
   - `_freeAgents: Map<UserId, string | null>` → `Map<UserId, FreeAgentEntry>`
     where `FreeAgentEntry = { divisionId: DivisionId | null; notes: string | null }`.
   - `null` divisionId is permitted for legacy rows read from the DB that
     predate a clean division assignment; new writes always carry a division.

2. **Behaviors.**
   - `registerTeam(teamId, divisionId)` gains the division argument and
     **validates the division exists on the event** (`NotFoundError`
     otherwise), then stores `_teams.set(teamId, divisionId)`. The aggregate
     becomes self-consistent — the handler's pre-check is now defense-in-depth,
     not the only guard.
   - `joinAsFreeAgent(userId, divisionId, notes)` keeps its signature (it
     already takes + validates `divisionId`) but now **stores** it instead of
     discarding.
   - `withdrawTeam` / `leaveAsFreeAgent` are unchanged (delete by key).

3. **Read getters stay backward-compatible.** `get teams(): ReadonlySet<TeamId>`
   and `get freeAgents(): ReadonlyMap<UserId, string | null>` keep their shapes
   (derived from the new maps) so the two existing consumers don't churn. The
   adapter reads new `teamEntries` / `freeAgentEntries` getters that expose the
   division.

4. **`save()` persists with the per-entry division.** Team inserts route
   through the existing `attach_team_to_division` RPC (preserving its
   `INSERT … ON CONFLICT DO NOTHING` against the partial unique index); free-agent
   inserts upsert on `(division_id, user_id)`. The `soleDivisionId` fallback is
   retained **only** for null-division (legacy) entries. RegisterTeam and
   FreeAgent-join now go through `save()` like withdraw/leave already do — one
   symmetric write path.

5. **Atomicity is explicitly out of scope.** `save()` remains a sequence of
   PostgREST statements (not one transaction) — that is a pre-existing property
   shared with the attendee and division reconciliation, and wrapping the whole
   reconciliation in a `SECURITY DEFINER` RPC is a separate, larger effort
   (tracked as a follow-up on the architecture audit). This ADR removes the
   _handler-level_ second write and the modeling gap; it does not promise
   cross-statement atomicity.

Attendees are **not** in scope: open-play events are single-division by
invariant (ADR 0006 / P1 #3), so the `soleDivisionId` path is correct for them.

## Consequences

- **Easier:** the aggregate is the single source of truth for "who is
  registered, in which division." New registration features extend the
  aggregate, not a side-channel port. The `EventRepository` port sheds two
  methods (a step toward the P2-2 god-port split). `save()` loses its
  multi-division skip branches.
- **Harder / watch out:** `registerTeam` now routes through `save()`, which
  does a full reconciliation (heavier than the old single insert). This matches
  `withdrawTeam`'s existing behavior and is acceptable, but it means a team
  registration re-upserts the event row + re-reconciles divisions; correctness
  depends on `findById` loading divisions completely (it does).
- **Committed to:** every entry the aggregate owns carries its division;
  `fromPersistence` and the reader must supply it.
- **Not solved:** true multi-row atomicity of `save()`, and clean handling of a
  free agent _changing_ divisions (pre-existing gap, left as-is).

## Alternatives considered

- **Surgical RPC per registration (no aggregate change).** Replace `save()+attach`
  with one `register_*_for_division` RPC for true atomicity. Rejected as the
  primary fix because it leaves the DDD modeling gap (the aggregate still can't
  represent division) and adds DB surface; kept on the table as the future
  atomicity follow-up.
- **Keep the attach ports, just stop discarding divisionId.** Doesn't remove
  the asymmetry or the side-channel — the aggregate would know the division but
  still not persist it. Half-measure.
- **Full transaction wrapper around `save()`.** The correct long-term answer for
  atomicity, but far larger than this phase and orthogonal to the modeling fix.
  Deferred.
