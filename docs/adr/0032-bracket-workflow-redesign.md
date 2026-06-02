# 0032. Bracket workflow redesign: draft→live lifecycle, manual override, per-stage match length

- **Status:** Accepted
- **Date:** 2026-06-02
- **Extends / supersedes:** [ADR 0018](0018-pool-play-configuration.md) (pool-play
  configuration). 0018's `BracketConfig` knobs survive; this ADR reverses 0018's
  explicit rejection of a `draft` `BracketStatus` (see "Alternatives" there) and
  generalizes the frozen-generator model into an editable one.

## Context

The bracket aggregate ([packages/domain/src/brackets/bracket.ts](../../packages/domain/src/brackets/bracket.ts))
treats a generated match graph as **frozen**:

- Pools are auto snake-distributed into **even** sizes only; the host can't make a
  3-team and a 4-team pool.
- `fixed_games` mode **forbids repeat opponents** (`gamesPerTeam < poolSize`), so a
  small pool can never reach the same games-per-team as a larger one.
- `bestOf` is a single value for the whole bracket — pool play can't be best-of-1 while
  the playoff is best-of-3, and there's no notion of the score a game is played to (21
  vs 25 vs 15).
- The playoff is auto-built from standings with **no manual control** and only
  position-based ordering (all pool winners, then all runners-up), not proper
  cross-bracket seeding.
- Editing is locked: reseed/reorder is allowed only **before any match starts**, teams
  can't be swapped after generation, and a result can only be entered as set scores.

Real tournaments don't run this way. Two scenarios drive the redesign:

1. **Serious tournament** — pool round-robin determines seeding into a properly
   cross-seeded playoff bracket.
2. **Rec / play-time tournament** — uneven pools where everyone gets _roughly equal_
   play, **even if that means playing the same team twice**, with flexible best-of and
   point totals.

Across both, the host must be able to **manually override anything** — seeding,
team↔pool assignment, the pool schedule, individual match data, the playoff bracket —
because the generated draft is a starting point, not a contract.

The persistence layer already supports arbitrary edits cheaply: `save_bracket`
([20260813000100_save_bracket_rpc.sql](../../supabase/migrations/20260813000100_save_bracket_rpc.sql))
does an **atomic full-replace** of the whole bracket (header + seeds + matches + sets).
So the redesign lives in the **aggregate's invariants** and the **UI**, not in storage.

## Decision

### 1. Lifecycle gains a `draft` stage (hybrid model)

`BracketStatus` becomes `setup → draft → active → completed`.

- **setup** — configuring; seeds exist, no matches (unchanged).
- **draft** _(new)_ — `generate()` lands here, not `active`. The full match graph
  (pools, schedule, playoff shell) exists and is **fully editable**: move teams between
  pools, add / edit / remove / reorder matches, change matchups, edit per-match length,
  re-seed or hand-build the playoff.
- **active** ("Live" in the UI) — `publish()` transitions `draft → active`. Scoring is
  on. **Targeted** edits are still allowed: replace a dropped team everywhere, fix a
  matchup, set a manual winner, edit scores, add a game.
- **completed** — locked, but `reopen()` returns it to `active` to fix a mistake.

`reset()` (active/draft → setup) and the auto `generatePlayoff()` path are retained.

ADR 0018 rejected a `draft` status as overkill for a reorder-only UI. With full
draft-stage editing (not just reorder) the explicit stage now earns its place: the
"is this editable structure or live scoring?" question is asked in dozens of places and
a status is clearer than `status === 'setup' && matches.length > 0`.

### 2. Per-stage match length + per-match override; a target-score field

`BracketConfig` gains (all additive, stored in the existing `config` jsonb — no
migration for these):

```ts
interface BracketConfig {
  bestOf: number; // existing; pool-stage / global default
  targetScore: number | null; // NEW: points a game is played to (e.g. 25); informational
  // pool_play_playoff playoff-stage overrides (fall back to bestOf/targetScore):
  playoffBestOf: number | null;
  playoffTargetScore: number | null;
  // …all existing 0018 fields unchanged…
}
```

`Match` gains two nullable per-match overrides: `bestOf` and `targetScore`. The
**effective** values resolve `match.* ?? stageDefault ?? config.*`. `determineWinner`
is already passed an explicit `bestOf`, so the aggregate resolves and passes the
effective value; `targetScore` is **informational** (shown + stored, not enforced) —
volleyball scoring stays free-form as today.

