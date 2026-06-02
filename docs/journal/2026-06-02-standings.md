# Standings tracker shipped — host-tools roadmap complete (2026-06-02)

## Context

The last roadmap tool. Live at
[`/tools/standings`](../../apps/web/src/app/tools/standings/page.tsx) — a live
win/loss table with automatic tiebreakers, pairing with the round-robin
scheduler. With it, the whole [host-tools
roadmap](2026-06-01-host-tools-roadmap.md) is resolved: 7 tools live
(scoreboard, bracket, randomizer, scheduler, seeding, timer, rotation,
standings), cost-split dropped.

## Decisions

- **Built on `useRoomSync` — fourth consumer.** Standings benefit from shared
  entry (anyone at the venue records a result, everyone sees the table), so it's
  a room tool like rotation; `use-standings-sync.ts` is another ~18-line wrapper.
- **Track scores, not just W/L.** Recording each game's points (not a bare
  win/loss) is what lets the differential tiebreaker work, and it's barely more
  UI (two score inputs).
- **Tiebreaker chain: wins → head-to-head → differential → points-for → name.**
  Head-to-head uses the standard "mini-league" rule — among the teams tied on
  wins, count only games played _between them_. Implemented by sorting on wins,
  partitioning into equal-wins groups, and re-sorting each group by
  head-to-head-within-group, then the remaining keys. Works for a 2-way tie or
  larger; both paths are unit-tested.
- **Pure `standings.ts`, table derived live in render.** `computeStandings` is
  pure (no randomness, no `Date.now()` in render), so the table recomputes
  in-render from the synced state — no button, like the scheduler/cost-split
  deterministic tools. `recordResult` validates (teams exist, distinct, scores
  ≥0) so a bad entry is a no-op.
- **In-chrome manager with a real `<table>`.** Like rotation, it's something you
  operate, so it lives in the site chrome on the M3 button/field vocab (the
  result form's selects use `fieldInputClass`, satisfying the CC-2 ratchet) — not
  a full-screen takeover.

## Changes

- **Standings:** `standings/_lib/standings.ts` + `standings.test.ts` (pure state,
  `recordResult`, `computeStandings` + tiebreakers — 9 cases),
  `standings/_lib/use-standings-sync.ts` (wraps `useRoomSync`),
  `standings/_components/{setup-form,standings-board}.tsx`, `standings/page.tsx`
  (SEO landing), `standings/[code]/page.tsx` (room, noindex).
- **Wire-up:** `tools/page.tsx` (standings tile `soon` → `live`), `sitemap.ts`
  (+`/tools/standings`), `robots.ts` (disallow `/tools/standings/*` rooms).
- **`tools/page.tsx`:** guarded the "On the roadmap" section to render only when
  `soon.length > 0` — every tool is now `live`, so the section (and its heading)
  would otherwise render empty.

## Patterns observed

- **The room engine now has four consumers** (scoreboard, timer, rotation,
  standings). A new shared-state tool is purely "pure state machine + ~18-line
  sync wrapper + view" — the extraction has fully paid for itself.
- **Mini-league grouping is the clean way to do head-to-head.** Sort by the
  primary key, partition into tied groups, re-sort each group by the
  within-group metric. Generalizes any "break ties among equals by results among
  equals" ranking.
- **The tools now compose into one run-a-tournament arc:** randomize teams → seed
  → schedule → score live (scoreboard) → standings; rotation covers the open-gym
  case. Each is independent and no-signup, but they hand off naturally by paste.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green; routes
`ƒ /tools/standings` and `ƒ /tools/standings/[code]` in the manifest; web suite
195 tests (+9 standings). Realtime sync (record-result reflecting across devices,
late-join catch-up) needs the same **two-device dev-verify** as timer/rotation
before it's "done".

## Follow-ups

- **Roadmap complete** — no `soon` tiles remain on `/tools`. The shared-state
  trio (timer, rotation, standings) all still want one pass of two-device
  realtime dev-verification against dev (none is automated).
- Standings niceties, deferred: win-percentage ordering for unequal games
  played (round-robin makes wins-count fine today), shared rank numbers for a
  genuine all-keys tie, and a "load teams from the scheduler" hand-off.
