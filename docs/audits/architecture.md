# Architecture audit — 2026-05-17

> **Status (2026-05-17):** Quick-win bundle landed — typed-error reclassification in bracket generators (P1), `field()`/`bool()` helper sweep (P2), and server-action error-handling pattern documented in `AGENTS.md` (P2). Mapper extraction (P2) and Vitest bootstrap (P1) deferred — see the Remediation log at the bottom for rationale and the still-open list.

> **Status update (2026-05-22):** Two P2s opened earlier today have already
> shipped: `profile/billing/actions.ts` + `pro/actions.ts` reclassified to
> typed `DomainError`s (all 11 sites now `InvariantViolation` /
> `UnauthorizedError`), and the six `revalidatePath`-flagged files were
> rescoped — `people-actions.ts` is read-only, `members-actions.ts` is a
> thin wrapper around an action that already revalidates, and the four
> Stripe-redirect actions deferred revalidation to webhooks and now carry
> an explicit comment per the AGENTS.md "Stripe-redirecting actions"
> exception. A typed-error win also shipped on the registration path —
> `RegisterTeamHandler` now throws `NotFoundError` / `ValidationError` for
> division-format mismatches (see the [registration-workflow audit](registration-workflow.md)).
>
> Net regressions still on the table: P1 page diet worsened —
> [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) is
> now 837 LOC (was ~520 at 2026-05-17).

> **Status update (2026-05-22, Bundle 22):** P1 **test suite bootstrap is
> now closed.** Vitest is wired through every package via the root
> `vitest@^2.1.9` dep + `turbo run test`; `packages/domain` has its own
> [vitest.config.ts](../../packages/domain/vitest.config.ts) and now
> ships **122 tests across 6 files** (events: 90; teams: 32 new this
> bundle), and `packages/application` ships 6 tests on the
> `JoinEventHandler`. The earlier status note that there was "no Vitest
> config for `packages/domain` yet" was stale — the config + first 90
> events tests had landed in an unrecorded earlier pass; this bundle
> backfilled the `Team` aggregate (the only aggregate without coverage)
> and reconciled the audit doc.
>
> Still open from the P1 list: events/[id] page diet (837 LOC).

