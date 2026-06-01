# 0023. Live match scoring — scoreboard ↔ scheduled match, Pro-gated

- **Status:** Accepted — implemented (phases 1–5 shipped 2026-05-30; see journal
  entries `2026-05-30-live-match-scoring-phase1..5*`). Code-complete and
  integrated (`match_live_scores` + RPCs in generated types; typecheck green).
  **Remaining (phase 6):** runtime/e2e verification of the realtime round-trip
  on a deployed env — no `score-live` Playwright spec exists yet.
- **Date:** 2026-05-30 (proposed) · 2026-06-01 (status updated to reflect ship)
- **Relates to:** [ADR 0001 — Hexagonal architecture with CQRS-lite](0001-hexagonal-cqrs.md), [ADR 0006 — Event divisions](0006-event-divisions.md), [ADR 0014 — Monetization strategy](0014-monetization-strategy.md), [ADR 0018 — Pool play configuration (bestOf)](0018-pool-play-configuration.md)

## Context

Two scoring surfaces exist today and never touch each other:

1. **The free standalone scoreboard** ([apps/web/src/app/tools/scoreboard/](../../apps/web/src/app/tools/scoreboard/)).
   Ephemeral and anonymous — state lives only in `localStorage` plus a Supabase
   Realtime **broadcast** channel (`scoreboard:{code}`), with no DB rows, no auth,
   no RLS ([use-scoreboard-sync.ts](../../apps/web/src/app/tools/scoreboard/_lib/use-scoreboard-sync.ts)).
   It already models **set-by-set** play — `scoreA/scoreB` (current rally points),
   `setsA/setsB` (sets won), `setHistory`, plus target / win-by / best-of config
   ([\_lib/types.ts](../../apps/web/src/app/tools/scoreboard/_lib/types.ts)). It is
   marketed as free / no-signup and is an SEO acquisition surface
   ([scoreboard/page.tsx](../../apps/web/src/app/tools/scoreboard/page.tsx)).

