# Pool play "total games" scoring — play N, both count, ties allowed (2026-06-10)

## Context

A user pointed out that **pool play can have a team play a fixed 2 games, not
just a best-of 1/3/5** — the classic volleyball pool format of "two games to 25,
both count, no third game," where a **1-1 split is a legitimate result** and the
pool is seeded by games won. The bracket model couldn't express it:

- `ALLOWED_BEST_OF = [1, 3, 5]` (odd only) — "2 games" wasn't selectable.
- `determineWinner` clinches on a majority, so a 1-1 split returned `null` —
  the match never reached a terminal state and couldn't finalize.
- Pool standings ranked by **match wins first**, so every split sat at zero
  wins.

See [ADR 0040](../adr/0040-pool-play-total-games-ties.md). Two design questions
were settled with the user up front: (1) the ask is the **match-length** axis (a
2-game match where both count and a split is a tie), _not_ the existing
`poolSchedule: 'fixed_games'` opponent-count knob; (2) standings rank **by games
won, then point differential**.

## Decisions

- **A pool-stage scoring mode, not a parity hack.** Added
  `BracketConfig.poolPlayMode: 'best_of' | 'total_games'` (default `best_of`).
  `total_games` reuses `bestOf` as the **game count** and permits even values
  (`ALLOWED_TOTAL_GAMES = [2, 4]`). Inferring the mode from `bestOf` parity was
  rejected as too implicit for this otherwise-explicit domain; a parallel
  `totalGames` field was rejected as doubling the resolution surface for no gain
  (ADR 0040 "Alternatives").
- **One `determineResult`, `determineWinner` as a wrapper.** `determineResult`
  returns `{ winner, complete, tie }`; `best_of` clinches early, `total_games`
  is terminal once all `gameCount` games are present (more wins ⇒ winner, equal
  ⇒ completed tie). The old `determineWinner` is now a thin `best_of` wrapper, so
  every existing caller is untouched.
- **Ties complete but never advance.** `recordResult` sets a tied match to
  `completed` with `winnerEntryId = null`, and **only** advances / raises
  `MatchResultRecorded` when there's a real winner. Safe because the per-match
  mode resolver (`playModeFor`) hands `total_games` **only to pool-stage matches**
  (a round-robin's matches, or `pool !== null` in `pool_play_playoff`) — nothing
  that feeds a downstream slot can tie. Single-elim finals also carry
  `bracketSide: null` + `advancesToMatchId: null`, so a pure "doesn't advance"
  check is unsafe — `total_games` is **format-gated** (round_robin /
  pool_play_playoff only) at create time.
- **Standings rank mode is a parameter, not global.** `computePoolStandings` /
  `rankAcrossPools` take `rankBy` (`'match_wins'` default | `'games_won'`).
  `games_won` orders by games won → point diff and switches the cross-pool
  same-position tiebreak to games-won rate. Best-of pools are byte-identical.
- **No migration.** `BracketConfig` persists as a jsonb blob merged over
  `DEFAULT_BRACKET_CONFIG`, so `poolPlayMode` round-trips for free and old
  brackets default to `best_of`.
- **For `pool_play_playoff` + `total_games`, the playoff best-of is required and
  must be odd.** The even pool length can't decide a playoff match, so it can't
  fall back to it — the create validator enforces a non-null `playoffBestOf`, and
  the format picker hides "Same as pool play" and defaults the playoff to
  best-of-3.

## Surface

- **Domain:** `match.ts` (`MatchPlayMode`, `MatchResult`, `determineResult`),
  `bracket.ts` (`poolPlayMode` config + `ALLOWED_TOTAL_GAMES` + create
  validation + `playModeFor` + `recordResult` tie path + `standingsRankBy`),
  `standings.ts` (`StandingsRankBy`). +18 unit tests (match tie/completion,
  games-won ranking, `recordResult` tie completes a round-robin).
- **Web:** format picker (`format-picker-form.tsx`) gains a "Best of N · Play 2 ·
  both count" toggle for pool-bearing formats; both create parsers
  (`bracket/actions.ts`, `brackets/actions.ts`) read `pool_play_mode`. `board-view`
  ranks standings by games won, renders a **games W/L/Tie** table and an explicit
  "Tie" badge on a 1-1 match, and **suppresses the live launcher** for
  tie-eligible matches. `poolPlayMode` threaded through every `BoardView` /
  `DraftWorkspace` call site (event + standalone, live + watch).

## Follow-ups

- **Live scoreboard `total_games` support (deferred).** The Pro "Score live"
  scoreboard still clinches on `setsToWin` and can't record a tie, so its
  launcher is hidden for tie-eligible matches — hosts score those via the manual
  result form (which works end-to-end). Adding `total_games` to the scoreboard
  needs a `matchComplete(mode)` terminal check in `live-match-score.ts` plus
  threading `mode` through the scoreboard URL/config; the finalize mapper
  (`liveMatchScoreToMatchSets`) is already mode-agnostic.
- **Per-match even-`bestOf` override.** Intentionally not added — the config game
  count drives every pool match; `editMatch`/`addMatch` keep `ALLOWED_BEST_OF`
  per-match validation.
- **Not yet exercised against a live DB** (deploy-gated, like the rest of the
  bracket-workflow work): static quad is green, but a real create→score→seed
  pass on a `total_games` pool hasn't run.
