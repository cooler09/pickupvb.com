# Live match scoring — Phase 5 (read side): public live view (2026-05-30)

## Context

The final piece of [ADR 0023](../adr/0023-live-match-scoring.md): spectators and
hosts now see the in-progress scoreboard score render **in place** on the public
bracket spectator view, the host bracket page, and the league schedule — with a
"LIVE" badge — as a Pro host scores a bound match. The write side (Phase 5 write)
persists per-point to `match_live_scores`; this bundle subscribes to it and
paints the score.

## Decisions

- **One division-scoped subscription + a context map, not one subscription per
  match.** `LiveScoresProvider` opens a single `match_live_scores`
  `postgres_changes` channel filtered by `division_id`, holds a
  `Map<matchId, LiveMatchScore>`, and provides it; `LiveScore` consumers read by
  `matchId`. This is exactly why Phase 2 denormalized `division_id` onto the row
  with `REPLICA IDENTITY FULL` (so DELETE/UPDATE events match the non-PK filter).
- **Provider gated by `enabled` (= host is Pro).** When false it's inert — no
  channel, empty map — so live scores only surface for Pro-host events regardless
  of what rows exist. This closes the "non-Pro host crafts `pushLiveScore` calls"
  leak from the write side at the _render_ boundary. Each page computes
  `isPro(event.hostUserId)` (the host bracket page already did; added it to the
  watch + schedule pages).
- **`LiveScore` is self-hiding** (`useLiveScore(matchId)` → null ⇒ renders
  nothing), so it drops into `MatchCard` / `MatchRow` unconditionally and only
  appears while a live row exists. Gated additionally on the match not being
  completed/bye so a stale row never shadows a final result.
- **Client provider wrapping server-rendered children.** The provider wraps
  `BoardView` / the schedule list (server components passed as `children`); the
  `LiveScore` client consumers nested deep inside still read the context — the
  standard "client provider, server children" pattern.
- **`setState` lives in async callbacks (snapshot fetch + subscription handler),
  not the effect body**, so it doesn't trip `react-hooks/set-state-in-effect`.
  Matches the existing realtime pattern in `use-event-attendees.ts` /
  `notification-bell.tsx` rather than introducing `useSyncExternalStore`.
- **Coexists with `BracketRealtimeRefresher`.** The refresher does a full
  `router.refresh()` when a _canonical_ result lands (heavy, correct for "final");
  the live provider updates the in-progress score in place (light, per point).
  On finalize the live row is cleared (DELETE ⇒ removed from the map) and the
  refresher repaints the official result.

## Changes

- `apps/web/src/app/events/[id]/_components/live-scores-provider.tsx` — new
  client provider (single division-scoped subscription + initial snapshot +
  context) and `useLiveScore` hook.
- `apps/web/src/app/events/[id]/_components/live-score.tsx` — new self-hiding
  consumer (LIVE badge + current rally score, sets when multi-set).
- Bracket host page + `bracket/watch` page — wrap `BoardView` in
  `LiveScoresProvider`; watch page also computes `isPro(hostUserId)`.
- League `schedule/page.tsx` — wrap the weeks list in `LiveScoresProvider`.
- `bracket/_components/match-card.tsx` + `schedule/_components/match-row.tsx` —
  render `<LiveScore>` for non-terminal matches.

## Follow-ups

- **Runtime verification is still pending** the hand-added-types reconciliation
  (`pnpm db:migrate && gen:types` with Docker up) and a deployed environment —
  the realtime round-trip (score on the board → public view updates) can't be
  exercised by the static quad. Worth a manual smoke test or a Playwright case
  once the migration is applied.
- **Standings page** (if/when one exists separate from the bracket/schedule)
  would get the same `LiveScoresProvider` wrap.

## Verify

Full quad green (`typecheck && lint && test && build`): lint 0 errors / 3
pre-existing warnings (the new realtime provider adds none); build OK (bracket,
watch, schedule routes compiled). The subscription/render path is type/build
verified but not runtime-exercised (no local Supabase).