> **Status update (2026-05-22, Bundle 23):** P1 **events/[id] page diet is
> now closed.** The 887-LOC `apps/web/src/app/events/[id]/page.tsx` was
> split: all data loading, two-wave side-loads, snake_case bridging, and
> position-fill computation moved into a new
> [`_loaders/load-event-detail.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
> module exporting a fully-typed `EventDetailViewModel`. The page is now
> 566 LOC — a thin renderer that calls `loadEventDetail()` and
> destructures the view-model. The aspirational ≤300 LOC target would
> require further JSX componentization (deferred to a P2 follow-up).
>
> No P1s remaining on the architecture audit.

> **Status update (2026-05-22, Bundle 24):** The P2 follow-up to Bundle 23
> shipped — the events/[id] page now lands the original audit's
> aspirational ≤300 LOC target. JSX componentization extracted six
> render-branch components from `page.tsx` (`EventStructuredData`,
> `EventFlashBanners`, `EventLocationSection`, `EventSignupArea`,
> `HostToolsSection`, `AttendeesPanel`) plus reuse of the existing
> `_components/` siblings. The page is now **294 LOC** (down from 566
> after Bundle 23, and 887 before Bundle 23 — a 67% cut across both
> bundles). All extracted components are co-located under
> `_components/` and take typed view-model slices.

> **Status update (2026-05-23, Bundle 45):** P2 "Position-fill math
> into the event detail read model" closed. `EventDetailReadModel` now
> exposes `filledByPosition: Partial<Record<EventPosition, number>>`,
> populated by the infrastructure repository inside the existing
> attendee-walk that computes waitlist flags (zero extra work). The
> page-side loader drops its dedicated counting loop and just forwards
> `event.filledByPosition` to the signup area. Remaining P2s: split
> `groups/actions.ts`, mapper extraction (design call).

> **Status update (2026-05-23, Bundle 46):** The long-outstanding
> follow-up to align `co-host-actions.ts` with the documented
> server-action error-handling pattern is **closed**. `addEventCoHost`
> / `removeEventCoHost` now wrap their handler calls in a try/catch
> that maps `UnauthorizedError` / `NotFoundError` / `ConflictError` /
> `ValidationError` to `?cohost=…` flash redirects via
> `redirectEventNotice` (which gained `'cohost'` in its key union);
> unknown `DomainError`s pass through with their message, and
> non-domain throws still bubble. `EventFlashBanners` renders the
> matching alert variants. The original 2026-05-17 P2 "server-action
> error-handling pattern" row is now fully ✅ — `rsvp-actions.ts` and
> `co-host-actions.ts` both follow the same flash-param shape.

> **Status update (2026-05-23, Bundle 47):** P2 "Split `groups/actions.ts`"
> closed. The 166-LOC catch-all is gone; six exports redistributed across
> three per-concern files at [apps/web/src/app/groups/](../../apps/web/src/app/groups/):
> [group-form-actions.ts](../../apps/web/src/app/groups/group-form-actions.ts)
> (`createGroupAction`, `updateGroupAction`, `GroupFormState` — both share
> the form-state type, so they live together),
> [follow-actions.ts](../../apps/web/src/app/groups/follow-actions.ts)
> (`followGroup`, `unfollowGroup`), and
> [member-actions.ts](../../apps/web/src/app/groups/member-actions.ts)
> (`addGroupMember`, `removeGroupMember`, `changeGroupMemberRole`). All
> five importers updated. Now matches the events/[id] convention of one
> action file per concern. Remaining P2: mapper extraction (still needs
> a design call).

## Scope

Read-only review of the hexagonal monorepo at `/Users/zachary/Documents/projects/github/pickupvb.com`. Covered CQRS adherence, layer purity, port/adapter pattern, composition root, domain error hygiene, SOLID, DRY, AGENTS.md convention adherence, client/server boundary, module boundaries, aggregate design, testing architecture, server-action design, and folder/route conventions. Skipped the `copilot-skills` workspace folder.

---

## P1 findings

### Non-typed error throws in bracket generators ✅ Fixed 2026-05-17

- **Where:** [packages/domain/src/brackets/generators.ts](packages/domain/src/brackets/generators.ts) — lines 21, 46, 94, 152, 203, 260, 264, 404, 406, 462, 468 (11 occurrences).
- **Issue:** `throw new Error('...')` for domain precondition failures (`'bracketSlots requires power-of-two p'`, `'Single elimination requires at least 2 teams'`, `'Double elimination requires at least 4 teams'`, etc.). Violates the typed-error contract — these cannot be caught with `instanceof DomainError`, so the HTTP boundary in `api-helpers.ts` will return 500 instead of a meaningful 400/422.
- **Fix:** Replace each with `ValidationError` (for team-count / power-of-two preconditions that originate in user input) or `InvariantViolation` (for "shouldn't happen" internal guards like `'round-1 should exist'`). Mechanical find-replace; <15 min.

### No automated test suite ✅ Resolved 2026-05-22

- **Where:** Entire monorepo. No `*.test.ts` or `*.spec.ts` in `packages/domain`, `packages/application`, or `apps/web`. `AGENTS.md` mentions `pnpm --filter @pickupvb/domain test` but no tests exist to run.
- **Issue:** Aggregates encode complex invariants (capacity math, position rosters, status transitions, bracket generation). Handlers own load → mutate → save semantics. Zero test coverage means every refactor is a manual regression risk, and the audit's other recommendations (mapper extraction, error reclassification) carry no safety net.
- **Resolution:** Vitest is wired through every package via the root
  `vitest@^2.1.9` dep + `turbo run test`. `packages/domain` has its own
  [vitest.config.ts](../../packages/domain/vitest.config.ts);
  `packages/application` runs through the same root config. Coverage as
  of Bundle 22: 122 domain tests across 6 files (events: 90; teams: 32)
  - 6 application tests on `JoinEventHandler`. New aggregates must ship
    with tests — that floor is now enforceable by the verify quad.

### Oversized event detail page ✅ Resolved 2026-05-22 (Bundles 23 + 24)

- **Where:** [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) (was 887 LOC, now **294**).
- **Resolution (Bundle 23):** Extracted data loading + mapping into
  [`_loaders/load-event-detail.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts).
  The helper returns a typed `EventDetailViewModel` containing the
  `EventDetailReadModel` plus all pricing, side-load, ad-hoc, attendee-list-bridge,
  filled-by-position, and CTA-shape fields. The page consumes it via a
  single `await loadEventDetail(...)` + destructure.
