# Pool-play setup: per-pool courts, better defaults, per-game scores (2026-06-05)

## Context

Host feedback on the bracket-setup **Pools** step (shipped the same day in the
stepper-flow bundle, `a2fa6dfc`):

1. The courts control felt wrong — a free-text **comma list** (`court_labels`)
   plus an opt-in "different courts per pool" checkbox with yet more comma
   lists. Hosts think in "assign a court (or two) to a pool," not in parsing a
   string.
2. Pools defaulted to **2**; the common rec case is a **single pool** that just
   seeds a playoff.
3. The playoff defaulted to advancing **2 per pool**; hosts usually want
   **everyone** in the playoff.
4. There was a single "Play to" per stage, but a best-of-3 is really
   **25 / 25 / 15** — the deciding game is shorter. Hosts want to configure each
   game.

Decisions confirmed with the user up front: **per-game score boxes** (one box
per game, not a "regular + decider" pair), applied to **both** pool play and
the playoff, and **per-pool court lists**.

## Decisions

- **Per-game targets are additive, informational config — no scoring change.**
  `BracketConfig.targetScore` was already informational (stored + shown, never
  enforced by `determineWinner`), so per-game targets are too. Added
  `targetScores` / `playoffTargetScores` (`ReadonlyArray<number> | null`)
  alongside the existing single fields rather than replacing them: the config is
  a **jsonb blob** merged over `DEFAULT_BRACKET_CONFIG`, so the new keys need no
  migration and old rows keep working. The form writes **both** — the array and
  the single value (= game 1) — so the ~6 single-value display sites
  (draft-workspace pill, board summary, watch headers, MatchEditor default)
  render unchanged.
- **One new resolver, `effectiveSetTargetScore(match, setNumber, defaults)`**,
  mirrors `effectiveTargetScore` but answers per-game: per-match override →
  playoff array (for `final` matches) → pool array → single-value fallback, with
  a clamp so a game past the array's end reuses the last entry. The score-entry
  form labels each "Set N" input with its target via this resolver
  ([match-card.tsx](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx)).
- **"All teams advance" resolves to a number at submit, not a domain sentinel.**
  `advancePerPool` drives playoff feasibility math (`minTeams = pools ×
advancePerPool`) and `rankAcrossPools`, so a sentinel would ripple through the
  generator and its validation. Instead the form's advance `<select>` is
  unnamed; an "All teams" option resolves to a concrete count (single pool →
  team count, floored at 2; N pools → `floor(teams / pools)`, the snake-safe
  floor) submitted via a hidden `advance_per_pool`. Standalone create (no teams
  yet) can't offer "All" and keeps a numeric default. Trade-off: "All" is fixed
  at create time — adding walk-ins to a single pool past that count later leaves
  the extras out; the host can adjust. Accepted (single-pool default is the 95%
  case and resolves to the exact team count).
- **Courts are now one chip list per pool, keyed A/B/… to match the generator.**
  Dropped `court_labels` + the per-pool comma inputs + the checkbox. Each court
  is its own `pool_courts_<LABEL>` input (add/remove rows); the action collects
  `getAll`-style by iterating `formData.entries()`. Single-pool courts live under
  `courtsByPool['A']` — for one pool, `courtLabels` and `courtsByPool['A']` were
  always equivalent (courtLabels applies to every pool), so the bracket-wide
  field is simply no longer written from the form.
- **Per-game default = `[25, …, 25, 15]` for best-of > 1, for both stages.** The
  user called 25/25/15 the usual pattern; one `defaultGameTargets(bestOf)` helper
  serves both stages. Changing best-of resets the per-game boxes to the new
  length's default (the old values no longer line up).

## Changes

- **Domain** —
  [bracket.ts](../../packages/domain/src/brackets/bracket.ts): two new config
  fields + `DEFAULT_BRACKET_CONFIG` entries + array validation (non-empty,
  positive integers).
  [match.ts](../../packages/domain/src/brackets/match.ts): `effectiveSetTargetScore`
  - `MatchTargetDefaults` gains the optional arrays.
- **Form** —
  [format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx):
  pools default 1; "All teams" advance default; `PerGameTargets` sub-component
  for both stages; per-pool court chip lists; review recap updated.
- **Actions** — `parseGameTargets` helper + per-pool court collection in both
  [event](../../apps/web/src/app/events/[id]/bracket/actions.ts) and
  [standalone](../../apps/web/src/app/brackets/actions.ts) parsers.
- **Display threading** — `targetScores` / `playoffTargetScores` threaded through
  [board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx),
  [bracket-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx),
  and the bracket / watch pages, mirroring the existing `playoffTargetScore`
  threading.
- **Tests** —
  [match.test.ts](../../packages/domain/src/brackets/match.test.ts) covers the
  resolver (per-set lookup, clamp, playoff-vs-pool, per-match override, single
  fallback); [bracket.test.ts](../../packages/domain/src/brackets/bracket.test.ts)
  covers array validation.

## Patterns observed

- **A jsonb config column makes additive domain fields a one-merge change** —
  no migration, and the `{ ...DEFAULT, ...row }` hydrate keeps old rows valid.
  Keeping the legacy single field next to the new array avoided touching every
  read site; only the surfaces that _want_ per-game granularity opted in.
- `exactOptionalPropertyTypes` flags `arr[0]` (`number | undefined`) against a
  `number | null` field — assert `arr[0]!` after a `.length > 0` guard.

## Follow-ups

- Draft-workspace and the board's "differs from default" pill still show the
  single representative target (game 1), not the per-game list. Acceptable — the
  per-game detail surfaces where it matters (the score-entry set labels + setup
  review). Revisit if a host asks to see 25/25/15 on the draft recap.
- Pool play defaults its decider to 15 like the playoff. If hosts expect pool
  play to be uniform 25, flip `defaultGameTargets` to take a stage flag.
- Not exercised against a live bracket yet (deploy-gated e2e, per the
  bracket-workflow-redesign memo). The change is config + informational display
  over existing scoring, so risk is low.
