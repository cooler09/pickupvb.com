# AGENTS.md

Conventions and gotchas for AI coding agents working in this repo. Read this
before making changes. Related reading:

- [README.md](README.md) — human setup docs.
- [packages/domain/README.md](packages/domain/README.md) — how the domain layer
  is organized and how to extend an aggregate.
- [docs/adr/](docs/adr/) — architecture decision records (why hexagonal, why
  Supabase Auth, why typed domain errors, …).
- [docs/audits/](docs/audits/) — point-in-time codebase audits and the
  remediation backlog. **See "Audits" below before running a new one.**
- [docs/journal/](docs/journal/) — dated narrative entries explaining why
  each change-bundle was made. **See "Journal" below before shipping a
  non-trivial bundle.**

## Verify

After any non-trivial change, run **all four** from the repo root:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Turborepo caches, so re-runs are fast. Don't ship a change until all four pass.
`pnpm test` runs the Vitest suites in `packages/domain` and `packages/application`.

## Audits

If the user asks for an "audit" — full repo or scoped to a topic — follow the
conventions in [docs/audits/README.md](docs/audits/README.md):

- **Check [docs/audits/](docs/audits/) first.** Each topic (security,
  performance, architecture, accessibility, SEO, documentation,
  organization, plus per-feature audits like `registration-workflow.md`,
  `events-page-ux.md`) has an existing file. Read the relevant one before
  re-auditing — open findings are the starting backlog.
- **Grade every finding P1 / P2 / P3** using the rubric in the audits
  README (P1 = ship-blocking; P2 = next-sprint hardening; P3 = nice-to-have).
- **Each finding needs a file link** (`path/file.ts#L10-L20`) and a
  **concrete recommended fix** so it can be picked up later without
  re-running the audit. No vague "consider refactoring" entries.
- **Write findings into the appropriate audit file** — update the existing
  file rather than dumping a one-off report into chat. Add a dated
  **status update** block at the top and a **remediation log** entry when
  fixes land. Create a new file under `docs/audits/` only if the topic
  doesn't fit an existing one (use the existing files as a template).
- **Update the index table** in [docs/audits/README.md](docs/audits/README.md)
  with the new date and status.
- An ad-hoc chat-only summary is fine for a quick sanity scan, but **call
  that out explicitly** ("quick scan, not a full audit") and offer to write
  it up into the relevant audit file.

## Journal

Audits record **what** is broken; the journal records **why** a change was
made and **how** the codebase reached its current state. After shipping a
non-trivial bundle of changes, write a dated entry under
[docs/journal/](docs/journal/). See
[docs/journal/README.md](docs/journal/README.md) for the format.

Use the journal for:

- The rationale behind a bundle of changes — including alternatives you
  rejected and why.
- Patterns and common issues surfaced during the change (e.g. a lint rule
  that keeps tripping, a primitive that was missing). Promote durable
  patterns into the "Patterns surfaced by audits" section of this file.
- Follow-ups deferred from the bundle so the next agent can pick them up.

Audit files still capture the dated remediation log per topic — the journal
sits alongside as the narrative thread across topics.

## Do not commit or push

**Never run `git commit` or `git push` on the agent's own initiative.** The
user reviews and commits changes themselves. Leave the working tree dirty
after verification — that's the expected hand-off state. Only run git
write commands when the user explicitly asks you to.

## Repository shape

Monorepo (pnpm + Turbo). Packages depend strictly inward:

```
apps/web ──► @pickupvb/application ──► @pickupvb/domain
            └► @pickupvb/infrastructure ┘  (no deps on app)
            └► @pickupvb/types
            └► @pickupvb/supabase
```

- **`packages/domain`** — aggregates, value objects, repository **ports**, and
  the `DomainError` hierarchy. Pure TypeScript. No framework imports.
- **`packages/application`** — CQRS command/query handlers. Pure. Throws
  typed `DomainError` subclasses.
- **`packages/infrastructure`** — adapters that implement domain ports
  (e.g. `SupabaseEventRepository`).
- **`apps/web`** — Next.js 16 App Router. Composition root for handlers lives
  in [apps/web/src/lib/handlers.ts](apps/web/src/lib/handlers.ts).

