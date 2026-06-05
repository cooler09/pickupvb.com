# Standalone bracket: paste-a-list bulk team add (2026-06-02)

## Context

User report: "the bracket host tool doesn't have the ability to add a list of
teams on the standalone." A standalone bracket (ADR 0025) starts empty — teams
are typed in by name on the `/brackets/[id]` setup view. The only entry path was
`WalkInTeamForm` driving `addBracketTeamFromClient`, **one team per round-trip**.
Entering a known roster (a real tournament's 12–24 teams) meant 20+ submits.
This is the standalone analogue of the deferred "standalone draft/edit UI" item
in the bracket-workflow-redesign initiative.

## Decisions

- **Added a first-class bulk command rather than looping the single-add from
  the client.** Looping `addBracketTeamFromClient` N times means N
  `findById` + N owner-checks + N inserts + N revalidates. Instead
  `AddBracketTeamsHandler` loads/authorizes the bracket once and the repo does a
  single multi-row insert (`addBracketTeams`), one revalidate. Same layering as
  the single path — the handler gates `status === 'setup'`, the repo just
  inserts.
- **Teams live outside the `Bracket` aggregate, so no domain change.**
  Standalone teams are `bracket_teams` rows loaded separately via
  `listStandaloneTeams`; `addBracketTeam`/`addBracketTeams` are repo operations
  gated by the handler's status check, exactly like the existing single-add.
  Nothing to model on the aggregate.
- **Dedupe within the batch, keep parity on cross-existing collisions.** The
  handler trims, drops blanks, and collapses case-insensitive duplicate _lines_
  (an accidental repeated paste line shouldn't mint twins) but allows a name that
  merely collides with an already-registered team — the single-add path imposes
  no uniqueness, so we don't either. Capped at 128 names/batch (`ValidationError`).
- **Reused `WalkInTeamForm`, gated the bulk UI on the binding.** The standalone
  binding now exposes an optional `bulkAddTeams`; when present the modal shows a
  _Single / Paste-a-list_ tab. Event scope leaves `bulkAddTeams` undefined (event
  walk-ins carry rosters and are added one at a time), so the tab never appears
  there and event call sites are untouched. Both modes feed the same "added this
  session" list, so the host sees a running confirmation either way.

## Changes

- **domain** `packages/domain/src/brackets/bracket-repository.ts` — new
  `addBracketTeams(bracketId, names[]): { entryId, name }[]` port method.
- **infrastructure** `supabase-bracket-repository.ts` — single multi-row
  `insert(...).select('id, name')`; returns `[]` on empty input.
- **application** `standalone-bracket.handler.ts` — `AddBracketTeamsCommand` +
  `AddBracketTeamsHandler` (status gate, trim/dedupe/cap). Tests in
  `standalone-bracket.handler.test.ts` cover dedupe+trim, empty-batch
  `ValidationError`, post-generate `InvariantViolation`, non-owner
  `UnauthorizedError`. Both fakes in `bracket.handler.test.ts` gained the new
  method to satisfy the port.
- **web** `apps/web/src/app/brackets/actions.ts` — `addBracketTeamsFromClient`
  (typed result, no redirect, revalidates). Wired in `handlers.ts`
  (`addBracketTeams`). `bracket-action-binding.ts` exposes optional
  `bulkAddTeams` (standalone only). `walk-in-team-form.tsx` renders the tab +
  textarea (one name per line). `setup-view.tsx` modal copy mentions the option.

## Patterns observed

- The reused-view binding (`BoundBracketActions`) is the right seam for
  scope-specific capabilities: an **optional** action on the binding lets one
  component grow a standalone-only affordance without an `if (standalone)` ladder
  in the JSX or any change to event call sites — the UI just checks for the
  action's presence.

## Follow-ups

- **gen:types still pending** (Docker down) — unrelated to this bundle but the
  repo continues to read `best_of`/`target_score` via an `as unknown` cast; this
  change touches no generated types.
- The standalone setup still has no draft/edit workspace (separate deferred
  item); bulk add only applies before generate, same as single add.
