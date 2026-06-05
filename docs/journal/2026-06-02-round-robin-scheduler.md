# Round-robin scheduler — second roadmap tool shipped (2026-06-02)

## Context

Continuing the [host-tools roadmap](2026-06-01-host-tools-roadmap.md) after the
[team randomizer](2026-06-02-team-randomizer.md). The scheduler is the
highest-value remaining pure-client tool and chains directly off the randomizer
(make teams → schedule their matches). Live at
[`/tools/scheduler`](../../apps/web/src/app/tools/scheduler/page.tsx); promoted
`soon` → `live` on `/tools`.

## Decisions

- **Cloned the randomizer's 4-file template** (`page.tsx` + `_components` island
  - pure `_lib` + `_lib` test), confirming it generalizes. The only departure is
    below.
- **Derived live in render — no "Generate" button.** Unlike the randomizer
  (which needs a button because the shuffle is random), the schedule is a _pure
  deterministic function_ of (teams, courts). So `roundRobin(teams, courts)` is
  computed during render and results update as you type. Both inputs are pure
  (no `Math.random`), so this is Compiler-safe — the randomizer's button was a
  consequence of randomness, not the template.
- **Single round-robin via the circle method.** Fix one team, rotate the rest,
  pair across; `n-1` rounds. Chose it over scheduling-by-combinations because it
  naturally yields _rounds_ (no team plays twice in a round), which is what a
  host actually needs to run courts in parallel.
- **Odd teams → a `(bye)` sentinel**, filtered out of the surfaced matches, so
  one team sits out each round and byes rotate evenly.
- **Guard on real team count before padding.** `roundRobin(['Solo'])` first
  produced one empty round (the lone team padded to a bye); the unit test caught
  it pre-build. Fixed by returning `[]` when `teamsIn.length < 2`, _before_
  adding the bye.
- **Courts deal in order per round** (`k % courts + 1`); court labels are
  omitted entirely for a single court (kept out of the type via the optional
  `court?` field, not set to a placeholder).

## Changes

- `app/tools/scheduler/_lib/schedule.ts` — **new** pure logic: `parseTeams`,
  `roundRobin` (circle method + byes + court dealing), `gameCount`,
  `formatScheduleText`.
- `app/tools/scheduler/_lib/schedule.test.ts` — **new** 12 Vitest cases:
  pair-completeness (every pair once), per-round no-repeat, even/odd-bye rotation
  (each team sits out the same number of times), court dealing, degenerate
  (<2 teams), copy format.
- `app/tools/scheduler/_components/scheduler.tsx` — **new** client island
  (teams textarea, courts input, live round grid, Copy-to-clipboard).
- `app/tools/scheduler/page.tsx` — **new** SEO landing (metadata, JSON-LD, FAQ).
- `app/tools/page.tsx` — scheduler tile `soon` → `live` with its href.
- `app/sitemap.ts` — added `/tools/scheduler`.

## Patterns observed

- **The 4-file template flexes on the button.** A _deterministic_ pure-client
  tool drops the action button and derives results in render; a _random_ one
  keeps a button (the randomness must be event-triggered to stay Compiler-pure).
  The next tools split this way: seeding (random → button) vs. cost-split
  (deterministic → live).
- **Invariant tests beat example tests for combinatorial output.** Asserting
  "every pair appears exactly once" and "no team twice per round" pins the
  algorithm far better than a hardcoded expected schedule, and it's what caught
  the empty-round edge.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green; new route
`ƒ /tools/scheduler` in the build manifest. Not run: e2e (no covered journey).

## Follow-ups

- Remaining pure-client roadmap tools: **seeding** and **cost-split** (both
  trivial; seeding is random-with-button, cost-split is deterministic-live). The
  three shared-state tools (standings / timer / rotation) still want the
  scoreboard room primitive first — see
  [host-tools roadmap](2026-06-01-host-tools-roadmap.md).
- Deferred niceties: double round-robin (play twice), explicit bye row in the
  output, and accepting a team _count_ (auto-named) as an alternative to pasting
  names.
