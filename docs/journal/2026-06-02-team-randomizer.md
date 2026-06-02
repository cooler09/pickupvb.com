# Team randomizer — first roadmap tool shipped (2026-06-02)

## Context

Follow-up to [the host-tools roadmap](2026-06-01-host-tools-roadmap.md). The
user asked to build "the easiest tool"; of the four pure-client candidates the
**team randomizer** was the recommended first build (highest value-for-effort,
no infra). It's now live at
[`/tools/team-randomizer`](../../apps/web/src/app/tools/team-randomizer/page.tsx)
and promoted from `soon` → `live` on the `/tools` index.

## Decisions

- **Pure-client, nothing persisted.** Roster lives in the textarea; no backend,
  no localStorage, no signup — same posture as the scoreboard tool. Matches the
  roadmap brief and keeps the page CDN-cacheable.
- **Logic in a pure `_lib/split.ts`, UI as a thin island.** The split/parse/
  format functions are framework-free with an **injectable `rng`** (defaults to
  `Math.random`). Two payoffs: the algorithm is deterministically unit-tested
  ([`split.test.ts`](../../apps/web/src/app/tools/team-randomizer/_lib/split.test.ts),
  13 cases), and `Math.random` is only ever called from an event handler — never
  in a render body — so the React-Compiler purity rule (AGENTS.md pitfall #4) is
  structurally satisfied. `parseRoster` is pure, so deriving `players` during
  render is safe.
- **Balanced = snake draft by rating.** Chose a snake draft (0…n-1, n-1…0, …)
  over greedy bin-packing because it levels both head-count and total skill in
  one pass and is trivial to reason about. Unrated players take the **mean of
  the rated ones** so a partially-rated roster still drafts sensibly. Random
  mode = shuffle then round-robin deal (sizes differ by ≤1).
- **Rating parse: trailing number, non-greedy name.** A line is `name` + optional
  `[\s,:]`-separated trailing number ("Alex 5", "Bo, 3", "Cara: 4.5"). The name
  capture is **non-greedy** — the first cut used a greedy `(.*\S)` that swallowed
  the comma ("Bo," ), which the unit test caught before build.
- **Mode toggle reuses canonical button classes.** `tonalButtonClass` (active) /
  `neutralButtonClass` (inactive) for the Random|Balanced segmented control
  rather than a hand-rolled recipe, staying inside the persona-ux CC-1 ratchet.
- **SEO landing mirrors the scoreboard.** Server-component page with real
  `Metadata` + `WebApplication`/`FAQPage` JSON-LD + an FAQ, interactivity behind
  a `'use client'` island. Added to `sitemap.ts`. Unlike the ephemeral scoreboard
  rooms it is **not** noindexed — it's an evergreen utility page worth ranking.

## Changes

- `app/tools/team-randomizer/_lib/split.ts` — **new** pure logic: `parseRoster`,
  `hasRatings`, `shuffle` (injectable rng), `splitTeams` (random / balanced),
  `teamSummary`, `formatTeamsText`.
- `app/tools/team-randomizer/_lib/split.test.ts` — **new** 13 Vitest cases
  (parse separators + multi-word names, permutation invariants, level snake
  totals, size-balance, clamping, summary, copy format).
- `app/tools/team-randomizer/_components/randomizer.tsx` — **new** client island
  (roster textarea, team-count, mode toggle, result grid with per-team
  count/avg, Copy-to-clipboard).
- `app/tools/team-randomizer/page.tsx` — **new** SEO landing (metadata, JSON-LD,
  How-it-works, FAQ) hosting the island.
- `app/tools/page.tsx` — team-randomizer tile `soon` → `live` with its href.
- `app/sitemap.ts` — added `/tools/team-randomizer`.

## Patterns observed

- **The scoreboard's "SEO landing + client island + `_lib`" shape is now a
  reusable 4-file template for pure-client tools.** `page.tsx`
  (server, metadata/JSON-LD/FAQ) → `_components/*.tsx` (`'use client'` island) →
  `_lib/*.ts` (pure logic) → `_lib/*.test.ts`. The next pure-client roadmap tool
  (scheduler / seeding / cost-split) should clone this rather than reinvent the
  page scaffold.
- **An injectable rng is the clean way to keep randomness testable _and_
  Compiler-pure.** Defaulting the parameter to `Math.random` means call sites
  stay ergonomic while tests pin a permutation; the impure read never reaches a
  render body.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green; new route
`ƒ /tools/team-randomizer` in the build manifest. Not run: e2e (no covered
journey touches this page).

## Follow-ups

- Remaining roadmap tools unchanged — see
  [host-tools roadmap](2026-06-01-host-tools-roadmap.md). Next-easiest are the
  other pure-client three; the scaffold above is now their template.
- Possible v2 niceties, deliberately deferred (not needed for the core job):
  editable team names, a "players per team" mode (vs. team count), and optional
  localStorage of the last roster.
