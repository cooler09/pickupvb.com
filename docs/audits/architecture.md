# Architecture audit — 2026-05-17

> **Status (2026-05-17):** Quick-win bundle landed — typed-error reclassification in bracket generators (P1), `field()`/`bool()` helper sweep (P2), and server-action error-handling pattern documented in `AGENTS.md` (P2). Mapper extraction (P2) and Vitest bootstrap (P1) deferred — see the Remediation log at the bottom for rationale and the still-open list.

> **Status update (2026-05-22):** No new architecture shipments this pass.
> Net regressions and new findings noted: P1 page diet worsened —
> [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) is
> now 837 LOC (was ~520 at 2026-05-17). Two new P2s added below: 6
> server-action files still don't call `revalidatePath` after a mutation
> (stale read-after-write); and `profile/billing/actions.ts` still throws
> bare `Error()` (4 sites) rather than typed `DomainError` subclasses.
> A partial typed-error win shipped on the registration path —
> `RegisterTeamHandler` now throws `NotFoundError` / `ValidationError` for
> division-format mismatches (see the [registration-workflow audit](registration-workflow.md)).
> P1 test-suite bootstrap is still open: 5 `*.test.ts` files in `packages/`
>
> - 4 in `apps/`, plus an `apps/web/tests/e2e/` skeleton; no Vitest config
>   for `packages/domain` yet.

## Scope

Read-only review of the hexagonal monorepo at `/Users/zachary/Documents/projects/github/pickupvb.com`. Covered CQRS adherence, layer purity, port/adapter pattern, composition root, domain error hygiene, SOLID, DRY, AGENTS.md convention adherence, client/server boundary, module boundaries, aggregate design, testing architecture, server-action design, and folder/route conventions. Skipped the `copilot-skills` workspace folder.

---

## P1 findings

### Non-typed error throws in bracket generators ✅ Fixed 2026-05-17

- **Where:** [packages/domain/src/brackets/generators.ts](packages/domain/src/brackets/generators.ts) — lines 21, 46, 94, 152, 203, 260, 264, 404, 406, 462, 468 (11 occurrences).
- **Issue:** `throw new Error('...')` for domain precondition failures (`'bracketSlots requires power-of-two p'`, `'Single elimination requires at least 2 teams'`, `'Double elimination requires at least 4 teams'`, etc.). Violates the typed-error contract — these cannot be caught with `instanceof DomainError`, so the HTTP boundary in `api-helpers.ts` will return 500 instead of a meaningful 400/422.
- **Fix:** Replace each with `ValidationError` (for team-count / power-of-two preconditions that originate in user input) or `InvariantViolation` (for "shouldn't happen" internal guards like `'round-1 should exist'`). Mechanical find-replace; <15 min.

### No automated test suite

- **Where:** Entire monorepo. No `*.test.ts` or `*.spec.ts` in `packages/domain`, `packages/application`, or `apps/web`. `AGENTS.md` mentions `pnpm --filter @pickupvb/domain test` but no tests exist to run.
- **Issue:** Aggregates encode complex invariants (capacity math, position rosters, status transitions, bracket generation). Handlers own load → mutate → save semantics. Zero test coverage means every refactor is a manual regression risk, and the audit's other recommendations (mapper extraction, error reclassification) carry no safety net.
- **Fix:** Start with a `packages/domain` Vitest config and ~20 tests covering `VolleyballEvent` invariants (time validation, capacity, status transitions, join/leave, position assignment). Then add application-layer tests using in-memory port fakes. Don't try to backfill 100% in one go — set a floor (e.g. all new aggregates must ship with tests) and grow upward.

### Oversized event detail page

- **Where:** [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) (~520 LOC).
- **Issue:** Exceeds the AGENTS.md soft cap (~200 LOC, ideally <150). Mixes metadata generation, viewer auth, parallel data loading, snake_case→camelCase mapping, position-roster fill math, and 10+ conditional render branches. Sub-components are extracted under `_components/`, but the orchestration layer is dense and hard to skim.
- **Fix:** Extract the data-loading + mapping block into a `loadEventDetail(id, viewer)` helper that returns a fully-hydrated `EventDetailViewModel`. Page becomes a thin orchestrator that renders. Target ≤ 300 LOC. Also move position-fill computation into the read model (see P2 below).

---

## P2 findings

### Server-action files missing `revalidatePath` after mutation 🆕 2026-05-22