- **Resolution (Bundle 24):** JSX componentization. Six new components
  under `_components/` absorb the render branches:
  [`event-structured-data.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-structured-data.tsx),
  [`event-flash-banners.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-flash-banners.tsx),
  [`event-location-section.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-location-section.tsx),
  [`event-signup-area.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-signup-area.tsx)
  (the largest — the external/open-play/tournament/closed switcher with
  paid/positional/RSVP and ad-hoc/captained branches),
  [`host-tools-section.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/host-tools-section.tsx),
  and [`attendees-panel.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/attendees-panel.tsx).
  Page is now ≤300 LOC, well inside the AGENTS.md soft cap.

---

## P2 findings

### Server-action files missing `revalidatePath` after mutation ✅ Resolved 2026-05-22

- **Where:** [apps/web/src/app/people-actions.ts](../../apps/web/src/app/people-actions.ts), [groups/[id]/members/members-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/members/members-actions.ts), [profile/billing/pro/actions.ts](../../apps/web/src/app/profile/billing/pro/actions.ts), [events/[id]/team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/team-checkout-actions.ts), [events/[id]/tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts), [events/[id]/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts).
- **Resolution:** Audit was overzealous. `people-actions.ts` only exposes
  a read-only `searchPeople()` SELECT — no mutation. `members-actions.ts`
  is a thin FormData adapter that delegates to `addGroupMember()` in
  [groups/actions.ts](../../apps/web/src/app/groups/actions.ts), which
  already calls `revalidatePath(returnPath)` (L134). The four
  Stripe-redirecting actions (`tip-actions.ts`, `checkout-actions.ts`,
  `team-checkout-actions.ts`, `pro/actions.ts`) defer revalidation to the
  `checkout.session.completed` / `customer.subscription.*` webhooks per
  the **Stripe-redirecting actions** exception now codified in AGENTS.md;
  each site carries an explicit `// No revalidatePath here: webhook
handles it` comment.

### `profile/billing/actions.ts` throws bare `Error()` instead of typed `DomainError` ✅ Resolved 2026-05-22

- **Where:** [apps/web/src/app/profile/billing/actions.ts](../../apps/web/src/app/profile/billing/actions.ts) (4 sites) and [apps/web/src/app/profile/billing/pro/actions.ts](../../apps/web/src/app/profile/billing/pro/actions.ts) (7 sites).
- **Resolution:** All 11 `throw new Error(...)` sites reclassified.
  Stripe-misconfig / unexpected-Stripe-response sites now throw
  `InvariantViolation`; anonymous-caller guards throw `UnauthorizedError`.
  HTTP boundary now maps to 401 / 422 instead of 500. See the
  remediation log entry below.

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

