# Game-aligned live score (2026-06-05)

## Context

User feedback: the in-place live score on bracket/schedule match cards felt
"cluttered" and "clunky". It collapsed a whole match into one line —
`🔴 Live  12–9  sets 1–1` — which conflates the current rally score with the
sets-won tally and hides what's actually happening per game. The request:
"align the live scorer to the game, not the match — a best-of-3 should track 3
live scores."

Key realisation: the synced `LiveMatchScore` (the value object mirrored into
`match_live_scores` and read by `LiveScoresProvider`) **already carries every
game's score** — `setHistory` for finished games plus the current rally
`scoreA/scoreB`. So "game-aligned" is a pure read-side reshape; no new sync
plumbing, no migration, no domain change.

## Decisions

- **Box-score grid over inline chips.** Render teams down the side, games
  across the top (`G1 G2 G3`), so a best-of-N reads like a real volleyball box
  score. Chosen over a one-line chip strip because the grid maps "best of 3 =
  3 scores" most literally (user picked it from three mocked layouts).
- **Display-only; the official record still saves once.** Rejected writing each
  committed game into `match.sets` live, because the canonical
  `RecordMatchResultCommand` records a _terminal_ result (winner advancement,
  header completion) — a per-game write would fire advancement mid-match. The
  user explicitly chose the display-only scope. "Save final to match" is
  unchanged.
- **Grow the grid; never render a phantom column.** Show finished games +
  the in-progress game only, capped at `bestOf`, and append the live column
  only while the match is undecided (`max(setsA,setsB) < setsToWin`). Avoids a
  ghost "G3" after someone clinches 2–0, and keeps the strip minimal early on
  (G1 → G2 → G3) rather than padding empty future games (which would re-add the
  clutter we're removing).
- **Pulsing dot on the live game's header, not a separate LIVE pill.** The old
  red "LIVE" pill plus digits plus "sets" was three competing elements; a
  single dot on the active column header carries the same signal with less ink.
- **Pure helper `liveGames()` exported from the component file** (AGENTS.md:
  colocate helpers with their primary consumer) so the projection is unit-
  testable without rendering. The test imports it directly; the transitive
  `'use client'` / provider import is import-safe (no top-level `window`).

## Changes

- `apps/web/.../events/[id]/_components/live-score.tsx` — rewrote `LiveScore`
  into a CSS-grid box score; added exported pure `liveGames(live)` projection
  and a `cellTone` emphasis helper (winner/leader bold, others muted). Kept the
  single `aria-live` announcement (grid is `aria-hidden`), now game-aware.
- `apps/web/.../events/[id]/_components/live-score.test.ts` — new: pins the
  per-game mapping and the no-phantom-column edge (decided 2–0), best-of-1, and
  fresh-match cases.

Both call sites (`match-card.tsx`, schedule `match-row.tsx`) use the default
`className`, so they needed zero edits.

## Patterns observed

- The live-score read model was richer than its render — `setHistory` was
  synced but never shown. When a "cluttered" UI complaint lands, check whether
  the synced state already holds the detail before reaching for new plumbing.

## Follow-ups

- None blocking. The grid repeats team names already shown on the bracket
  card's team rows; acceptable for a self-contained, surface-portable badge
  (also used on the schedule row). Revisit only if a card layout wants a
  names-free variant.
- Not exercised against live realtime yet — same deploy-gated e2e gap noted in
  the live-scoring initiative memory; the change is display-only over existing
  synced data, so risk is low.
