# Phase A — drain the `as never` corpus + extend the ratchet (2026-06-06)

## Context

The 2026-06-06 architecture re-audit ([architecture.md § Reevaluation —
2026-06-06](../audits/architecture.md#reevaluation--2026-06-06)) graded **P2-3**:
the `as never` ban from Phase 0 (P2-5) only ever reached `domain` + `application`
via `purityRatchet()`; `infrastructure` was explicitly exempt and `apps/web`
has its own config, so casts re-accumulated to **155** (infra 88 + web 67).
Two anti-patterns hid under one cast: **brand casts** (`row.id as never`,
`x as never as SomeId`) that bypass the smart constructors the brands exist to
enforce, and **Supabase write-payload casts** (`.update({…} as never)`) that
silence column type-checking on every mutation. Phase A is the lowest-risk,
highest-compounding step of the re-audit roadmap (A→B→C).

## Decisions

- **Removed the casts; did not add a generic write-helper wrapper.** Empirically
  the bulk were cargo-cult: removing the first trivial cast
  (`broadcasts.update({ sent_at })`) typechecked clean. So the default move is
  _delete the cast_ and let `tsc` flag the ~15 genuinely load-bearing ones,
  rather than route every write through a new abstraction that buys nothing.
- **JSON values → one centralized `asJson()` helper**
  ([supabase-json.ts](../../packages/infrastructure/src/supabase-json.ts)) over
  scattered `as unknown as Json`. Supabase's generated `Json` has no index
  signature, so structurally-typed domain objects (`BracketConfig`,
  `LiveMatchScore`, attachment arrays, outbox `payload`/`data`, badge `context`)
  need an assertion — but the one sanctioned cast now lives in an audited helper,
  not ~6 adapters. This _is_ the "typed-write helper" the audit suggested, scoped
  to where it earns its place (JSON), not forced over the whole write surface.
- **Trigger-defaulted / dynamic / computed-key payloads → generated
  `TablesInsert<>` / `TablesUpdate<>`** (newly exported from `@pickupvb/supabase`).
  `events`/`teams` omit trigger-filled `short_code`/`slug`; `event_divisions`
  rows and the profiles-claim / reminder-column updates are built dynamically as
  `Record<string, unknown>`. Casting to the table's generated type is honest
  (the row _is_ a valid insert/update; the generated type over-constrains
  trigger columns) and keeps real column type-checking everywhere else.
- **Brand casts → smart constructors** (`EventId(row.id)`, `UserId(...)`,
  `DivisionId(...)`, `EventTeamRegistrationId(...)`, `BracketId(id)`, …). Where a
  file imported the brand as `type`-only, flipped it to a value import. `idConstructor`
  is itself just a cast, so this is behaviour-identical — but it routes through the
  one sanctioned construction point and satisfies the ratchet.
- **`as never` ban extended repo-wide.** Lifted the rule into a shared
  `noAsNeverRule` ([eslint.base.mjs](../../packages/config/eslint.base.mjs)),
  applied in the base default block (so every library package — infra,
  notifications, supabase, types — gets it) and imported into apps/web's existing
  `no-restricted-syntax` array. `purityRatchet()` slimmed to just the import ban.
- **Exempted `*.test.ts` from the as-never rule.** Test doubles legitimately cast
  partial mocks to a repository's injection type (`client as never`); the ban
  targets production domain laundering, not specs. The two infra adapter tests
  keep their mock casts.

## Changes

- **Infra (88 → 0):** read-brand casts → constructors in
  `supabase-event-repository`, `-team-repository`, `-event-team-registration-`,
  `-event-team-payment-`, `-media-post-`, `-community-listing-repository`;
  write-payload casts removed across ~21 adapters; `asJson()` at the JSON sites
  (bracket config + `save_bracket`/`record_bracket_match_result` RPC args,
  `upsert_match_live_score`, message attachments, notification outbox, badge
  context); `TablesInsert<>` at `events`/`teams`/`event_divisions` upserts;
  `Database[...]['Args']` casts at the two over-constrained RPC arg objects
  (`search_events` null-vs-undefined, `save_bracket` null `p_division_id`).
- **New:** [supabase-json.ts](../../packages/infrastructure/src/supabase-json.ts)
  (`asJson`); `Json`/`Tables`/`TablesInsert`/`TablesUpdate` re-exported from
  [@pickupvb/supabase](../../packages/supabase/src/index.ts).
- **Web (67 → 0):** brand casts → constructors in the bracket pages
  (`events/[id]/bracket/{page,watch/page,watch/_og}`, `brackets/{page,[id]/page,
[id]/watch/page}`), tools (`load-event-tool-context`), webhook
  `team-payment-mediators`, the team/roster checkout actions + success routes,
  `host-team-registration-actions`; write-payload casts removed across ~20
  actions/routes; `TablesUpdate<>` at the dynamic/computed-key updates
  (`reminders` route, `claim/actions`, `record-division-winner-actions`,
  `edit/actions`).
- **Config:** `noAsNeverRule` added to [eslint.base.mjs](../../packages/config/eslint.base.mjs)
  (default block + `purityRatchet` import note + `*.test.ts` exemption); imported
  into [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs).
- **Docs:** architecture.md status block + P2-3 marked resolved; audits README row.

## Patterns observed

- **`as never` on a Supabase write is almost always cargo-cult.** The generated
  types accept correctly-shaped payloads; the cast usually masks nothing. When it
  _does_ mask something it's one of three: a JSON column (→ `asJson`), a
  trigger-defaulted required column (→ `TablesInsert<>`), or a dynamically-built
  `Record` (→ `TablesUpdate<>`). None of them want `as never`.
- The generated `Json` type lacking a string index signature is the root cause of
  every "object is not assignable to Json" — worth knowing before reaching for a
  cast.

## Follow-ups

- Phase B (**P2-1**, bracket handler unification) and Phase C (**P2-2**,
  event-repo decomposition + `save()` atomicity) remain — see
  [architecture.md](../audits/architecture.md#refactoring-roadmap-2026-06-06).
- The `community_listings` / `media_posts` adapters still use an untyped
  `table()` accessor (now that those tables are in the generated types, they
  could move to the typed client) — out of scope for the `as never` drain; noted
  in the community-listing adapter comment.