- **Where:** [apps/web/src/app/people-actions.ts](../../apps/web/src/app/people-actions.ts), [groups/[id]/members/members-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/members/members-actions.ts), [profile/billing/pro/actions.ts](../../apps/web/src/app/profile/billing/pro/actions.ts), [events/[id]/team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/team-checkout-actions.ts), [events/[id]/tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts), [events/[id]/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts).
- **Issue:** All six declare `'use server'` and perform Supabase writes
  but never call `revalidatePath` (or `revalidateTag`). The checkout and
  tip actions are partially excused — they redirect to Stripe and the
  webhook handles the eventual revalidation — but the others land the
  user back on a stale ISR / data-cache page until the next navigation
  evicts it. Diverges from the documented pattern used by `rsvp-actions.ts`,
  `co-host-actions.ts`, and `team-signup-actions.ts`.
- **Fix:** Add an explicit `revalidatePath(returnPath)` (or the
  appropriate parent route) at the end of each mutating branch. For the
  Stripe-redirecting actions, document the deferred revalidation with a
  one-line comment so the next reader doesn't "helpfully" add a stale
  call.

### `profile/billing/actions.ts` throws bare `Error()` instead of typed `DomainError` 🆕 2026-05-22

- **Where:** [apps/web/src/app/profile/billing/actions.ts](../../apps/web/src/app/profile/billing/actions.ts) — 4 `throw new Error(...)` sites.
- **Issue:** Violates the typed-error contract documented in AGENTS.md and
  enforced everywhere else. Errors here bypass `apps/web/src/lib/api-helpers.ts`
  HTTP mapping and surface as generic 500s. Same root cause as the
  bracket-generator P1 that was fixed 2026-05-17.
- **Fix:** Reclassify as `UnauthorizedError` (anonymous / not-onboarded
  caller), `ConflictError` (Stripe account already linked), or
  `ValidationError` (missing config) as appropriate. Mechanical — fewer
  than 10 minutes.

### Duplicated snake_case → camelCase row mapping

- **Where:** [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) (~L184, attendees), [apps/web/src/app/groups/[id]/page.tsx](apps/web/src/app/groups/[id]/page.tsx) (~L100, members), plus several `*-actions.ts` files.
- **Issue:** Each page reinvents the row → DTO mapping inline. No shared per-aggregate mappers. Bugs caught in one location aren't applied to others.
- **Fix:** Add `apps/web/src/lib/mappers/{attendee,group-member,event-summary}.ts` with one pure function per row shape. Import from page boundary; keep components consuming camelCase DTOs.

### Monolithic `groups/actions.ts`

- **Where:** [apps/web/src/app/groups/actions.ts](apps/web/src/app/groups/actions.ts).
- **Issue:** ~156 LOC, 6 unrelated actions (create/update/follow/unfollow/addMember/removeMember). Sibling routes (`events/[id]`) split actions by concern (`co-host-actions.ts`, `rsvp-actions.ts`, `members-actions.ts`). Inconsistent and harder to grep.
- **Fix:** Split into `groups/create-actions.ts`, `groups/follow-actions.ts`. Move membership actions into `groups/[id]/members-actions.ts` (next to the page that uses them).

### FormData parsing inconsistency ✅ Fixed 2026-05-17

- **Where:** [apps/web/src/app/profile/notifications/actions.ts](apps/web/src/app/profile/notifications/actions.ts) (~L20) uses raw `formData.get('email_enabled') === 'on'`; [apps/web/src/app/groups/actions.ts](apps/web/src/app/groups/actions.ts) and others use the `field()` helper from `lib/form-data.ts`.
- **Issue:** Raw `formData.get()` doesn't account for React 18 slot-prefixing and silently breaks under `useFormState`. Two patterns coexisting invites copy-paste of the wrong one.
- **Fix:** Standardize on `field()`. Optionally add a small `bool()` helper for checkbox parsing.

### Server-action error-handling pattern is inconsistent 🟡 Partial 2026-05-17

- **Where:** [apps/web/src/app/events/[id]/rsvp-actions.ts](apps/web/src/app/events/[id]/rsvp-actions.ts) uses `back()` to redirect with `?rsvp=error` flash params; [apps/web/src/app/events/[id]/co-host-actions.ts](apps/web/src/app/events/[id]/co-host-actions.ts) lets errors propagate.
- **Issue:** No documented strategy. Some actions return `Result`, some redirect with flash, some throw. Users see inconsistent UX on failure (toast vs. URL param vs. error boundary).
- **Fix:** Pick one. Recommend: actions that submit via plain HTML `<form action={...}>` (no client state) use flash-param redirects; actions called from a client component with `useTransition` return a `Result<T, DomainErrorCode>`. Document in `AGENTS.md`.

### Position-fill math duplicated between aggregate and page

- **Where:** Aggregate getters in [packages/domain/src/events/volleyball-event.ts](packages/domain/src/events/volleyball-event.ts) (~L191) vs. page iteration in [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) (~L200) that rebuilds `filledByPosition`.
- **Issue:** The page redoes work the aggregate already knows how to do.
- **Fix:** Expose `filledByPosition: Partial<Record<EventPosition, number>>` on the event detail read model returned by `GetEventDetailHandler`. Page becomes a renderer.