Never have `domain` or `application` import from `apps/web`, Next.js, or
Supabase. They must stay framework-free.

## TypeScript

`tsconfig.base.json` enables `exactOptionalPropertyTypes: true` and
`strict: true`. Two consequences agents hit constantly:

1. **Conditional optional props must be spread, not passed as `undefined`:**

   ```tsx
   // ❌ Type error under exactOptionalPropertyTypes
   <Foo prop={cond ? value : undefined} />

   // ✅ Correct
   <Foo {...(cond ? { prop: value } : {})} />
   ```

2. **Don't fabricate optional fields with `undefined`** when constructing
   domain values — omit the key.

Next.js has `typedRoutes: true`. String hrefs to dynamic routes need template
literals matching the route pattern (e.g. `` `/groups/${id}` ``, not `/groups/` + id).

## Domain errors

Defined in [packages/domain/src/shared/result.ts](packages/domain/src/shared/result.ts).
**Always throw a typed subclass; never throw `Error('NOT_FOUND')`-style strings.**

| Class                                | Code                  | When                                              |
| ------------------------------------ | --------------------- | ------------------------------------------------- |
| `NotFoundError(resource, id?, msg?)` | `NOT_FOUND`           | Missing aggregate, missing attendee row, etc.     |
| `ConflictError`                      | `CONFLICT`            | Duplicate join, already registered                |
| `CapacityExceededError`              | `CAPACITY_EXCEEDED`   | Event full                                        |
| `UnauthorizedError`                  | `UNAUTHORIZED`        | Caller lacks permission                           |
| `ValidationError`                    | `VALIDATION`          | Bad input that wasn't caught at the boundary      |
| `InvariantViolation`                 | `INVARIANT_VIOLATION` | Generic state-machine guard (publish/cancel/etc.) |

Server actions and route handlers consume them with `instanceof`:

```ts
try {
  /* ... */
} catch (err) {
  if (err instanceof CapacityExceededError) return { ok: false, reason: 'full' };
  if (err instanceof ConflictError) return { ok: false, reason: 'already' };
  if (err instanceof NotFoundError) notFound();
  throw err;
}
```

The HTTP boundary is centralized in
[apps/web/src/lib/api-helpers.ts](apps/web/src/lib/api-helpers.ts) — it maps
`DomainError` subclasses to status codes (404/401/400/409/422) and returns a
`{ error: code, message, details }` JSON body. **Don't add ad-hoc status mapping
in route handlers** — throw the typed error and let the helper map it.

## Page composition conventions

Routes under `apps/web/src/app/`. Pages should be thin orchestrators (target
< ~200 LOC, ideally < 150). When a page grows past that:

- **Co-locate sub-components under `_components/`.** The underscore prefix
  prevents Next.js from treating them as routes. Example:
  [apps/web/src/app/events/[id]/\_components/](apps/web/src/app/events/[id]/_components/).
- **Co-locate server actions next to (not inside) the page.** Files like
  `co-host-actions.ts`, `members-actions.ts`. Mark with `'use server'` at the
  top, not per-function.
- **Map snake_case DB rows → camelCase props at the page boundary.** Components
  take camelCase props; the page does the explicit mapping. Don't push DB shape
  into reusable components.
- **Extract pure helpers (`memberName`, `initials`, etc.) into the file of
  their primary consumer.** Don't create shared util files for one-time use.
- **Lift `'use client'` only when needed.** Server components by default.
  A client component that pulls in a server action just imports it — Next
  handles the boundary.

### Server action FormData wrappers

Plain HTML `<form action={...}>` submissions deliver `FormData`. Wrap typed
actions with thin adapters bound at the call site:

```ts
// in members-actions.ts
'use server';
import { field } from '@/lib/form-data';

export async function addMemberFromForm(
  groupId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const userId = field(formData, 'user_id');
  const role = (field(formData, 'role') || 'member') as 'owner' | 'admin' | 'member';
  if (!userId) return;
  await addGroupMember(groupId, userId, role, returnPath);
}

// in the JSX
<form action={addMemberFromForm.bind(null, groupId, returnPath)}>...</form>
```

Always pass `returnPath` so the action can `revalidatePath()` the right URL.

