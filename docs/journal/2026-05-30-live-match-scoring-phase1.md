# Live match scoring — Phase 1: promote scoring rules to the domain (2026-05-30)

## Context

User request: let hosts score a scheduled bracket/league match **on the
scoreboard**, with the in-progress score reflected live on the public
bracket/standings and the result auto-saved — keeping the existing manual entry.
Scoped and recorded as [ADR 0023](../adr/0023-live-match-scoring.md) (Pro-gated
at the host level; live-linked; watch deferred).

This bundle is **Phase 1 of 6** from that ADR — the self-contained,
behavior-preserving slice that unblocks the rest: move the scoreboard's scoring
rules out of the web layer and into `@pickupvb/domain` so they can be shared by
the free tool, the future Pro live surface, and the persisted `match_live_scores`
state. The web file [\_lib/types.ts](../../apps/web/src/app/tools/scoreboard/_lib/types.ts)
had carried a standing TODO ("If/when we add Pro persistence … promote these into
packages/domain") since the tool shipped — this is that promotion.

## Decisions

- **Chose a plain value object (interface + free functions) over a class** because
  the same shape is JSON-round-tripped across the realtime broadcast channel,
  `localStorage`, and (Phase 3) a `jsonb` column. A class with methods would lose
  behavior on rehydration. Matches the existing `match.ts` / `determineWinner`
  style in `brackets`.
- **Named the side type `MatchSide` (`'A' | 'B'`), not `TeamId`** — the domain
  already exports a branded `TeamId` (`event_team_entries.id`) from
  `events/volleyball-event.ts`, and the barrel uses `export *`, so reusing the
  name would collide at the build boundary. `MatchSide` is the scoreboard
  column, not a team identity.
- **Mutators take `now: number = Date.now()`** so the rules are pure/testable
  while call sites stay unchanged (default evaluated at call time, never in a
  React render body — AGENTS.md pitfall #4). Tests pin `now` for deterministic
  `version`/`updatedAt` assertions.
- **Kept the web `_lib/types.ts` as a thin alias re-export** (`LiveMatchScore as
ScoreboardState`, `MatchSide as TeamId`, `createLiveMatchScore as initialState`,
  …) so the setup form, full-screen view, mobile remote, sync hook, and storage
  layer needed **zero call-site edits**. Behavior of the free tool is unchanged.
- **`version`/`updatedAt` stay on the value object**, documented as the
  last-write-wins optimistic-concurrency token (they're not impure — the
  timestamp is injected). This keeps the VO ready to back the Phase 3 persisted
  live row without reshaping.

## Changes

- `packages/domain/src/scoring/live-match-score.ts` — new `LiveMatchScore` /
  `LiveMatchConfig` / `MatchSide` value object + pure rules (`createLiveMatchScore`,
  `setsToWin`, `matchWinner`, `isSetWon`, `increment`, `commitSet`, `resetMatch`,
  `swapSides`).
- `packages/domain/src/scoring/index.ts` — module barrel.
- `packages/domain/src/scoring/live-match-score.test.ts` — 14 Vitest cases
  (target/win-by/deuce, sets-to-win, set commit, match winner incl. best-of-1,
  reset version bump, swap mirroring, immutability).
- `packages/domain/src/index.ts` — export the new `scoring` module.
- `apps/web/src/app/tools/scoreboard/_lib/types.ts` — rewritten as a thin alias
  layer over the domain VO (was ~118 LOC of types + logic; now re-exports).
- `docs/adr/0023-live-match-scoring.md`, `docs/adr/README.md` — ADR + index
  (index also backfilled the previously-missing 0020–0022 rows).

## Patterns observed

- **`export *` domain barrel = a flat namespace.** Any new public name must be
  checked against existing exports before adding (grep-first). `TeamId` was the
  trap here. Worth remembering for future domain modules.
- **The domain package is consumed from `./src` directly** (its `package.json`
  `exports`/`main`/`types` point at source, not `dist`), so new exports are
  visible to `typecheck` immediately — no rebuild-before-typecheck hazard.

## Follow-ups

- **Phases 2–6** of [ADR 0023](../adr/0023-live-match-scoring.md): `match_live_scores`
  table + RLS-gated upsert RPC (P2); application `UpdateLiveMatchScore` handler +
  finalize mapping (P3); the auth'd scorer route + Pro-gated "Score live" buttons
  (P4); the in-place public live view (P5); Pro-upgrade polish + e2e (P6).
- **Open question (gates Phase 3):** the league single-number `home/away` mapping
  — sets-won vs set points. Noted in the ADR.
- **Pre-existing, not touched:** `react-hooks/set-state-in-effect` warnings in the
  scoreboard theme-load effects (`scoreboard-view.tsx`, `remote-control.tsx`) —
  out of scope for this behavior-preserving bundle (AGENTS.md pattern #5).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(lint: 0 errors / 3 pre-existing warnings; test: +14 new cases, 364 domain pass).