---

## P3 findings

### Missing JSDoc on core aggregates and generators

- **Where:** [packages/domain/src/events/volleyball-event.ts](packages/domain/src/events/volleyball-event.ts) (~L97 `fromPersistence`), [packages/domain/src/brackets/generators.ts](packages/domain/src/brackets/generators.ts) (~L27).
- **Issue:** No documentation of preconditions, invariants, or thrown errors on public methods.
- **Fix:** Add JSDoc to factories and any public method that throws. Especially for `fromPersistence()` (rehydrates without re-validating) vs. `create()` (validates).

### Mixed-style route hrefs in JSX

- **Where:** [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) ~L325 still has `href={'/events/' + ...}` style strings.
- **Issue:** `typedRoutes: true` catches some but not all of these; consistent template literals are safer.
- **Fix:** Replace remaining string-concat hrefs with template literals cast to `Route` when needed.

### Barrel-export strategy undocumented

- **Where:** `packages/{domain,application,infrastructure}/src/index.ts`.
- **Issue:** Each package re-exports a different subset (domain: everything; infrastructure: adapters only). Not wrong, just unwritten.
- **Fix:** Add a one-paragraph "Exports" section to each package README.

---

## Verified good

- **Centralized composition root:** [apps/web/src/lib/handlers.ts](apps/web/src/lib/handlers.ts) wires every handler once with singleton repositories. No ad-hoc handler construction inside pages or actions.
- **CQRS separation in `packages/application`:** command handlers mutate via aggregates, query handlers fetch read models; no read/write mixing observed.
- **Layer purity:** no `next/*`, `@supabase/*`, `react`, `fs`, or `process.env` imports in `packages/domain` or `packages/application`. Only `node:crypto` and intra-monorepo imports.
- **Port/adapter discipline:** repository interfaces live in `packages/domain/src/*/repository.ts`; Supabase implementations live in `packages/infrastructure`. Application code depends only on the ports.
- **Domain error hygiene in app/infra layers:** typed `NotFoundError`, `ConflictError`, `CapacityExceededError`, `UnauthorizedError`, `ValidationError`, `InvariantViolation` used consistently; HTTP boundary in [apps/web/src/lib/api-helpers.ts](apps/web/src/lib/api-helpers.ts) maps them to status codes. The bracket-generator P1 above is the only exception found.
- **Aggregate richness:** `VolleyballEvent` enforces all invariants internally with private state + public methods. No anemic data bags.
- **Page composition conventions:** `_components/` co-location, `*-actions.ts` next to pages, snake_case→camelCase at page boundary, `'use client'` scoped to genuinely interactive files (43 files audited prior).
- **`exactOptionalPropertyTypes` spread pattern** used correctly (`{...(cond ? { prop } : {})}`), not the broken `prop={cond ? x : undefined}` form.
- **FormData wrapper convention:** e.g. [co-host-actions.ts](apps/web/src/app/events/[id]/co-host-actions.ts) — plain `<form action={wrapper.bind(null, ...args)}>`, typed action invoked inside, `revalidatePath(returnPath)` at the end.
- **`instanceof DomainError` checks** in server actions and route handlers rather than string parsing.
- **Client/server boundary clean:** no `'use client'` files import `next/headers` or `getServerSupabase`; no server components import client-only hooks.
- **Module boundaries:** no deep cross-package imports (`@pickupvb/domain/src/...`); no circular dependencies detected.
- **Parallelization idiom:** event detail and group detail pages use `Promise.all()` for independent reads.

---

## Quick-win bundle

1. **Reclassify bracket-generator throws** — `packages/domain/src/brackets/generators.ts`, ~15 min, all mechanical.
2. **Extract attendee + group-member mappers** to `apps/web/src/lib/mappers/`, ~30 min, immediate DRY win and improves the event detail page diet.
3. **Standardize `field()` usage** — sweep `apps/web/src/app/**/actions.ts` for raw `formData.get(...)` and replace.
4. **Document the server-action error-handling pattern** in `AGENTS.md` (one paragraph), then align `rsvp-actions.ts` and `co-host-actions.ts` to it.
5. **Bootstrap domain tests** with Vitest in `packages/domain`, ~20 cases on `VolleyballEvent`. Establishes the safety net the other fixes need.

---

## Open questions