| Date       | Finding                                                          | Status               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-23 | P2: split `groups/actions.ts`                                    | ✅ Fixed (Bundle 47) | The 166-LOC catch-all at `apps/web/src/app/groups/actions.ts` was deleted and its six exports redistributed across three per-concern files: [group-form-actions.ts](../../apps/web/src/app/groups/group-form-actions.ts) (`createGroupAction`, `updateGroupAction`, shared `GroupFormState`), [follow-actions.ts](../../apps/web/src/app/groups/follow-actions.ts) (`followGroup`, `unfollowGroup`), and [member-actions.ts](../../apps/web/src/app/groups/member-actions.ts) (`addGroupMember`, `removeGroupMember`, `changeGroupMemberRole`). All five importers ([members-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/members/members-actions.ts), [edit-group-form.tsx](../../apps/web/src/app/groups/%5Bid%5D/edit/edit-group-form.tsx), [group-viewer-actions.tsx](../../apps/web/src/app/groups/%5Bid%5D/_components/group-viewer-actions.tsx), [member-row-item.tsx](../../apps/web/src/app/groups/%5Bid%5D/members/_components/member-row-item.tsx), [new-group-form.tsx](../../apps/web/src/app/groups/new/new-group-form.tsx)) updated. Now matches the events/[id] per-concern convention; no behaviour change. |
| 2026-05-23 | P2 follow-up: `co-host-actions.ts` flash-param redirects         | ✅ Fixed (Bundle 46) | `addEventCoHost` / `removeEventCoHost` now `try { … } catch (err) { mapErrorAndFlash(eventId, err) }`. `UnauthorizedError` → `?cohost=unauthorized`, `NotFoundError` → `?cohost=notfound`, `ConflictError` → `?cohost=conflict`, `ValidationError` → `?cohost=invalid`, other `DomainError` → `?cohost=error` (+ `cohost_msg=<message>`); non-domain throws bubble to the React boundary. `redirectEventNotice`'s key union now includes `'cohost'`; [event-flash-banners.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-flash-banners.tsx) renders the five new alert variants and the page threads the params through. This closes the long-standing follow-up from the 2026-05-17 "server-action error-handling pattern" P2 — both event-page action files now share the same flash-param shape.                                                                                                                                                                                                                                                                                                                 |
| 2026-05-23 | P2: position-fill math into event detail read model              | ✅ Fixed (Bundle 45) | `EventDetailReadModel` gained `filledByPosition: Partial<Record<EventPosition, number>>`. `SupabaseEventRepository.getDetail()` was already maintaining a running per-position count while computing waitlist flags — repurposed that `Map` (now incremented unconditionally when an attendee has a position) and serialised it to a plain Record on the way out. Loader's dedicated `for (const a of event.attendees) { … filledByPosition[a.position] = … }` loop deleted in favour of `event.filledByPosition`. Counting + waitlist logic now lives in one place; the page is a renderer. Net: one fewer O(N) walk per event detail render, and the model field is reusable by any future consumer that needs slot-fill ratios.                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-17 | P1: bracket-generator typed errors                               | ✅ Fixed             | All 11 throws in [generators.ts](../../packages/domain/src/brackets/generators.ts) reclassified: user-input preconditions (team counts, power-of-two requirement) → `ValidationError`; internal "shouldn't happen" guards (`bracketSlots` p check, `round-1 should exist`) → `InvariantViolation`. Each throw includes a `details` payload (e.g. `{ teamCount, poolCount }`) for downstream logging. HTTP boundary now maps them to 400/422 instead of 500.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-17 | P2: FormData parsing inconsistency                               | ✅ Fixed             | Added `bool()` helper to [form-data.ts](../../apps/web/src/lib/form-data.ts) (uses the same slot-prefix lookup as `field()`). Replaced `formData.get(...) === 'on'` in [profile/notifications/actions.ts](../../apps/web/src/app/profile/notifications/actions.ts) and `formData.get(...) != null` in [profile/actions.ts](../../apps/web/src/app/profile/actions.ts) with `bool()`. Other `String(formData.get(...) ?? '').trim()` call sites are functionally equivalent to `field()` and were left as-is to keep diff scope tight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-17 | P2: server-action error-handling pattern                         | ✅ Fixed             | New **Server-action error handling** subsection added to [AGENTS.md](../../AGENTS.md). Documents the two-pattern split: plain `<form action={...}>` → flash-param redirects; client-component-invoked → typed `Result<T, DomainErrorCode>`. Also expanded the FormData wrapper example to use `field()` and added an "always use the helpers" callout. `rsvp-actions.ts` already followed the flash-param pattern; `co-host-actions.ts` was aligned in Bundle 46 (see 2026-05-23 row above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-05-22 | P1: bracket-generator typed errors (registration-flow extension) | ✅ Partial           | `RegisterTeamHandler` refactored to throw `NotFoundError('division', divisionId)` and `ValidationError` for team-vs-division format mismatch instead of bare `Error`. New `attachTeamToDivision` port on `EventRepository` carries `division_id` through to the `event_teams` row. See [registration-workflow audit](registration-workflow.md) for full context.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [packages/application/src/commands/team.handler.ts](../../packages/application/src/commands/team.handler.ts), [packages/domain/src/events/event-repository.ts](../../packages/domain/src/events/event-repository.ts), [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts) |

