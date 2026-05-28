# 0018. Pool play configuration: bestOf, schedule mode, work team, courts

- **Status:** Proposed
- **Date:** 2026-05-27

## Context

The `pool_play_playoff` bracket format currently exposes only two
host-facing knobs: number of pools and teams advancing per pool
(see [packages/domain/src/brackets/bracket.ts](../../packages/domain/src/brackets/bracket.ts)
`BracketConfig`). In practice, hosts running a same-day pool-play
tournament need more control:

1. **Match length.** Pool matches are often best-of-1 (single game
   to 25) to fit a full field into a half day. The aggregate already
   tracks `bestOf` per bracket and `determineWinner` honors it, but
   no UI exposes it for pool play. Hosts can only get best-of-3.
2. **Schedule density.** Full round-robin within a pool grows
   quadratically: a 6-team pool is 15 matches. Most hosts want
   "everyone plays exactly N games" where N < (pool − 1), trading
   completeness for time.
3. **Work / ref team per match.** Local-league convention is that
   the idle team in a pool refs the current match. Without a slot
   for `workTeamId` on a match, hosts manage this on paper.
4. **No team in two places at once.** When matches run in parallel
   across multiple courts, the bracket has no concept of "court" or
   "time slot," so the generator can produce schedules that ask a
   team to play and ref simultaneously on different courts.

This ADR records the design for adding all four. Phase 1 of the
rollout (this commit's scope) covers (1) and (2). (3) and (4) are
recorded here so the data shape lands consistent and follow-up
phases don't need a second ADR.

## Decision

### 1. `BracketConfig` gains two additive fields

```ts
interface BracketConfig {
  bestOf: number; // existing; validated ∈ {1, 3, 5}
  byeStrategy: ByeStrategy; // existing
  poolCount: number; // existing
  advancePerPool: number; // existing
  // Phase 1 additions:
  poolSchedule: 'round_robin' | 'fixed_games';
  poolGamesPerTeam: number | null; // required iff poolSchedule === 'fixed_games'
  // Phase 2 addition:
  requireWorkTeam: boolean;
  // Phase 3 addition:
  courtLabels: ReadonlyArray<string>; // free-text labels; [] = unset
}
```

Defaults preserve existing behavior: `poolSchedule = 'round_robin'`,
`poolGamesPerTeam = null`, `requireWorkTeam = false`,
`courtLabels = []`. Stored as JSON on the bracket row, so no
migration is required for the config fields themselves.

`bestOf` validation tightens from "positive odd" to the explicit
set `{1, 3, 5}`. The aggregate already rejects even values; the
new check rejects 7+ to keep the picker honest.

### 2. Schedule modes — `round_robin` vs. `fixed_games`

- **`round_robin`** keeps the current behavior:
  [`generateRoundRobin`](../../packages/domain/src/brackets/generators.ts)
  per pool (circle method). Each team plays every other team once.
- **`fixed_games`** runs the same circle-method rotation but
  truncates at `poolGamesPerTeam` rounds. Each team plays exactly
  N opponents (no repeats); for pools of odd size, the host sets
  `gamesPerTeam ≤ poolSize − 1` and the rotation distributes byes
  evenly.

The generator is deterministic — same seeds + same N produces the
same match list. Phase 1b will add a host-facing reorder UI that
swaps match order (not opponents); opponent assignment stays the
generator's job.

### 3. Work team per match (Phase 2, design recorded here)

`Match` gains `workTeamId: TeamId | null`. The pool generator
assigns the idle team in the pool's round (the team sitting out
in that rotation) as `workTeamId` for the matches in that round.
When the pool has no idle team (2-team pool, or even-sized pool
with no rotation gap), `workTeamId` stays `null` and the UI shows
"—". **No cross-pool reffing** — hosts wanted local-pool only;
cross-pool gets complicated when pools start at different times.

Hosts can manually override `workTeamId` per match in the UI.

### 4. Courts and "no team in two places at once" (Phase 3, design recorded here)

`BracketConfig.courtLabels` is a free-text array — `["Court 1",
"Court 2", "North gym"]`. `Match` gains `court: string | null`
storing the chosen label (or null when unassigned). When the host
configures courts, a pure `assignSlots(matches, courtCount, opts)`
helper does greedy graph coloring on the conflict graph:

- Edge between two matches that share **any** team
  (`teamAId`/`teamBId`/`workTeamId`).
- Each color = one time slot. Output: per-match
  `slot: number | null` and `court: string | null`.

Matches in the same slot run in parallel. The solver runs at
`generate()` time and again on any host-driven reorder; conflicts
that can't be resolved within the configured court count surface
as `InvariantViolation` so the host can add courts or adjust.

Free-text rather than a structured `courts` table because:

- Hosts already write "Court 3" / "North gym" on whiteboards.
- We don't need to join courts to anything (no per-court price,
  no per-court owner) — labels exist purely to disambiguate parallel
  matches in the UI.
- Avoids a migration for a feature most events won't use.

## Consequences

**Easier:**

- Hosts running a 12-team / 3-pool / best-of-1 / 4-games-each
  tournament can configure that without a spreadsheet.
- Work-team and court fields land in the same JSON config /
  match-row update; no schema churn between phases.
- Match-result recording is unchanged — `bestOf` already flows
  through `determineWinner`.

**Harder:**

- The format picker UI grows; we must guard against information
  overload by keeping the new controls inside the pool-play
  collapsed fieldset.
- The slot solver in Phase 3 is the first piece of bracket code
  that's NP-hard in the worst case. Greedy coloring is fine for
  realistic inputs (≤ 32 teams, ≤ 8 courts) but the failure mode
  ("can't fit in N courts") must be a clear typed error, not a
  silent partial schedule.
- `courtLabels` and per-match `court` are free-text — typos in
  one place produce a "different" court to the solver. Mitigated
  by always picking labels from a `<select>` populated from
  `courtLabels`, never from raw text input on the match card.

## Alternatives considered

- **Structured `courts` table** keyed by event. Rejected for v1 —
  no other feature needs to join to it, and the migration cost
  exceeds the modeling benefit. Revisit if per-court pricing or
  per-court owners become a thing.
- **Manual opponent selection** in fixed-games mode (host picks
  who plays who). Rejected — the host's win condition is "fewer
  matches," not "specific matchups." The generator picks; reorder
  handles wall-clock sequencing.
- **Cross-pool work teams.** Rejected — pools often start at
  different times depending on court availability, so a team from
  Pool A reffing a Pool B match creates the exact "team in two
  places" conflict we're trying to avoid.
- **New `BracketStatus = 'draft'`** between `setup` and `active`
  to host the reorder UI. Rejected for Phase 1b — gating on
  `status === 'setup' && matches.length > 0` is enough and avoids
  touching every status check in the aggregate.
