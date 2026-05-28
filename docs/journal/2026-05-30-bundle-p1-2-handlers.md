# 2026-05-30 — League schedule application handlers

**Bundle:** Follow-up to the P1 #2 thin pass. Adds the CQRS handler layer
that sits between the `LeagueSchedule` aggregate and the web app, so the
next bundle can focus on server actions + host UI without inventing
business rules at the route boundary.

## What shipped

- `AddLeagueScheduleMatchHandler` — host-only, returns the new match id.
- `UpdateLeagueScheduleMatchHandler` — host-only. Preserves the
  existing `homeScore`/`awayScore`/`status` when the command omits
  both score fields, so a host editing court/time after a captain has
  already entered a result doesn't blow away the recorded scores.
- `RemoveLeagueScheduleMatchHandler` — host-only.
- `RecordLeagueMatchResultHandler` — score entry path. No host check;
  matches the bracket `RecordMatchResultHandler` convention of
  delegating "captain of either team" auth to Postgres RLS. The
  handler validates only `status ∈ { Completed, Forfeit }` and that
  the match exists.
- 16 Vitest cases under
  `packages/application/src/commands/league-schedule.handler.test.ts`.

## Why four handlers, not three

The audit mentioned three operations (add / remove / record-result).
We split "edit metadata" off from "record result" because the auth
shape is different — host-only vs. captain-via-RLS — and collapsing
them would force the route layer to discriminate, which is exactly
the kind of business rule that belongs in the application package.

## Why RecordResult trusts RLS

Captains aren't first-class users in the domain model; "captain of
home team OR captain of away team" is a join-table predicate. The
bracket handler already established the precedent that we don't
re-derive that predicate in TypeScript when Postgres can enforce it
authoritatively at write time. The new migration adds an
`is_league_match_captain(uuid)` helper specifically so the same
pattern works for league matches.

## Alternatives rejected

- **Single `UpsertMatch` handler.** Considered, rejected: add and
  replace have different "what's the id?" semantics
  (`nextMatchId()` vs. caller-supplied), and conflating them would
  re-introduce the `ConflictError` vs. `NotFoundError` ambiguity that
  the typed-error hierarchy exists to avoid.
- **Auth-checking the captain in the application layer.** Would need
  a `findCaptaincy(userId, matchId)` query that doesn't exist yet,
  and would duplicate the RLS predicate. Cheap to add later if we
  ever want to ship a non-Supabase adapter; not worth it now.

## Deferred follow-ups

- Composition-root wiring in `apps/web/src/lib/handlers.ts`. Handlers
  are exported from `@pickupvb/application` but not instantiated
  anywhere — the first server action will pull them in.
- Server actions + host UI (`apps/web/src/app/events/[id]/_components/`
  - `league-actions.ts`).
- Transactional `save()` via an RPC, so the delete-then-reinsert path
  on the adapter can't leave a partial slate.
- Strict week contiguity + per-week team uniqueness invariants —
  still parked at the aggregate level. Revisit when hosts report
  real scheduling conflicts.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green.
Application package now runs 33 tests (was 17).
