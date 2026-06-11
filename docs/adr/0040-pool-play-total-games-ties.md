# 0040. Pool play "total games" scoring: play N, both count, ties allowed

- **Status:** Accepted
- **Date:** 2026-06-10
- **Extends:** [ADR 0032](0032-bracket-workflow-redesign.md) (per-stage match
  length) and [ADR 0018](0018-pool-play-configuration.md) (pool-play config).
  0032's `bestOf` / `playoffBestOf` resolution is unchanged; this ADR adds a
  second **scoring mode** alongside it.

## Context

Bracket matches were always scored **best-of-N**: the first side to win a
majority of `bestOf` games (`floor(bestOf/2)+1`) wins, and a winner is always
produced. `bestOf` was constrained to the odd set `{1, 3, 5}`
(`ALLOWED_BEST_OF`).

That can't express one of the most common volleyball **pool-play** formats:
each matchup plays a **fixed number of games — typically two to 25 — both
counting**, with **no third game**. A 1-1 split is a legitimate, completed
result; the pool is then seeded by **games won** (then point differential), not
by match wins. The old model has no way to say this:

- `bestOf` only allows odd values, so "2 games" isn't selectable.
- Even if it were, `determineWinner` needs a 2-0 **sweep** to register a winner,
  so a 1-1 split returns `null` — the match never reaches a terminal state and
  can't finalize.
- Pool standings rank by **match wins first**, so every team that splits sits at
  zero wins and the order collapses to the tiebreakers.

## Decision

Add a pool-stage **scoring mode** to `BracketConfig`:

```ts
poolPlayMode: 'best_of' | 'total_games'; // default 'best_of'
```

- **`best_of`** — unchanged. Clinch on a majority of `bestOf` (odd) games;
  a winner is always produced.
- **`total_games`** — play **all** `bestOf` games; the side that won more games
  wins, and an **equal split is a completed tie** (`winnerEntryId = null`,
  `status = 'completed'`). `bestOf` may be **even** (`ALLOWED_TOTAL_GAMES =
[2, 4]`) and is reused as the game count.

`total_games` is a **pool-stage** mode only. Ties are resolved at the standings
level, which a knockout stage can't do — every elimination/playoff match must
resolve a winner. So:

- It's valid only for `round_robin` and `pool_play_playoff` (rejected for
  single/double elimination at create time).
- For `pool_play_playoff` it requires an explicit **odd `playoffBestOf`** — the
  even pool length can't decide a playoff match, so the playoff can't fall back
  to it.
- The aggregate resolves the per-match mode (`playModeFor`): pool matches
  (`round_robin`, or `pool !== null` in `pool_play_playoff`) use `total_games`;
  everything that advances a winner stays `best_of`.

### Winner / completion (`determineResult`)

A single `determineResult(sets, a, b, gameCount, mode)` returns
`{ winner, complete, tie }`. `determineWinner` becomes a thin `best_of` wrapper
over it, so existing callers are unchanged. `recordResult` completes a
`total_games` match once all `gameCount` games are entered — advancing and
raising `MatchResultRecorded` only when there's a real winner (a tie advances
nothing and broadcasts no winner).

### Standings (`StandingsRankBy`)

`computePoolStandings` / `rankAcrossPools` take a `rankBy`
(`'match_wins'` default | `'games_won'`). For `games_won` pools the within-pool
order is **games won → point differential**, and the cross-pool same-position
tiebreak switches from match-win rate to **games-won rate**. `best_of` pools are
byte-for-byte unchanged.

### Persistence

`BracketConfig` is stored as a **jsonb blob** merged over
`DEFAULT_BRACKET_CONFIG` on load, so `poolPlayMode` round-trips with **no
migration** and old brackets default to `'best_of'`.

## Consequences

- The complete scoring + standings path works through **manual result entry**
  (the per-match score form already renders `bestOf` inputs and routes through
  `recordResult`). Standings show games W/L and a tie count for `total_games`
  pools; a tied match renders an explicit "Tie" badge.
- **Live scoreboard deferred.** The Pro "Score live" scoreboard
  (`live-match-score.ts`) still clinches on `setsToWin` and can't yet record a
  tie, so its launcher is **suppressed for tie-eligible matches** — hosts score
  those via the manual form. Adding a `total_games` mode to the live scoreboard
  (a `matchComplete(mode)` terminal check + threading `mode` through the
  scoreboard URL/config) is the natural follow-up.
- The mode is **config/pool-stage level**, not a per-match override. A per-match
  even-`bestOf` override is intentionally not added (the config game count
  already drives every pool match); `editMatch`/`addMatch` keep their
  `ALLOWED_BEST_OF` per-match validation.

## Alternatives considered

- **Infer the mode from `bestOf` parity** (even ⇒ play-all-with-ties). Rejected:
  too implicit for an otherwise explicit domain, and it can't express a future
  "play all 3, both count" or a points-summed format. An explicit enum keeps the
  door open.
- **A separate `totalGames` field** parallel to `bestOf`. Rejected: doubles the
  resolution surface (config, playoff, per-match, finalize) for no gain —
  `bestOf` already means "number of games" and `effectiveBestOf` already
  resolves it.
- **Globally rank standings by games won.** Rejected: best-of pools are
  correctly ranked by match wins (the standard); the ranking must be
  mode-dependent, hence `rankBy`.
