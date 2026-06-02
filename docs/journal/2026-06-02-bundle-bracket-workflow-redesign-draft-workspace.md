# Bracket workflow redesign — draft workspace (2026-06-02)

## Context

Phase 4 of the bracket redesign ([ADR 0032](../adr/0032-bracket-workflow-redesign.md)),
after [domain](2026-06-02-bundle-bracket-workflow-redesign-domain.md),
[commands](2026-06-02-bundle-bracket-workflow-redesign-commands.md), and
[create-ui](2026-06-02-bundle-bracket-workflow-redesign-create-ui.md). This is the
**centerpiece**: the surface where "manually change anything" becomes real. Until
now `generate()` auto-published straight to live (a bridge), so the Phase 2
manual-edit handlers were unreachable. This bundle removes that bridge — `generate()`
now lands in `draft` — and adds the draft-editing workspace + the server actions
that drive the Phase 2 handlers.

## Decisions

- **`generate()` lands in `draft`; the host publishes explicitly.** Removed the
  event auto-publish bridge in `GenerateBracketHandler`. The standalone bridge stays
  (standalone brackets have no draft UI yet — deferred), so only event brackets enter
  the draft stage.
- **Flash-param redirect actions, not typed results.** The draft workspace is a
  client component but uses plain `<form action>` submits to redirect-based actions
  (mirrors generate/seed/reset). The server-action `redirect()` re-renders the page,
  which closes any open `FormModal` for free — no client result-state plumbing.
- **Pool reassignment is bulk + rebuild.** "Edit pools" opens one modal with a pool
  `<select>` per team; saving runs `setBracketPools` (labels) **then**
  `generateBracket` (re-derives the schedule from the new composition) in a single
  action — one rebuild, not one-per-move. Honestly framed as discarding manual
  schedule edits, since changing composition changes the schedule. Offers the
  existing pools plus one fresh label so a host can split into uneven pools.
- **Add/remove gated to "free" formats.** `MatchEditor`'s Remove and the "Add match"
  button render only for `pool_play_playoff` and `round_robin` (free schedules);
  single/double elim are wired and must not lose matches — those keep edit-only
  (teams / court / length).
- **One `MatchEditor` for every match.** Shared modal — team A/B selects (with TBD),
  court, per-match best-of (with a "Default (best of N)" option), and play-to. Built
  to be reused by the Phase 5 live board.

## Changes

- **events/[id]/bracket/actions.ts** — new actions: `publishBracket`,
  `editBracketMatchFromForm`, `addBracketMatchFromForm`, `removeBracketMatch`,
  `setBracketPoolsFromForm` (bulk setPools + regenerate). Imported the matching
  Phase 2 commands.
- **\_components/match-editor.tsx** _(new)_ — the shared per-match edit modal.
- **\_components/draft-workspace.tsx** _(new)_ — Publish/Regenerate/Discard card +
  readiness; pool-play view (PoolsEditor, per-pool match list with reorder + Add
  match + Edit) and a rounds view for elim/round-robin.
- **\_components/labels.ts** — notices: `published` / `match_updated` / `match_added`
  / `match_removed` / `pools_updated`.
- **\_components/bracket-workspace.tsx** — render `DraftWorkspace` for `status==='draft'`
  (host); `BracketVm` gains `targetScore` + `seeds[].pool`.
- **page.tsx** — `bracketVm` now carries `targetScore` and seed `pool`.
- **application/commands/bracket.handler.ts** — dropped the event `publish()` bridge
  from `GenerateBracketHandler`.

## Patterns observed

- **Removing an unused prop is two edits.** Dropping `editableSchedule` from the
  `RoundsView` call site without also removing it from the props type fails typecheck
  (`TS2741` required-prop-missing). Update both in the same pass.
- **`React.ReactNode` needs an import under the modern JSX transform.** A `'use client'`
  file with no `React` import must use `import { type ReactNode } from 'react'`, not
  `React.ReactNode`.

## Follow-ups

- **Phase 5 — live-board inline edits.** Reuse `MatchEditor` on the active board
  (replace a dropped team via `replaceEntry`, fix a matchup, manual winner, add a
  game), wire `reopenBracket` for completed brackets, and a `seedPlayoff` control once
  pool play generates the playoff. Actions for reopen/replaceEntry/seedPlayoff aren't
  written yet (handlers exist from Phase 2).
- **Visual / e2e pass** — this bundle is verified by typecheck/lint/test/build only;
  the draft workspace hasn't been exercised in a running app. Phase 6 e2e:
  create → generate (draft) → edit → publish → score → complete.
- **Spectator `/watch` parity** for the `draft` status (Phase 6).
- Standalone draft UI; gen:types (local DB) — still deferred.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(15/15 tasks; domain 479, application 106, infra 48, web 214; lint 0 errors). E2E
not run.