2. **Manual match-result entry**, in two different shapes:
   - **Bracket** matches store set-by-set `MatchSet[]` (`{setNumber, teamAScore,
teamBScore}`), recorded via `RecordMatchResultCommand` →
     [record_bracket_match_result RPC](../../supabase/migrations/20260814000100_record_bracket_match_result_rpc.sql).
   - **League** schedule matches store a single `homeScore` / `awayScore` int,
     recorded via `RecordLeagueMatchResultCommand` →
     [record_league_match_result RPC](../../supabase/migrations/20260814000000_record_league_match_result_rpc.sql).

   Both already authorize "host **or** either team's captain" at the DB boundary
   and run through user-scoped clients (AGENTS.md pitfall #8). Both are _type the
   numbers in after the game_ forms.

We want a host to be able to **score a scheduled bracket/league match on the
scoreboard** and have the in-progress score **reflected live on the public
bracket / standings**, with the final result **persisted to the official record**
— while keeping the existing manual forms.

Two facts make this far smaller than it first appears:

- **The scoreboard's data model is a superset of both result models.**
  `setHistory` + the final set maps 1:1 onto bracket `MatchSet[]`; `setsA/setsB`
  maps onto the league single number. Saving is mostly a **pure mapping into the
  command handlers that already exist** — no new write authorization, no new RLS.
- **The public live-refresh path already exists.** `bracket_matches`,
  `bracket_match_sets`, and `league_schedule_matches` are all in the
  `supabase_realtime` publication with `SELECT using (true)`, and
  [BracketRealtimeRefresher](../../apps/web/src/app/events/[id]/bracket/_components/realtime-refresher.tsx)
  already subscribes to `postgres_changes` and re-renders every viewer when a
  result lands.

So the gaps are narrow: **(a)** somewhere cheap to persist the _in-progress_
score, **(b)** a scorer surface bound to a match, **(c)** the Pro gate, and **(d)**
promoting the scoring rules into the domain — which [\_lib/types.ts](../../apps/web/src/app/tools/scoreboard/_lib/types.ts)
already names as the trigger ("If/when we add Pro persistence … promote these
into packages/domain").

## Decision

Build **live match scoring** as a Pro-host feature layered on the existing
scoreboard, persistence, and realtime primitives — not a rewrite.

### 1. Three data channels, each reusing an existing primitive

| Concern                                                   | Mechanism                                                                 | Status                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| Scorer ↔ remote tapping (low latency, sub-second)         | Realtime **broadcast** `scoreboard:{code}`                                | exists, unchanged                       |
| In-progress score → public viewers (durable, trustworthy) | new `match_live_scores` row + **`postgres_changes`**                      | new table; subscription plumbing exists |
| Official result + winner advancement + standings          | existing `record_bracket_match_result` / `record_league_match_result` RPC | exists, unchanged                       |

The scorer's tapping stays on broadcast (snappy, exactly as the free tool works
today). Each point is **upserted to a narrow `match_live_scores` row**; public
viewers read that row over `postgres_changes`. On completion the live state is
**folded into the canonical record** through the _existing_ finalize RPC (winner
advancement, header completion, standings — unchanged), and the live row is
cleared.

**Why the public view reads the DB, not the broadcast channel.** A deterministic
per-match broadcast channel (name derivable from `matchId`, which is in the page
HTML) would be joinable by anyone and **spoofable** — a troll could push fake
scores to every public viewer. The broadcast model is acceptable for a private
4-char-code throwaway room; it is not acceptable for an _official_ public
standings surface. Routing the public view through a row only the
authorization-gated RPC can write makes it durable **and** non-spoofable, and
reuses the `postgres_changes` plumbing we already ship.

### 2. Promote scoring rules into `@pickupvb/domain` (`LiveMatchScore`)

Move the pure scoring logic — `increment`, `commitSet`, `isSetWon`,
`matchWinner`, `setsToWin` — out of [apps/web/.../\_lib/types.ts](../../apps/web/src/app/tools/scoreboard/_lib/types.ts)
into a framework-free `LiveMatchScore` value object in `@pickupvb/domain`. The
free standalone tool then **thin-wraps the domain primitive** (re-export), so it
keeps working with zero behavior change and zero call-site edits. This is the
promotion the file's own comment anticipates, and it gives the rules Vitest
coverage they don't have today (the free tool has none). It also advances the
DDD/Onion refactor initiative (the scoring rules currently live in the web layer,
the wrong ring).

### 3. `match_live_scores` table + a narrow, RLS-gated upsert RPC

A **separate** table keyed by `(match_id)` with a `kind` discriminator
(`'bracket' | 'league'`) and a `live_state jsonb` column. It is **not** the
canonical `bracket_match_sets` / `league_schedule_matches` rows because the
canonical bracket write is a **full replace** (`save_bracket`) — far too expensive
to run per rally point. A narrow single-row upsert keeps the hot per-point writes
off the canonical rows.

Writes go through a new **`upsert_match_live_score` RPC**, `SECURITY INVOKER`,
single-row, gated by the **same** predicate the canonical RPCs use
(`is_event_host(...)` OR `is_bracket_match_captain(...)` / `is_league_match_captain(...)`),
invoked from a **user-scoped** client (AGENTS.md pitfall #8 — never enforce
authorization on the admin client). It mirrors the
[record_league_match_result](../../supabase/migrations/20260814000000_record_league_match_result_rpc.sql)
"single-row UPDATE under INVOKER RLS" pattern. The table gets `SELECT using
(true)` and is added to the `supabase_realtime` publication.

### 4. Application layer: incremental update + finalize-via-existing-command

- **`UpdateLiveMatchScoreCommand` / handler** — persists the current
  `LiveMatchScore` to the live row (incremental, per point or debounced).
- **Finalize** maps the terminal `LiveMatchScore` → the existing
  `RecordMatchResultCommand` (bracket: `setHistory` + final set → `MatchSet[]`) or
  `RecordLeagueMatchResultCommand` (league: see open question on the single-number
  mapping) and runs the **unchanged** handler. No new finalize/authorization path;
  winner advancement and standings come for free. A pure, unit-tested mapping
  helper does the translation (AGENTS.md: new logic feeding a domain command earns
  a test).

### 5. Pro gate at the host/event level

Availability is gated on **`isPro(event.hostId)`** — already memoized via
`React.cache` and read directly from the lib facade
([pro.ts](../../apps/web/src/lib/pro.ts)), the sanctioned shortcut per AGENTS.md
pitfall #10. Evaluated once per event:

- **Host is Pro** → "Score live" is enabled on **every match in that event**;
  live-to-public sync and auto-save to the official record are active.
- **Host is not Pro** → the existing **manual score forms stay free for everyone**
  (host _and_ captains); the live-score affordance shows an upgrade prompt.

This draws the monetization line where ADR 0014 says it belongs: **Pro grows
through net-new features only, never takeaways from existing free users.** Basic
data entry and the standalone scoreboard remain free; the _live, match-bound,
auto-saving_ experience is the net-new Pro-host perk. It also fits the "Pro = host
operating system" framing — a serial host running a multi-court tournament is
exactly who pays for live public scoring.

### 6. Public live view updates in place (not `router.refresh()` per point)

[BracketRealtimeRefresher](../../apps/web/src/app/events/[id]/bracket/_components/realtime-refresher.tsx)
calls `router.refresh()` on every change — correct for "a result landed," but a
full server re-render **per rally point** would be heavy and laggy. The live view
is a small client island that subscribes to `match_live_scores` `postgres_changes`
and updates the displayed numbers **in place** (the same shape the scoreboard
itself uses), plus a "LIVE" badge driven by the presence of a live row. The
existing refresher still handles the terminal "result landed" re-render when the
match finalizes and the canonical row changes.

### 7. Phasing

| Phase | Scope                                                                                                                                                                                                                                                                                                                                                                           | Risk                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **1** | Promote scoring rules → `LiveMatchScore` in `@pickupvb/domain`; free tool thin-wraps; Vitest coverage. **No behavior change.**                                                                                                                                                                                                                                                  | low, self-contained |
| **2** | Migration: `match_live_scores` table + `upsert_match_live_score` RPC + `supabase_realtime` + public-read RLS; regen types                                                                                                                                                                                                                                                       | low                 |
| **3** | Application `UpdateLiveMatchScore` handler + finalize mapping helpers; repo port + Supabase adapter; wire [handlers.ts](../../apps/web/src/lib/handlers.ts)                                                                                                                                                                                                                     | medium              |
| **4** | Scorer surface: auth'd `/events/[id]/score/[matchId]` reusing `ScoreboardView` with a `binding` prop (seeds team names + best-of from division config); "Score live" buttons on [MatchCard](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx) / [MatchRow](../../apps/web/src/app/events/[id]/schedule/_components/match-row.tsx) gated on `isPro(hostId)` | medium              |
| **5** | Public live view: in-place `match_live_scores` subscription island + LIVE badge                                                                                                                                                                                                                                                                                                 | low                 |
| **6** | Pro polish (upgrade prompt for non-Pro hosts); verify chain; Playwright e2e (score → public-live → finalize) against dev                                                                                                                                                                                                                                                        | low                 |

Phase 1 is independent and unblocks the rest.

## Consequences

- **Easier:** scoring rules become pure, tested, and reusable across the free
  tool, the Pro live surface, and any future client. Saving from the scoreboard
  reuses the existing authorization, RLS, winner-advancement, and standings paths
  unchanged — no second source of truth for "who won."
- **Easier:** the public live view rides infra that already exists
  (`postgres_changes` + public-read RLS + `supabase_realtime`), so "the bracket
  updates live" needed a new _row_, not a new _mechanism_.
- **Harder / watch out:** per-point writes are a new hot path. Mitigated by a
  narrow single-row upsert (cheap) and optional client-side debounce; we
  deliberately keep them **off** the full-replace `save_bracket` path. The two
  finalize RPCs and `upsert_match_live_score` must stay authorization-consistent
  (same host/captain predicate).
- **Harder / watch out:** the live view is a second realtime surface to reason
  about. We keep it read-only and DB-backed precisely so the official standings
  can't be spoofed by a broadcast peer.
- **Committed to:** the Pro line is "scorekeeping data entry is free; the live,
  match-bound, auto-saving scoreboard is Pro-host." Moving that line (e.g. gating
  manual entry, or gating on captain-Pro instead of host-Pro) requires an ADR
  amendment, not a silent flag flip — same discipline as the ADR 0014 levers.