| 2026-05-22 | P2: `profile/billing/actions.ts` (and `pro/actions.ts`) typed errors | ✅ Fixed | All 11 `throw new Error(...)` sites across both billing actions files reclassified to `InvariantViolation` (Stripe misconfig / unexpected Stripe response) and `UnauthorizedError` (anonymous caller). Imports added from `@pickupvb/domain`. HTTP boundary now maps to 401/422 instead of 500. |
| 2026-05-22 | P2: server-action files missing `revalidatePath` | 🟡 Partial | Confirmed [people-actions.ts](../../apps/web/src/app/people-actions.ts) and [members-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/members/members-actions.ts) are not actually mutators (search + thin wrapper around `addGroupMember`, which already revalidates) — audit was overzealous, no change needed. Stripe-redirecting actions ([tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts), [checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts), [team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/team-checkout-actions.ts)) gained an explicit `// No revalidatePath here: webhook handles it` comment before each redirect. `pro/actions.ts` redirects to Stripe and is covered by the same pattern. |
| 2026-05-22 | Patterns surfaced by audits codified in AGENTS.md | ✅ Done | New "Patterns surfaced by audits" section in [AGENTS.md](../../AGENTS.md) covers: mutating actions must revalidate (+ Stripe-redirect exception), never bare `throw new Error` for domain failures, no `force-dynamic` on public pages, no impure reads in render (React Compiler), no sync `setState` in `useEffect`, multi-division registrations need explicit `division_id`. |
| 2026-05-22 | P1: test suite bootstrap | ✅ Fixed (Bundle 22) | Vitest config + 90 events-aggregate tests had landed in an earlier unrecorded pass; this bundle added [teams/team.test.ts](../../packages/domain/src/teams/team.test.ts) (32 cases covering `Team.create` / `rehydrate` validation, invite/accept/remove transitions, roster cap math across all four formats, and `setExtraMemberCount` guards) so every domain aggregate now has coverage. Total: 122 domain tests + 6 application tests, all passing via `turbo run test`. Audit doc reconciled to match reality. |
| 2026-05-22 | P1: event detail page diet | ✅ Fixed (Bundle 23) | Extracted data loading + view-model assembly from [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) into new [`_loaders/load-event-detail.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts). The loader returns a typed `EventDetailViewModel` containing the `EventDetailReadModel` plus pricing, two-wave side-loads (viewer-pro / tip total / host social / eligible teams / ad-hoc bundle, then breakdown / payments / viewer payment status), ad-hoc registrations, the legacy snake_case attendee bridge, `filledByPosition`, `viewerPosition`, and the hero `cta`. Page dropped 887 → 566 LOC (35% cut). Aspirational ≤300 LOC requires further JSX componentization (carried as P2 follow-up). |
| 2026-05-22 | P2: event detail JSX componentization | ✅ Fixed (Bundle 24) | Followed up on Bundle 23 to land the audit's original ≤300 LOC target. Six new render-branch components under [`apps/web/src/app/events/[id]/_components/`](../../apps/web/src/app/events/%5Bid%5D/_components/): `event-structured-data`, `event-flash-banners`, `event-location-section`, `event-signup-area` (the external / open-play / tournament / closed switcher — the largest extraction at ~210 LOC), `host-tools-section`, `attendees-panel`. Page dropped 566 → **294 LOC** (48% cut on this pass; 67% cut across both bundles). |

### Still open

- **P2: Mapper extraction** (attendee, group-member, event-summary). Inspected during this pass — the two `group_members` consumers (`groups/[id]/page.tsx` and `groups/[id]/members/page.tsx`) want different DTO shapes (`avatarUrl` vs. `joined_at`) and select different columns, so a unified mapper requires either a maximal-shape DTO with optional fields or two mappers. Worth doing but needs a design call, not a mechanical extract.
- **P3: JSDoc on aggregate factories, hrefs cleanup, barrel-export docs.**