- Are the bracket-generator throws meant to be **`ValidationError`** (caller passed bad team count) or **`InvariantViolation`** (we constructed the bracket wrong internally)? They read as a mix — the user-input ones should be `ValidationError`, the "round-1 should exist" ones should be `InvariantViolation`.
- Is the **lack of tests** a deliberate "ship fast" choice, or an oversight? Affects whether quick-win #5 belongs at the top of the list or is deferred.
- Should the **event detail read model** be enriched with derived fields (`filledByPosition`, payment-status map, viewer flags), shrinking the page to a renderer? Or do you want the page to keep doing aggregation so the read model stays minimal?
- Is **monolithic `groups/actions.ts`** intentional (the file is small enough that splitting is overkill) or accidental drift from the per-concern pattern used elsewhere?

---

## Remediation log

| Date       | Finding                                                          | Status     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-17 | P1: bracket-generator typed errors                               | ✅ Fixed   | All 11 throws in [generators.ts](../../packages/domain/src/brackets/generators.ts) reclassified: user-input preconditions (team counts, power-of-two requirement) → `ValidationError`; internal "shouldn't happen" guards (`bracketSlots` p check, `round-1 should exist`) → `InvariantViolation`. Each throw includes a `details` payload (e.g. `{ teamCount, poolCount }`) for downstream logging. HTTP boundary now maps them to 400/422 instead of 500.                                                                                           |
| 2026-05-17 | P2: FormData parsing inconsistency                               | ✅ Fixed   | Added `bool()` helper to [form-data.ts](../../apps/web/src/lib/form-data.ts) (uses the same slot-prefix lookup as `field()`). Replaced `formData.get(...) === 'on'` in [profile/notifications/actions.ts](../../apps/web/src/app/profile/notifications/actions.ts) and `formData.get(...) != null` in [profile/actions.ts](../../apps/web/src/app/profile/actions.ts) with `bool()`. Other `String(formData.get(...) ?? '').trim()` call sites are functionally equivalent to `field()` and were left as-is to keep diff scope tight.                 |
| 2026-05-17 | P2: server-action error-handling pattern                         | 🟡 Partial | New **Server-action error handling** subsection added to [AGENTS.md](../../AGENTS.md). Documents the two-pattern split: plain `<form action={...}>` → flash-param redirects; client-component-invoked → typed `Result<T, DomainErrorCode>`. Also expanded the FormData wrapper example to use `field()` and added an "always use the helpers" callout. `rsvp-actions.ts` already follows the flash-param pattern; `co-host-actions.ts` is still unaligned (still lets errors propagate) — left for a follow-up sweep so this stays a doc-only change. |
| 2026-05-22 | P1: bracket-generator typed errors (registration-flow extension) | ✅ Partial | `RegisterTeamHandler` refactored to throw `NotFoundError('division', divisionId)` and `ValidationError` for team-vs-division format mismatch instead of bare `Error`. New `attachTeamToDivision` port on `EventRepository` carries `division_id` through to the `event_teams` row. See [registration-workflow audit](registration-workflow.md) for full context.                                                                                                                                                                                      | [packages/application/src/commands/team.handler.ts](../../packages/application/src/commands/team.handler.ts), [packages/domain/src/events/event-repository.ts](../../packages/domain/src/events/event-repository.ts), [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts) |

### Still open

- **P1: Test suite bootstrap.** Deferred from this pass. Adding Vitest + ~20 `VolleyballEvent` cases is a meaningful new dev dep / config / writing exercise — beyond a quick win. Worth its own ticket.
- **P1: Event detail page diet.** Architectural refactor — extract `loadEventDetail(id, viewer)` helper. Deferred (the audit also flags this as overlap with the Suspense refactor in the performance audit).
- **P2: Mapper extraction** (attendee, group-member, event-summary). Inspected during this pass — the two `group_members` consumers (`groups/[id]/page.tsx` and `groups/[id]/members/page.tsx`) want different DTO shapes (`avatarUrl` vs. `joined_at`) and select different columns, so a unified mapper requires either a maximal-shape DTO with optional fields or two mappers. Worth doing but needs a design call, not a mechanical extract.
- **P2: Split `groups/actions.ts`** into per-concern files. Mechanical but touches every importer; deferred.
- **P2: Position-fill math moved into the event detail read model.** Couples to the read-model refactor above.
- **P3: JSDoc on aggregate factories, hrefs cleanup, barrel-export docs.**
- **Follow-up:** Reclassify `co-host-actions.ts` error handling to match the new AGENTS.md pattern (redirect with flash param instead of propagating).
- **P2 (new 2026-05-22):** 6 server-action files missing `revalidatePath`.
- **P2 (new 2026-05-22):** `profile/billing/actions.ts` still throws bare `Error()` (4 sites).
- **P1 regression (2026-05-22):** `events/[id]/page.tsx` grew to 837 LOC; the data-loading/mapping extraction proposed in the original P1 is now larger and more urgent.