- **Not in scope:** watch (Apple Watch / Wear OS) scoring — evaluated and
  deferred (watchOS has no web/PWA path; interactive wrist scoring is a native-app
  project on two platforms). The realtime + live-row backend built here is the
  reusable substrate if/when native watch apps are green-lit; glanceable
  watch _notifications_ can later ride the existing web-push pipeline once the site
  ships a web-app manifest.

## Alternatives considered

- **Public view subscribes to the broadcast channel directly.** Cheapest (no DB
  write per point) and gives true per-point liveness, but the per-match channel is
  spoofable and non-durable — unacceptable for an official public standings
  surface. Rejected for the public view; broadcast is retained only for the
  authenticated scorer ↔ remote link.
- **Persist in-progress score into `bracket_match_sets` via `save_bracket`.**
  Single source of truth, but the canonical write is a full bracket _replace_ —
  pathologically expensive and contended per rally point, and it would fire winner
  advancement on every tap. Rejected in favor of a narrow live row that folds into
  the canonical record only on finalize.
- **Keep scoring rules in the web layer; duplicate them for the Pro surface.**
  Violates DRY and the Onion direction, and leaves the rules untested. Rejected —
  Phase 1 promotion is cheap and the file already asks for it.
- **Make saving from the scoreboard free (gate nothing).** Was the initial
  recommendation, but the product decision is to make the _live_ experience a
  Pro-host perk (manual entry stays free). Captured here so the gate is a
  documented monetization choice, not an accident.
