# Bracket workflow redesign — spectator parity + e2e (2026-06-02)

## Context

Phase 6 (final) of the bracket redesign ([ADR 0032](../adr/0032-bracket-workflow-redesign.md)),
after the [live-board](2026-06-02-bundle-bracket-workflow-redesign-live-board.md) bundle.
Two loose ends from introducing the `draft` stage: the public spectator `/watch`
view didn't account for `draft`, and the e2e suite's bracket flow assumed
generate → live (it now goes generate → draft → publish).

## Decisions

- **Spectators never see a half-built draft.** `/watch` now treats `draft` like
  `setup`/no-bracket: a "the host is finalizing the bracket; it'll appear once they
  publish" card, no scoring board. The "● LIVE" badge is gated to `active`;
  `completed` shows a neutral "Final" badge; `setup`/`draft` show none. The realtime
  refresher already watches `event_brackets` by division, so the spectator's page
  refreshes itself the moment the host publishes (status flips) — no extra wiring.
- **The e2e draft→publish seam lives in the shared helper, not every spec.** Split
  `createAndGenerateBracket` into `createBracketToDraft` (create + seed + generate,
  stops on the Publish CTA) + a thin `createAndGenerateBracket` that publishes and
  waits for the live board. The four existing scoring specs call the latter unchanged;
  the new draft-stage spec calls the former. One seam, four specs stay valid.
- **Standalone e2e untouched.** The standalone generate handler still auto-publishes
  (no standalone draft UI), so `seedAndGenerateStandaloneBracket` correctly still
  expects the live board — left as-is.

## Changes

- **bracket/watch/page.tsx** — `draft` (and `setup`/no-bracket) render the "not
  published yet" card; status-aware LIVE/Final badge; pass `targetScore` to the watch
  `BoardView` for per-match override display parity.
- **tests/e2e/\_helpers/tournament.ts** — new `createBracketToDraft`;
  `createAndGenerateBracket` now publishes after it.
- **tests/e2e/bracket.authed.spec.ts** — new test: generate lands in an editable
  draft (Publish CTA, no "Enter result"), `/watch` shows "finalizing" + no board,
  then Publish makes scoring live.
- **docs/audits/tournament-tools-workflow.md** — remediation-log cross-reference to
  ADR 0032 (the bracket surface is in that audit's scope); README index date bumped.

## Patterns observed

- **A lifecycle-state addition ripples to every status-switch.** Adding `draft`
  touched the host workspace (Phase 4), the live board gate (Phase 5), **and** the
  spectator view + the e2e flow helper. When adding a status, grep every
  `status === '…'` / status-keyed branch (workspace render, watch render, badge, e2e
  helpers) — missing one leaves a blank or stale surface.

## Follow-ups (deploy-gated / deferred)

- **Run the e2e green against dev.** Per AGENTS.md, the suite hits the **deployed**
  target, so the updated + new bracket specs can only be run green once this redesign
  deploys to dev (Node 22; `TEST_*` + `E2E_CLEANUP_SUPABASE_*` exported). They are
  authored to the new flow but **have not been run** — run them before treating the
  redesign as battle-tested.
- **gen:types** once the local DB is up (repo still reads `best_of`/`target_score`
  via an `as unknown` cast).
- **Standalone (ADR 0025) draft/edit UI** — standalone generate still auto-publishes;
  a standalone draft workspace + edit handlers are unbuilt.
- **`seedPlayoff` full re-seed UI** and **add-a-game on the live board** — deferred
  niceties (handlers / domain support exist).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(15/15 tasks; domain 479, application 106, infra 48, web 214; lint 0 errors, e2e
specs lint-clean). **E2E not executed** (deploy-gated, see follow-ups).
