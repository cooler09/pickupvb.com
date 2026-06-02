# Host tools page refresh + tool roadmap (2026-06-01)

## Context

User request: "clean up the hosting tools page" and "think of other useful
tools." [`/tools`](../../apps/web/src/app/tools/page.tsx) advertised two **live**
tools (live score tracker, bracket creator) alongside two stale "coming soon"
placeholders (seeding, standings) that had lingered with no plan behind them.

This bundle (a) polished the page and (b) replaced the two ad-hoc placeholders
with a curated 7-tool roadmap. **No new tools were built** — scope was
explicitly "polish + refresh the roadmap" (the user declined building one this
pass). This entry exists primarily to **record the roadmap ideas** so they
aren't lost; see Follow-ups for the per-tool brief.

## Decisions

- **Journal, not an audit, for the roadmap.** These are product/roadmap ideas,
  not point-in-time findings against a rubric — no P1/P2/P3 grades apply. The
  journal's Follow-ups section is the sanctioned home for deferred work
  ([journal README](README.md)).
- **Two-section page (Available now / On the roadmap), not one flat grid.**
  The old single grid mixed `live` and `soon` tiles and leaned on the status
  color alone to disambiguate. Splitting into labeled sections + giving roadmap
  tiles a dashed border makes "not built yet" read structurally.
- **On-token styling over ad-hoc color.** Dropped `text-emerald-600` (the only
  ad-hoc color on the page) for the M3 token vocabulary (`text-primary`,
  `bg-fg/5`, `text-muted`); CTA uses the shared `primaryButtonClass`. Keeps the
  page inside the persona-ux button/field ratchet without tripping it (no
  hand-rolled filled-primary recipe).
- **Honest metadata.** The old `description` listed "brackets, seeding, and
  standings" as if all live; seeding/standings don't exist. Rewrote to describe
  the two live tools and note the rest are "on the way."
- **Curated all 7 candidates onto the page as `soon`.** The user picked the
  full set rather than a subset, so the page now tells one story end-to-end:
  _split teams → seed → schedule/bracket → score live → track standings._

## Changes

- `app/tools/page.tsx` — rewrote: Available-now vs. roadmap sections; M3 tokens
  replace `text-emerald-600`; bracket "Sign-in required" → a `Badge`; dashed
  roadmap tiles with a `Soon` badge; equal-height cards; bottom "Host an event"
  CTA (`primaryButtonClass`); honest `Metadata`. Roadmap data lives in the
  `TOOLS` array (single source, filtered into `live`/`soon`).

## Patterns observed

- **The scoreboard already ships a reusable multi-device room primitive.**
  `app/tools/scoreboard/_lib/` has the whole no-signup, nothing-at-rest pattern:
  short room code ([`room-code.ts`](../../apps/web/src/app/tools/scoreboard/_lib/room-code.ts)),
  Supabase Realtime broadcast sync
  ([`use-scoreboard-sync.ts`](../../apps/web/src/app/tools/scoreboard/_lib/use-scoreboard-sync.ts)),
  state ↔ channel binding, localStorage, and the `/s/[code]` short-link →
  remote redirect. Any roadmap tool that wants **shared, multi-device** state
  (standings, rotation queue, timer) should generalize this rather than
  re-deriving it — that's the bulk of those tools' cost. The pure-client tools
  (randomizer, scheduler, seeding, cost split) need none of it.

## Follow-ups

The 7 roadmap tools, ordered roughly by value-for-effort. Each is a standalone
follow-up; the slug matches its tile in `TOOLS`. "Pure-client" = no backend, no
signup, ships behind a small client island like the scoreboard setup form.

- **`team-randomizer`** ⭐ — paste a roster → split into N teams, random or
  balanced by skill tier. **Pure-client**, no persistence needed (localStorage
  optional). The single highest value-for-effort start: classic pickup-night
  need, no infra. Recommended first build.
- **`scheduler` (round-robin)** — N teams + M courts → full matchup schedule per
  round (circle method). **Pure-client.** Output pairs directly with the
  standings tool. Low effort.
- **`seeding`** — snake / random / ranked ordering of a team list. **Pure-client**,
  trivial. Was one of the original placeholders; now has a concrete spec.
- **`cost-split`** — split gym/court rental evenly (or by shares) across
  attendees. **Pure-client** arithmetic, trivial. Smallest scope.
- **`standings` (win/loss)** — round-robin standings with automatic tiebreakers.
  Was the other original placeholder. **Wants shared state** if it's to update
  live across a venue → reuse the scoreboard room primitive (above); a
  single-device localStorage version is a simpler v1. Tiebreaker rules are the
  real work.
- **`timer` (match)** — full-screen countdown for timed pool play, shareable to
  every court. **Reuse the scoreboard room/Realtime + full-screen display
  pattern** almost wholesale (timer state instead of score). Low-medium once the
  room primitive is generalized.
- **`rotation` (court queue)** — king-of-the-court next-up queue for open gyms.
  **Wants shared multi-device state** (reuse the room primitive). The most
  interaction-heavy of the set; do it after the primitive is extracted.

Build trigger for the room primitive: the second multi-device tool (timer or
rotation) is the signal to extract scoreboard's `_lib/` room/sync into a shared
`app/tools/_lib/` so the three shared-state tools don't fork it three ways.