**Always use the helpers in [apps/web/src/lib/form-data.ts](apps/web/src/lib/form-data.ts)**
— `field()`, `fieldOrNull()`, `fieldOrUndefined()`, `bool()` — instead of
raw `formData.get(...)`. They handle the `useFormState` slot-prefix quirk
(fields arrive as `1_email` rather than `email`) so the same action works
whether the form is wired with `useFormState`, `.bind()`, or a plain
`<form action={fn}>`.

### Server-action error handling

Two patterns coexist intentionally — pick by call site:

- **Plain `<form action={...}>` (no client state)** → use **flash-param
  redirects**. The action `redirect(\`${returnPath}?rsvp=error\`)`on failure
and the page reads the param to render an alert. See
[apps/web/src/app/events/[id]/rsvp-actions.ts](apps/web/src/app/events/[id]/rsvp-actions.ts).
Catch typed`DomainError` subclasses and map them to specific reason
  codes; rethrow anything unknown.
- **Client-component-invoked actions** (called from `'use client'` with
  `useTransition`, optimistic UI, or `useFormState`) → return a typed
  `Result<T, DomainErrorCode>` so the client can branch without parsing
  redirect URLs. Don't `throw` — the React boundary will turn it into an
  unhandled error.

Either way, **don't add ad-hoc status mapping in route handlers** — throw
the typed `DomainError` and let
[apps/web/src/lib/api-helpers.ts](apps/web/src/lib/api-helpers.ts) map it.

## Supabase

- **Server reads/writes:** `getServerSupabase()` from [apps/web/src/lib/supabase.ts](apps/web/src/lib/supabase.ts).
  Honors the user's session via `@supabase/ssr` cookies. RLS applies.
- **Browser:** `createSupabaseBrowserClient()` from
  [packages/supabase/src/browser.ts](packages/supabase/src/browser.ts).
- **Admin (RLS bypass):** rare; only inside infrastructure adapters that need
  service-role access. Never call from a page or client component.
- **Anonymous auth is enabled.** A user may be authenticated but have
  `is_anonymous: true` in their JWT — guard "real account required" actions
  by checking this claim, not just `user != null`.
- **Generated types** live in `packages/supabase`. Regenerate with
  `pnpm --filter @pickupvb/supabase gen:types` after running migrations.
- **Joins return nested objects, not arrays**, when the FK is single-valued and
  the relation is `!inner`. The narrowing pattern:

  ```ts
  const { data: rows } = await supabase
    .from('group_members')
    .select('user_id, role, profiles:profiles!inner(display_name)');
  type Row = { user_id: string; role: string; profiles: { display_name: string } | null };
  const typed = (rows as Row[] | null) ?? [];
  ```

## Migrations

```bash
supabase migration new <name>          # create new migration
pnpm db:migrate                        # apply locally
pnpm --filter @pickupvb/supabase gen:types  # regenerate DB types
```

**Production migrations are applied automatically by CI/CD** — any new file
in `supabase/migrations/` is picked up and applied on deploy. Don't run
production migrations by hand. Locally, you still need to `pnpm db:migrate`
and regenerate types so typecheck passes against the new schema.

Never edit an applied migration. Add a follow-up migration instead.

### Migration preamble

Every new migration starts with a SQL-comment preamble so the file
explains itself to whoever opens it six months from now. The format,
codifying the convention already in use across the recent
`supabase/migrations/` files:

```sql
-- ============================================================================
-- <Title> — short imperative description (e.g. "Event divisions: child entity
-- of events" or "ADR 0007: Team registration model — ad-hoc vs. roster").
-- See docs/adr/000N-<slug>.md   ← only if this migration backs an ADR.
--
-- Context: why this change is happening — what problem in the app drove it,
-- which earlier migration this builds on, and any non-obvious constraint
-- (e.g. "backfill must run before NOT NULL is added" or "RLS policy depends
-- on profiles.is_anonymous landing first").
--
-- Impact: what changes for callers — new columns / dropped columns / RPC
-- signature changes / RLS posture shifts / view rebuilds. Flag anything
-- that breaks existing reads or writes so app-layer changes can land in
-- the same PR. Note backfill behaviour (additive vs. destructive) and
-- whether old code paths keep working until a follow-up migration.
-- ============================================================================
```