- **Gate on the captain's Pro status.** Rejected: captains aren't the buyer
  persona (ADR 0014), and per-captain gating would make a single match's
  availability depend on who opens it. Host-level gating ("Pro host → live scoring
  for the whole event") matches how every other event-level Pro perk works.

## Open questions / follow-ups

- **League single-number semantics — RESOLVED 2026-05-30: adaptive.** The
  `LiveMatchScore` → league mapping is driven by `config.bestOf`: a **best-of-1**
  match finalizes as the single set's **points** (e.g. 25–21); a **multi-set**
  match finalizes as **sets won** (e.g. 2–1). `home` = scoreboard side A, `away` =
  side B (the scorer surface seeds side A = home team). Implemented as
  `liveMatchScoreToLeagueScore` in the application finalize mapping.
- **Persist cadence.** Per-point upsert is cheap on a narrow row; revisit a ~1s
  client debounce only if a busy multi-court event shows write pressure.
- **Concurrency.** Two captains scoring one match → last-write-wins by the
  scoreboard's monotonic `version` (same as the free tool today); the live row
  takes the highest version.
- **Anonymous auth.** Scorers must be real accounts (`requireRealUser`), consistent
  with the existing result-entry actions.

## References

- [apps/web/src/app/tools/scoreboard/\_lib/types.ts](../../apps/web/src/app/tools/scoreboard/_lib/types.ts) — scoring rules to promote (and the comment that anticipates this ADR).
- [apps/web/src/app/tools/scoreboard/\_lib/use-scoreboard-sync.ts](../../apps/web/src/app/tools/scoreboard/_lib/use-scoreboard-sync.ts) — broadcast sync (scorer ↔ remote).
- [apps/web/src/app/events/[id]/bracket/\_components/realtime-refresher.tsx](../../apps/web/src/app/events/[id]/bracket/_components/realtime-refresher.tsx) — the `postgres_changes` public-refresh pattern reused for the live view.
- [supabase/migrations/20260814000100_record_bracket_match_result_rpc.sql](../../supabase/migrations/20260814000100_record_bracket_match_result_rpc.sql) / [20260814000000_record_league_match_result_rpc.sql](../../supabase/migrations/20260814000000_record_league_match_result_rpc.sql) — the finalize RPCs and the host/captain authorization predicate the live upsert mirrors.
- [apps/web/src/lib/pro.ts](../../apps/web/src/lib/pro.ts) — `isPro`, the Pro-gate read.
- [docs/adr/0014-monetization-strategy.md](0014-monetization-strategy.md) — "Pro grows through net-new features only, never takeaways."
