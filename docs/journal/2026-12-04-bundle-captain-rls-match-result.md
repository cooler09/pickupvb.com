# Captain-RLS on match-result writes (2026-12-04)

## Context

Closes the last carry-forward from
[event-data-model.md](../audits/event-data-model.md) — the "captain-RLS gap
on bracket + league match-result writes" flagged in the `save_league_schedule`
and `save_bracket` RPC scope notes. It is an authorization concern, so it's
also recorded as a follow-on to
[security.md § P2 #4](../audits/security.md#4-admin-supabase-client-used-for-user-driven-writes)
("Admin Supabase client used for user-driven writes").

The gap: recording a match result is the one mutation a non-host (a team
captain) may perform. The handlers delegated that authorization to Postgres
RLS — `bracket_matches_update` / `bracket_match_sets_write` /
`league_schedule_matches_update`, all "host or either captain" — and the
bracket server actions even passed `requesterId = ''` to make the intent
explicit. But the writes went through `SupabaseBracketRepository.save` /
`SupabaseLeagueScheduleRepository.save`, which run the full-replace RPCs on
the **service-role admin client**. That client bypasses RLS, so the policies
never fired: any signed-in real user could record or overwrite any match's
score. Bundle 14's admin→server sweep missed it because the repos
self-construct the admin client internally — the gap hid behind the port.

## Decisions

- **Chose user-scoped client + RLS enforcement over an application-layer
  authz check.** The codebase deliberately delegated this authz to RLS
  (handler comments; `requesterId = ''`); the bug was that the client
  bypassed it, not the choice to use it. Honoring that intent also keeps
  defense-in-depth at the DB layer.
- **League: narrow `SECURITY INVOKER` single-row UPDATE RPC
  (`record_league_match_result`).** League matches are independent (no
  bracket advancement), so a captain already holds UPDATE on their own row
  — pure RLS works. Chose a dedicated RPC over reusing `save_league_schedule`
  because the full-replace does DELETE+INSERT, which a captain can't do, and
  which would clobber the whole slate for a single score anyway.
- **Bracket: `SECURITY DEFINER` RPC with an explicit per-match authz gate
  (`record_bracket_match_result`).** Rejected pure INVOKER: recording a
  result advances the winner into the _downstream_ match (a row whose teams
  are still TBD, so the captain neither hosts nor captains it) and may flip
  the `event_brackets` header to `completed` (host-only). A plain user can't
  write either under RLS. Rejected reimplementing advancement/completion in
  SQL (it lives in the tested `Bracket` aggregate and would drift). Instead
  the DEFINER function authorizes `is_event_host(event) OR
is_bracket_match_captain(actor_match)` — the same predicate the RLS
  policies encode — then delegates to `save_bracket`.
- **Chose `perform save_bracket(...)` (nested INVOKER-in-DEFINER) over
  duplicating the save body.** Inside the DEFINER function the INVOKER
  `save_bracket` runs as the function owner (BYPASSRLS), so the writes land
  after the per-match authz. DRY beats a 45-line copy that could drift; the
  subtlety is documented in both migration preambles. **Safe because** the
  bracket payload is always computed by the trusted domain layer from the
  persisted bracket + the actor's `(matchId, sets)` — the caller controls
  only _which_ match they score, never the resulting shape.
- **Chose a per-request factory (`getMatchResultHandlers()`) and removed the
  three handlers from the module-singleton `handlers`.** The user-scoped
  client is request-cookie-bound so the handlers can't be module singletons;
  removing them from `handlers` prevents the admin-bypass path from being
  reused by accident.
- **Distinguish not-found from not-authorized in the RPCs** (SQLSTATE
  `P0002` vs `42501`) and map to `NotFoundError` / `UnauthorizedError` at
  the adapter boundary, so the existing server-action `classify()` flash
  params (`notfound` / `forbidden`) keep working.

## Changes

- **Migrations** —
  [`20260814000000_record_league_match_result_rpc.sql`](../../supabase/migrations/20260814000000_record_league_match_result_rpc.sql)
  (INVOKER single-row UPDATE),
  [`20260814000100_record_bracket_match_result_rpc.sql`](../../supabase/migrations/20260814000100_record_bracket_match_result_rpc.sql)
  (DEFINER authz gate → `save_bracket`).
- **Types stub** — added both RPCs to the `public` `Functions` block in
  [`database.types.ts`](../../packages/supabase/src/database.types.ts)
  (Docker-off convention).
- **Domain ports** —
  [`LeagueScheduleRepository.recordMatchResult`](../../packages/domain/src/leagues/league-schedule-repository.ts)
  - `RecordLeagueMatchResultInput`;
    [`BracketRepository.saveAsMatchActor`](../../packages/domain/src/brackets/bracket-repository.ts).
- **Adapters** —
  [`SupabaseLeagueScheduleRepository`](../../packages/infrastructure/src/supabase-league-schedule-repository.ts)
  and
  [`SupabaseBracketRepository`](../../packages/infrastructure/src/supabase-bracket-repository.ts):
  optional user-scoped-client constructor arg, new methods, `42501`/`P0002`
  → typed-error mapping. Bracket `save`'s payload builder extracted to a
  shared `buildSaveArgs`.
- **Handlers** —
  [`RecordLeagueMatchResultHandler`](../../packages/application/src/commands/league-schedule.handler.ts)
  now validates via the value object then calls `recordMatchResult`;
  [`RecordMatchResultHandler` + `ResetMatchHandler`](../../packages/application/src/commands/bracket.handler.ts)
  call `saveAsMatchActor(bracket, cmd.matchId)`.
- **Composition root** —
  [`handlers.ts`](../../apps/web/src/lib/handlers.ts): added
  `getMatchResultHandlers()`; removed `recordMatchResult` / `resetMatch` /
  `recordLeagueMatchResult` from the module singletons.
- **Server actions** —
  [`bracket/actions.ts`](../../apps/web/src/app/events/[id]/bracket/actions.ts)
  and
  [`schedule/actions.ts`](../../apps/web/src/app/events/[id]/schedule/actions.ts):
  call `getMatchResultHandlers()`, pass the real `user.id`.
- **Tests** — new
  [`bracket.handler.test.ts`](../../packages/application/src/commands/bracket.handler.test.ts)
  - extended
    [`league-schedule.handler.test.ts`](../../packages/application/src/commands/league-schedule.handler.test.ts):
    fakes whose `save` throws / counts, asserting record/reset go through the
    narrow methods.

## Patterns observed

- **An adapter that self-constructs the admin client hides an RLS-bypass
  behind the port.** "Swap admin → server client" sweeps that only look at
  page/action code miss it. When chasing RLS-bypass, audit the repository
  adapters too. Added to [security.md § P2 #4](../audits/security.md).
- **Full-replace `save` is structurally incompatible with fine-grained
  (captain) authz** — it touches host-only rows (header, insert/delete).
  Non-host-reachable mutations need a _narrow_ persistence path distinct
  from the host full-replace, even when both ultimately full-replace the
  aggregate.
- **`SECURITY DEFINER` + an explicit gate is the right tool when the
  legitimate side-effects of an authorized action cross the RLS row
  boundary** (bracket advancement). Pure INVOKER+RLS only fits single-row,
  self-owned writes (the league case).

## Follow-ups

- **Tighten the host-gated bracket/league `save` paths to a user-scoped
  client too?** Today create/seed/generate/reset/reorder run on the admin
  client and are authorized only in the application layer (`assertHost`).
  That's the _original_ P2 #4 shape (app-layer authz, admin client) and is
  acceptable, but a future hardening pass could add `is_event_host` RLS
  enforcement there for defense-in-depth. Deferred — not a known gap, just
  not belt-and-suspenders. Tracked under
  [security.md § P2 #4](../audits/security.md).
- **Per-match RPCs instead of full-replace for the captain path.** The
  bracket captain path still ships the whole domain-computed bracket to the
  DEFINER RPC (trusted because server-computed). A narrower
  `record_bracket_match_result` that takes only `(matchId, sets)` and does
  the advancement in SQL would remove the trust-the-payload property — but
  duplicates aggregate logic. Not worth it unless a third caller appears.
