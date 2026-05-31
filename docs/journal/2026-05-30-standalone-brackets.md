# 2026-05-30 — Standalone (event-free) tournament brackets

## Why

Users wanted to run a bracket without hosting an event — a pickup tournament
at the gym, a friendly between a few teams — where the full event machinery
(geocoded venue, dates, capacity, ticketing, Stripe-host gating, public
listings) is pure overhead. The bracket aggregate is one of the richest pieces
of the domain (every format, seeding, advancement, standings) but was only
reachable as a child of an event division. This bundle decouples it. See
[ADR 0025](../adr/0025-standalone-brackets.md).

## Approach — generalize the scope, reuse the logic

The key enabling fact: the `Bracket` aggregate's behaviour never reads
`eventId`/`divisionId` — they are pure scope-identity fields. So scope became
`eventId | divisionId | ownerUserId` (exactly one set, DB-checked), with a new
`Bracket.createStandalone(...)` beside `create(...)`. The aggregate, generators,
standings, the `save_bracket` RPC body, and every `_components` view are reused
unchanged.

- **Schema** (`20260821000000`, `20260821000100`): `event_brackets.division_id`
  nullable + `owner_user_id`; partial unique on division; new `bracket_teams`
  table for typed-in competitors; owner branches on every bracket write RLS
  policy; owner-aware `record_bracket_match_result` (LEFT-join the division,
  admit `owner_user_id = auth.uid()`); `save_bracket` scope made create-only.
- **Domain / application / infra**: optional scope + `createStandalone`; a
  parallel `standalone-bracket.handler.ts` (owner-gated, keyed on bracketId,
  reusing the record/reset-match handlers verbatim); repo gained `listByOwner`,
  `listStandaloneTeams`, `addBracketTeam`, an owner-header direct insert, and —
  the highest-risk line — the `event_divisions!inner` → LEFT join so standalone
  rows aren't silently dropped from every finder.
- **Web**: new `/brackets`, `/brackets/new`, `/brackets/[id]`,
  `/brackets/[id]/watch`. The event `_components` were generalized with an
  additive optional `scope?: BracketScope` prop; a `bracket-action-binding.ts`
  helper resolves a scope to bound server actions, importing **both** the event
  and standalone action sets and binding locally — so the per-item binds
  (matchId / pool) never cross the RSC boundary as non-action functions. Event
  call sites are byte-compatible (they pass no `scope`, defaulting to the event
  scope from their existing `eventId`/`divisionId`).

## Decisions worth recording

- **Dedicated `bracket_teams`, not a generalized `event_team_entries`.** The
  walk-in path flows through the heavy `EventTeamRegistration` aggregate
  (`division_id NOT NULL`, captain-identity matrix, 3-branch RLS). Standalone
  teams are typed-in names only, so a tiny table was the right size; the
  alternative bent the event registration path for no gain.
- **Polymorphic `entry_*_id`.** Dropping the FKs to `event_team_entries` lets
  those columns point at either table. Cost: the on-delete cascade/set-null is
  gone; accepted pre-launch (full-replace save; integrity moves to the app).
- **Discriminated `scope` over a server-passed actions bag.** Binding a server
  action _received as a prop_ on the client is uncertain in Next 16; importing
  both action sets and binding locally is certain and keeps the event runtime
  identical.

## Deferred / follow-ups

- **Live scoreboard scoring for standalone brackets is NOT wired yet** —
  `liveScoringEnabled` is hard-`false` on both standalone routes. It is the
  heaviest sub-area (`match_live_scores.event_id`/`division_id` are NOT NULL and
  the provider subscribes by `division_id`); it needs its own migration
  (nullable + `bracket_id`), an `upsert_match_live_score` bracket-owner branch,
  a `LiveScoresProvider` bracket-id mode, and a standalone branch in the
  scoreboard `finalize-actions.ts` Pro-gated on `event_brackets.owner_user_id`.
  Flip the two `liveScoringEnabled={false}` props to `isPro(bracket.ownerUserId)`
  once that lands.
- **Local migration not applied** (Docker was down this session):
  `database.types.ts` was hand-patched to match the migrations so typecheck
  passes; run `pnpm db:migrate && pnpm --filter @pickupvb/supabase gen:types`
  once Docker is up to regenerate from the real schema. Production migrations
  apply via CI/CD on deploy.
- **No e2e yet.** A Playwright spec (create → add teams → seed → generate →
  record → open watch link) should be added and run green against dev.
- A `bracketCacheTag(id)` builder if a cached watch read is later introduced
  (today `revalidatePath('/brackets/[id]')` suffices).
