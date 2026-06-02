# Bracket workflow redesign — live-board edits (2026-06-02)

## Context

Phase 5 of the bracket redesign ([ADR 0032](../adr/0032-bracket-workflow-redesign.md)),
after the [draft workspace](2026-06-02-bundle-bracket-workflow-redesign-draft-workspace.md).
Draft editing covered everything _before_ a bracket goes live; this bundle brings
the "manually change anything" affordances onto the **live (`active`) board** and
adds a path to fix a **completed** bracket — closing the loop on the user's
"update anything they don't agree with" requirement during and after play.

## Decisions

- **Per-match edit on the live board reuses the Phase 4 `MatchEditor`.** For the
  host, on an `active` event bracket, each match card gets an "Edit" affordance to
  fix the matchup, court, or match length. `allowRemove={false}` here — removing a
  game is a draft activity; the domain also rejects removing a scored match while
  live. Editing a scored match's teams clears that result and unwires advancement
  (domain `editMatch`), which is the intended "this matchup was wrong" correction.
- **Completed → editable is gated behind Reopen.** `editMatch` throws on a
  `completed` bracket, so the per-match editor only shows while `active`; a completed
  bracket shows a single **Re-open to edit** button (`reopenBracket`) instead. This
  keeps "the bracket is final" meaningful while still allowing a fix.
- **`replaceEntry` is the one-shot substitute** for a dropped team that appears in
  many matches (pool play) — a per-match swap would be tedious. A "Substitute a team"
  modal (replace X with Y, both registered) drives it; results carry over to the
  substitute (domain replaces the winner reference too).
- **Live host edits are event-scope only.** `LiveHostTools` and the per-match editor
  gate on `scope.kind === 'event'`; standalone brackets (no event handlers) and the
  spectator/watch board are untouched. New BoardView props (`teams`, `targetScore`)
  are optional so those callers compile unchanged.
- **Surface per-match length only when overridden.** `MatchCard` shows a "Best of N ·
  to M" line only when the match carries a `bestOf`/`targetScore` override, so the
  common (default) case stays quiet.

## Changes

- **events/[id]/bracket/actions.ts** — `reopenBracket`, `replaceEntryFromForm`
  (+ command imports).
- **\_components/labels.ts** — `reopened` / `entry_replaced` notices.
- **\_components/board-view.tsx** — `teams` + `targetScore` props; a `hostEdit(m)`
  helper rendering `MatchEditor` under each card (active + host + event); a
  `LiveHostTools` strip (Substitute while active, Re-open while completed) with
  `SubstituteTeamButton`; threaded `hostEdit` + `targetScore` through `PoolsView`.
- **\_components/match-card.tsx** — optional `targetScore`; per-match override line.
- **\_components/bracket-workspace.tsx** — pass `teams={registeredTeams}` +
  `targetScore` to `BoardView`.

## Patterns observed

- **A shared board component fans out to three scopes.** `BoardView` renders for the
  event workspace, the standalone bracket page, and the spectator `/watch` page. New
  host-edit props/affordances had to be additive + scope-gated (`scope.kind === 'event'`,
  optional props) so the other two callers — which this bundle doesn't touch — keep
  compiling and rendering read-only.

## Follow-ups

- **Visual / e2e** still pending for the whole redesign (Phases 4–5 are verified by
  the static quad only). Phase 6 e2e: create → draft edit → publish → score → live
  edit (substitute / fix matchup) → complete → reopen → fix.
- **Spectator `/watch` parity** for the `draft` status (a draft bracket isn't live;
  the watch view should say "not published yet" rather than render an empty board).
- **`seedPlayoff` full re-seed UI** — for now a host adjusts the auto cross-seeded
  playoff per-match via the live editor; a dedicated "re-seed the whole playoff"
  control (the Phase 2 `seedBracketPlayoff` handler) is unbuilt.
- **Add-a-game on the live board** — deferred; adding games is a draft activity today.
- gen:types (local DB); standalone draft/edit variants — still deferred.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(15/15 tasks; domain 479, application 106, infra 48, web 214; lint 0 errors). E2E
not run.