These two per-match fields are the only ones that don't fit the jsonb config, so they
become nullable columns on `bracket_matches` (migration below).

### 3. Manual override: the aggregate exposes a host-owned graph

The generator produces a draft; the host owns the graph. New aggregate mutators, each
status-gated (broad in `draft`, targeted in `active`):

- `setPools(assignments)` — manual / uneven pool assignment (setup/draft).
- `editMatch(id, patch)` — teams A/B/work, court, slot, scheduledAt, bestOf,
  targetScore; in `active` also a manual winner / sets.
- `addMatch(...)` / `removeMatch(id)` — draft (and add-a-game while active).
- `reorderMatches(scope, order)` — generalizes `reorderPoolMatches`; free in draft, keeps
  the "not started" guard while active.
- `replaceEntry(oldId, newId)` — swap a team everywhere (drops / subs while live).
- `seedPlayoff(orderedEntryIds)` — hand-seed or re-seed the playoff.
- `publish()` / `reopen()` — the lifecycle transitions above.

### 4. Uneven pools + target-games-with-repeats

- `generateRoundRobin` allows `maxRounds > n − 1` by **continuing the circle rotation**,
  which wraps and repeats matchups — so a pool can reach a games-per-team **target**
  above a full round-robin.
- Pool-play generation reads a **target games per team** (rec mode); each pool is filled
  to that target regardless of pool size, so a 3-team and a 4-team pool both reach, e.g.,
  3 games each. Uneven pools come from host `setPools` assignments; the generator builds
  a round-robin (or target-games schedule) per pool of any size ≥ 2.

### 5. Auto cross-seed playoff (+ manual edit)

A new `rankAcrossPools(standingsByPool)` produces an overall 1..N order by record across
pools; it feeds the existing `generateSingleElimination` (which already does canonical
1-vs-N cross-bracket slot placement). The host can then `seedPlayoff(...)` or `editMatch`
to adjust.

### Migration

`supabase/migrations/<ts>_bracket_manual_edit.sql`:

1. Swap the `event_brackets` status CHECK to include `'draft'` (drop
   `tournament_brackets_status_check` / `event_brackets_status_check` if-exists, re-add as
   `event_brackets_status_check`).
2. Add nullable `bracket_matches.best_of` and `bracket_matches.target_score`.
3. Update `save_bracket` to read/write the two new columns.

Then `pnpm db:migrate` + `pnpm --filter @pickupvb/supabase gen:types`.

## Consequences

**Easier:**

- Hosts run their real tournament without a spreadsheet: uneven pools, equal play via
  repeats, per-stage match length, and full manual correction of anything the generator
  got "wrong."
- Storage is unchanged in shape (full-replace already in place); per-match length is two
  nullable columns + a config-jsonb addition.
- Backward compatible: existing `active` brackets render and score unchanged; `draft`
  only appears for newly generated brackets; null per-match overrides fall back to config
  defaults.

**Harder:**

- The aggregate's invariant surface grows from "frozen after generate" to "status-gated
  mutators." Each mutator must be explicit about what's legal in `draft` vs `active` so a
  live bracket can't be silently restructured mid-event.
- The UI gains a whole draft-editing surface. Mitigated by phasing (domain first, then
  setup UI, then the draft workspace, then live-board edits) and by reusing the existing
  `FormModal` / shared button + field vocabularies / `TreeBracket` / `seeding-list`.
- `replaceEntry` and manual-winner edits while live can desync forward advancement;
  `editMatch`/result paths reuse the existing `unwireAdvancement`/`applyAdvancement`
  cascade so downstream matches stay consistent.

## Alternatives considered

- **Always-editable, no draft stage** (every element inline-editable at all times).
  Rejected — without a publish boundary it's too easy to restructure a live bracket by
  accident, and spectators would see a half-built bracket. The hybrid keeps a clear "this
  is live now" line while still allowing targeted live edits.
- **Draft → publish → fully locked** (structural edits require a reset while live).
  Rejected — teams drop and matchups need fixing mid-event; forcing a full reset to swap
  one team is the status quo's pain point.
- **Manual-only schedule** (no generator). Rejected — the generator gets a host 90% of
  the way; the manual editor handles the rest. We keep both.
- **Enforce target score in `determineWinner`.** Rejected for v1 — volleyball scoring
  (win-by-2, cap variations) is messy; target score stays informational and the existing
  free-form set entry is unchanged.