Conventions:

- **Banner rule (`-- ====…`) top and bottom is optional but preferred** —
  it makes the preamble visually distinct from the schema body when
  scrolling.
- **ADR link is required when the migration implements one.** Don't make
  readers grep ADRs to find the why.
- **Context + Impact are the two blocks that matter.** If the migration
  is genuinely one-line trivial (e.g. fixing a typo'd default) a single
  sentence is fine — the section names are scaffolding, not a checklist.
- **Don't restate the file timestamp or the migration name.** Both are
  in the filename.

Exemplars to model from:

- [supabase/migrations/20260513001100_anon_auth_pivot.sql](supabase/migrations/20260513001100_anon_auth_pivot.sql)
  — long, hairy pivot with backfill + drop list.
- [supabase/migrations/20260605000100_event_divisions.sql](supabase/migrations/20260605000100_event_divisions.sql)
  — ADR-driven additive change.
- [supabase/migrations/20260605000600_fix_fill_default_division_id.sql](supabase/migrations/20260605000600_fix_fill_default_division_id.sql)
  — small bugfix; one paragraph is enough.

Backfilling preambles on older migrations is optional — only do it if
you're already touching the file in a follow-up migration's PR for some
other reason. Never edit applied migrations just to add a preamble.

## Testing

There's no end-to-end suite yet. Domain and application packages have unit
tests (`pnpm --filter @pickupvb/domain test`). When adding business rules,
add a test in `packages/{domain,application}/src/**/*.test.ts`.

## Common pitfalls

- **Forgetting `revalidatePath()` after a server action mutates data.** The
  page won't refresh on the next render. Pass a `returnPath` arg through and
  call `revalidatePath(returnPath)` at the end of the action.
- **`revalidatePath` does not evict `unstable_cache` entries.** It only
  busts the page render cache. Anything wrapped in `unstable_cache(..., {
tags: [...] })` must be invalidated by tag. In Next 16, **use
  `updateTag(tag)` from a server action** (single-arg, read-your-own-writes
  semantics) — _not_ `revalidateTag`, whose Next 16 signature now requires
  a profile arg (`revalidateTag(tag, profile)`) and is intended for the new
  `'use cache'` model, not legacy `unstable_cache`. Pair `updateTag` with
  `revalidatePath` in the same action. Reference fix:
  [apps/web/src/app/events/[id]/ad-hoc-team-actions.ts](apps/web/src/app/events/[id]/ad-hoc-team-actions.ts).
- **Never call `cookies()` (transitively or otherwise) inside
  `unstable_cache`.** Next 16 forbids it; the cached helper will throw or
  return an empty payload. If a cached read is viewer-independent (RLS is
  `using (true)` or the data is shared across viewers), use
  `getAdminSupabase()` from [apps/web/src/lib/supabase-admin.ts](apps/web/src/lib/supabase-admin.ts)
  via a dynamic `import()` inside the cache callback. Reference fix:
  `loadAdHocRowsCached` in
  [apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts](apps/web/src/app/events/[id]/_loaders/load-event-detail.ts).
- **Calling client-only Supabase APIs from a server component** (or vice
  versa). Stick to `getServerSupabase()` in `page.tsx` / actions and
  `createSupabaseBrowserClient()` inside `'use client'` files.
- **Adding a string error code in the application layer.** Define a typed
  `DomainError` subclass instead.
- **Shipping a "fix" without `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.**
  The build catches issues the editor doesn't (route type generation,
  `next/font` validation, etc.); the tests guard domain/application invariants.
- **Refactoring beyond what was asked.** Match the surrounding style; don't
  drop in unrelated improvements.

## Patterns surfaced by audits (keep these in mind)

These are recurring regressions caught in [docs/audits/](docs/audits/). Each
one has a reference fix already in the tree — match that shape when adding
new code.

### 1. Mutating server actions must revalidate

Every server action that writes to Supabase must end with
`revalidatePath(returnPath)` (or the appropriate parent route). Pass
`returnPath` as an argument from the page so the action knows what to
evict.

**If the page reads from `unstable_cache` with tags, also call
`updateTag(tag)`.** `revalidatePath` only busts the page render cache,
not tagged `unstable_cache` entries. Match the tag string used at the
cache site (we use `` `event:${id}` `` for event-scoped helpers). In
Next 16 use `updateTag(tag)` from `next/cache` — the new `revalidateTag`
requires a profile arg and targets the `'use cache'` model. Reference
fix: every mutator in
[apps/web/src/app/events/[id]/ad-hoc-team-actions.ts](apps/web/src/app/events/[id]/ad-hoc-team-actions.ts)
calls both `revalidatePath(returnPath)` and ``updateTag(`event:${eventId}`)``.

**Exception — Stripe-redirecting actions:** when the action redirects to a
Stripe Checkout session and the eventual revalidation is driven by a
webhook (`checkout.session.completed`, `customer.subscription.*`, …),
leave a one-line comment explaining the deferral so the next reader
doesn't add a stale `revalidatePath` before the redirect. See
[apps/web/src/app/events/[id]/checkout-actions.ts](apps/web/src/app/events/[id]/checkout-actions.ts).

### 2. Never `throw new Error(...)` for a domain failure

Throw a typed `DomainError` subclass (see the table above). Bare
`Error` instances bypass [api-helpers.ts](apps/web/src/lib/api-helpers.ts)
and surface as generic 500s. Use:

- `UnauthorizedError` — caller lacks permission / not signed in.
- `InvariantViolation` — server misconfiguration (env var missing,
  third-party API returned an unusable response).
- `ConflictError` / `ValidationError` / `NotFoundError` / `CapacityExceededError`
  for the obvious cases.

Reference fix: [apps/web/src/app/profile/billing/actions.ts](apps/web/src/app/profile/billing/actions.ts)
and [apps/web/src/app/profile/billing/pro/actions.ts](apps/web/src/app/profile/billing/pro/actions.ts)
(both reclassified 2026-05-22).

### 3. No `force-dynamic` on public pages

`export const dynamic = 'force-dynamic'` disables CDN caching for every
visitor. Only use it when the page genuinely cannot be cached (e.g. a
profile dashboard that depends on `cookies()`). Public marketing /
landing / pricing / short-link pages must not opt out of caching without
a documented reason. Prefer `export const revalidate = N` plus
`revalidatePath()` from mutating actions.

### 4. No impure reads in render bodies (React Compiler)

Don't call `Date.now()`, `Math.random()`, or `new Date()` inside a
component render. The React Compiler treats render as pure; impure
reads break memoization and trigger
`react-hooks/refs` / `purity` lint warnings. Compute the value at the
page boundary (server) and pass it as a prop, or move it into an effect
/ event handler.

### 5. No synchronous `setState` inside `useEffect` for mount/sync patterns

Triggers `react-hooks/set-state-in-effect`. The right primitive for
"subscribe to an external store and re-render" is `useSyncExternalStore`
with a `getServerSnapshot`. Saves one extra render and works correctly
with concurrent rendering.

### 6. Multi-division event registrations need an explicit `division_id`

For tournaments with multiple divisions, the registration boundary must
pass `division_id` — the DB trigger only fills it for single-division
events. The reference pattern is the `attachTeamToDivision` port on
`EventRepository` (implemented by `SupabaseEventRepository`), driven from
[team-signup-actions.ts](apps/web/src/app/events/[id]/team-signup-actions.ts).
Don't try to insert into `event_teams` without it.

### 7. All event payments route through `events.host_id` — not the host group

Stripe Connect accounts are per-user only (`host_stripe_accounts.user_id`
is the PK; there is no `group_stripe_accounts` table). `events.host_group_id`
is authorization / display metadata — it never flows into ticket checkout,
team checkout, or tips. The creating user's id becomes `events.host_id`
and is the immutable payout destination for the life of the event.
Stripe-readiness checks in
[apps/web/src/app/events/new/actions.ts](apps/web/src/app/events/new/actions.ts)
and [edit/actions.ts](apps/web/src/app/events/[id]/edit/actions.ts)
gate on the host **user**, not the group. Full write-up:
[docs/payments.md](docs/payments.md).
