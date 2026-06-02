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

## UI primitives — Radix UI

For client-side widgets where accessibility + behavior are the hard
part (focus management, `aria-live`, swipe / hotkey dismissal, focus
trap, controlled-vs-uncontrolled state), reach for
`@radix-ui/react-*` headless primitives instead of hand-rolling.
Style them with our existing Tailwind v4 tokens + M3 utilities.

In the tree today:

- [apps/web/src/components/toast.tsx](apps/web/src/components/toast.tsx)
  on `@radix-ui/react-toast` (Bundle 132). M3 Snackbar conformance —
  single-visible queueing, action slot, M3 duration policy,
  foreground/background `aria-live` mapping.

Conventions:

- **Preserve our public API at the call-site layer.** When migrating
  an existing component, keep the existing hook / component / props
  shape exactly so call sites need zero edits. Add new fields as
  optional. Bundle 132's `useToast()` rewrite touched zero call
  sites for this reason.
- **Bridge Radix `data-state` / `data-swipe` attributes to M3 motion
  tokens via plain CSS keyframes** in
  [apps/web/src/app/globals.css](apps/web/src/app/globals.css). See
  the `.md-toast-motion` block for the pattern (one shared class,
  three `@keyframes`, durations / easings sourced from
  `--md-sys-motion-duration-*` and `--md-sys-motion-easing-*`). We
  intentionally do **not** depend on `tailwindcss-animate`.
- **Compose `tap-target` (Bundle 130) onto Radix `*.Close` /
  `*.Trigger` primitives** for icon-only affordances. Radix forwards
  `className` to the underlying `<button>`.
- **Add the runtime dep with `pnpm --filter @pickupvb/web add
@radix-ui/react-…`, then run `pnpm install`** to reconcile
  peer-dep lockfile entries (documented repo pattern — skipping the
  second install has tripped earlier bundles).

When Bundle 6 (Dialog) and Bundle 8 (DropdownMenu) land, follow the
same shape: pick the Radix primitive, preserve the existing public
API, bridge motion via CSS keyframes consuming M3 tokens. Do not
swap in `@mui/material` (rejected in
[m3-alignment.md § "Why not MUI"](docs/audits/m3-alignment.md#why-not-mui)).

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

The repo has three test surfaces. Match new tests to the layer that owns
the logic — don't push a domain invariant into Playwright, and don't try
to assert UI plumbing in a domain unit test.

| Surface        | Runner                  | Where                                                     | What belongs here                                                                                                                       |
| -------------- | ----------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**       | Vitest (`pnpm test`)    | `packages/{domain,application}/src/**/*.test.ts`          | Pure business rules, aggregate invariants, command/query handler edge cases, value-object construction, typed-error paths.              |
| **Unit (web)** | Vitest (`apps/web` pkg) | `apps/web/src/**/*.test.ts` (run via `pnpm --filter ...`) | Framework-glue you can isolate by mocking (`vi.mock('next/server', …)`, `vi.mock('./consent', …)`). Form-data helpers, money, consent.  |
| **End-to-end** | Playwright              | `apps/web/tests/e2e/`                                     | Cross-cutting user journeys against a real Next server + Supabase: signup → join event, host onboarding → publish, paid checkout flows. |

### When to add a test alongside a change

**Always add or update a test when:**

- You're shipping a bug fix that's reachable from production code paths.
  The test should fail against `main` and pass with your fix. This is the
  highest-signal context you can leave for the next agent — it encodes
  _why_ the change was made in executable form. The PostHog serverless
  flush fix (bundle 101) is the reference: the symptom was invisible in
  dev, so [apps/web/src/lib/analytics.test.ts](apps/web/src/lib/analytics.test.ts)
  exists specifically to fail if anyone removes the `after()` wrapper.
- You're adding a new domain rule (capacity, eligibility, state
  transition). The test goes in `packages/domain`. The fact that
  `JoinEvent` rejects over-capacity isn't documentation worth writing —
  it's a test worth writing.
- You're adding a new application-layer handler. Cover the happy path
  - the typed-error branches (`NotFoundError`, `ConflictError`, …).
- You're adding a non-trivial flow that touches Stripe, RLS, or the
  consent gate. These are the layers where regressions are silent in
  prod (no error thrown, just dropped events / missed charges).

**Skip the test when:**

- The change is a pure type tweak, doc edit, comment, or rename that
  the typecheck already covers.
- The behaviour is exhaustively constrained by `exactOptionalPropertyTypes`
  - discriminated unions (writing a test for "the discriminator matches"
    is noise).
- You're shipping a one-off scaffold the user explicitly asked for and
  the surrounding area has no tests to match style with.

### How to write the test

- **Use the test as a forcing function for the decision record.** A good
  test name reads like the why: `'hands every capture to next/server after()'`,
  not `'capture works'`. The next agent who breaks the behaviour reads
  the failing test name first.
- **Mock at module boundaries, not call sites.** `vi.mock('next/server', …)`
  - `vi.mock('./consent', …)` keeps the test honest about what the unit
    owns vs. what it delegates. See
    [apps/web/src/lib/analytics.test.ts](apps/web/src/lib/analytics.test.ts).
- **Don't test framework internals.** Don't assert `revalidatePath` was
  called inside a server action's unit test — that's plumbing the
  integration layer already validates. Do assert that your action
  _throws the right `DomainError`_ or _redirects to the expected
  flash-param URL_.
- **Playwright is for "did the user get what they wanted," not "did the
  handler return the right shape."** Add an e2e case when the regression
  would only surface as a broken click-path (auth cookie quirks, RLS
  policy gaps, Stripe redirect round-trips). For internal logic, write
  a Vitest case instead — it runs 100× faster and pins the cause, not
  the symptom.

### Pre-existing suites to model from

- Domain: `packages/domain/src/events/capacity.test.ts` and
  `packages/domain/src/events/event-team-registration.test.ts` —
  invariant + state-transition coverage.
- Application: `packages/application/src/commands/join-event.handler.test.ts`
  — typed-error branches via a fake repo.
- Web unit (with mocks): `apps/web/src/lib/analytics.test.ts` —
  `vi.mock` for framework + sibling-module isolation.
- E2E: `apps/web/tests/e2e/` — Playwright projects (`public`, etc.) and
  the test-account env-var pattern shown in the terminal history of
  this repo.

Run order during verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
E2E (`pnpm --filter @pickupvb/web e2e`) is not part of the default verify
chain — run it manually against a deployed environment when the change
touches a covered journey. Three non-obvious gotchas trip every first e2e run:

- **Use Node 22** (`.nvmrc` = 22.11.0; `nvm use` first). On Node 20 the Supabase
  Realtime cleanup client ([tests/e2e/\_helpers/cleanup.ts](apps/web/tests/e2e/_helpers/cleanup.ts))
  throws `Node.js 20 detected without native WebSocket support`, failing every
  fixture-provisioning / teardown test (brackets, leagues, team/group creation)
  with an error unrelated to the app. A green-looking Node-20 run is mostly
  environment noise, not a passing suite.
- **`.env.local` is NOT auto-loaded** by Playwright, and the suite hits the
  **deployed** target (`PLAYWRIGHT_BASE_URL`, default `https://dev.pickupvb.com`)
  — local app-code changes don't show until deployed. Export `TEST_*` and
  `E2E_CLEANUP_SUPABASE_*` inline; without the cleanup creds the mutating specs
  sanctioned-skip and leak fixtures.
- **Authoring an e2e ≠ running it.** Two Phase-1 bracket tests shipped red — a
  500 the spec would have caught, and a champion assertion on a banner that
  never existed — because the spec was written but never run green against dev.
  Run a new mutating spec against dev before calling it done.

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
- **Passing a function (callback / render-prop) from a Server Component to a
  Client Component.** RSC can't serialize a function across the boundary, so it
  throws `Functions cannot be passed directly to Client Components` at
  **runtime** — invisible to `pnpm typecheck && lint && build`; it surfaces only
  in dev logs or a real render / e2e. Any `'use client'` primitive that takes a
  function prop forces **every caller to also be a client component.** Reference
  fix: `FormModal`'s `trigger` / `children` render-props
  ([form-modal.tsx](apps/web/src/components/form-modal.tsx)) — all three callers
  carry `'use client'`
  ([no-bracket-view.tsx](apps/web/src/app/events/[id]/bracket/_components/no-bracket-view.tsx),
  [setup-view.tsx](apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx),
  [host-ad-hoc-teams-panel.tsx](apps/web/src/app/events/[id]/_components/host-ad-hoc-teams-panel.tsx)).
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
not tagged `unstable_cache` entries. **Don't hand-write the tag string —
import the builder from [apps/web/src/lib/cache-tags.ts](apps/web/src/lib/cache-tags.ts)**
(`eventCacheTag(id)` / `profileCacheTag(id)` / `hostStripeCacheTag(id)`).
The tag is the contract between the cache site (the event-detail
side-loads) and every eviction site; a literal copy-pasted in ~25 places
silently breaks read-your-own-writes on a typo. Add a new builder there
rather than introducing a new magic string (architecture audit P2-6). In
Next 16 use `updateTag(tag)` from `next/cache` — the new `revalidateTag`
requires a profile arg and targets the `'use cache'` model. Reference
fix: every mutator in
[apps/web/src/app/events/[id]/ad-hoc-team-actions.ts](apps/web/src/app/events/[id]/ad-hoc-team-actions.ts)
calls both `revalidatePath(returnPath)` and `updateTag(eventCacheTag(eventId))`.

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

### 8. Don't enforce authorization on the admin (service-role) client

`createSupabaseAdminClient()` bypasses RLS. A write that delegates its
"may this user do this?" check to a Postgres RLS policy is **unprotected**
if it runs on the admin client — the policy never fires. This bit us
twice (security audit P2 #4): once in the checkout/tip/manage-payments
actions (Bundle 14), and again in the bracket/league **match-result**
writes, where the repos self-construct the admin client so the gap hid
behind the port. Rules:

- **Caller-is-the-resource-owner / captain writes** must run on a
  user-scoped client (`getServerSupabase()`), so RLS enforces. Build the
  handler per request — see `getMatchResultHandlers()` in
  [apps/web/src/lib/handlers.ts](apps/web/src/lib/handlers.ts).
- **When a single-row UPDATE under RLS isn't enough** (the action's
  legitimate side-effects touch rows the caller has no grant on — e.g.
  bracket winner advancement into a downstream match), use a
  `SECURITY DEFINER` RPC with an **explicit** `is_event_host(...) OR
is_*_captain(...)` gate, then delegate to the shared save. Reference:
  [`record_bracket_match_result`](supabase/migrations/20260814000100_record_bracket_match_result_rpc.sql)
  vs. the pure-INVOKER
  [`record_league_match_result`](supabase/migrations/20260814000000_record_league_match_result_rpc.sql).
- **Admin client is correct only** for session-less contexts (Stripe
  webhooks, crons) and host-gated operations already authorized in the
  application layer.
- When chasing an RLS-bypass, **audit the repository adapters**, not just
  page/action code — an adapter that lazily builds its own admin client
  hides the same gap.

### 9. A handler that saves a raising aggregate must dispatch the outbox

Domain events accumulate on the aggregate (`this.raise(...)`) but are only
delivered when a handler drains them — **`raise()` does not imply delivery**.
Every command handler that persists an aggregate which can raise events
(`VolleyballEvent`, `Bracket`) must call `dispatchAnalyticsOutbox(aggregate,
this.analytics)` immediately after `repo.save(aggregate)` (architecture audit
P2-4). The port is injected as an optional `analytics?: AnalyticsPort` and
threaded from the composition root ([handlers.ts](apps/web/src/lib/handlers.ts)).
The dispatcher + mapper are generic over `AggregateRoot`, and the mapper is
fail-quiet — events outside the analytics taxonomy map to `null`, so wiring a
handler that currently raises nothing the mapper captures is a safe no-op that
future-proofs the next captured event (it becomes a one-line mapper addition,
delivered everywhere). Reference: the post-`save()` dispatch in every handler
in [bracket.handler.ts](packages/application/src/commands/bracket.handler.ts).

Corollary — **when generalizing a typed helper to a supertype, re-narrow with
`instanceof` at the point that reads subtype state.** `mapDomainEventToAnalytics`
takes `AggregateRoot<unknown>` but reads `VolleyballEvent`-only props, so it
guards `de instanceof SpotFilled && aggregate instanceof VolleyballEvent` — the
narrow satisfies the compiler _and_ prevents a wrong-aggregate crash when a
`Bracket` flows through the same outbox.

### 10. Payment state is a sanctioned facade-over-port shortcut — not a CQRS gap

The host-payment "aggregates" — `HostStripeAccount` and `HostSubscription`
([packages/domain/src/payments/](packages/domain/src/payments/)) — are
**deliberately not consumed through `application` command/query handlers.**
The thin `lib/` facades [pro.ts](apps/web/src/lib/pro.ts) and
[host-stripe-account.ts](apps/web/src/lib/host-stripe-account.ts) call the
repository ports (`repositories.hostSubscriptionRepo` /
`repositories.hostStripeAccountRepo`) directly. This is **intentional and
correct** (architecture audit P3-3, resolved 2026-05-30 — option (b)). Do not
"fix" it by wrapping each call in a handler; that adds a layer with zero
behaviour and would mislead the next reader (playbook item 4 — partial patterns
cost more than no pattern).

Why a handler earns nothing here:

- **The aggregates carry no invariants.** Both are pure type aliases over a
  Stripe-shaped row + a repository `interface` (verified in P3-4 — nothing to
  unit-test). There is no state machine to protect, so a command handler would
  be a pure pass-through.
- **The reads are CQRS read projections.** `isPro` / `getHostStripeAccount` /
  `getHostSubscription` are viewer-or-host-scoped lookups (often backed by a
  Postgres function like `is_pro_host`), exactly the "trivial read" the playbook
  reserves for direct port access.
- **`isPro` must stay in the web layer regardless.** It's wrapped in
  `React.cache` for per-request dedup across event-detail side-loads
  (performance audit P3 #12); `react` is banned from `@pickupvb/application` by
  the purity ratchet, so the memoized read cannot move inward.
- **The writes are session-less Stripe mirrors.** `seedCustomer` /
  `upsertFromStripe` / `create` / `updateStatusBy*` run from the
  `lib/webhooks/*` handlers on the admin client (no user, no RLS to enforce), so
  a command handler adds no authorization value.

**The trigger to revisit:** if either type ever grows a real invariant or a
multi-step state transition (e.g. an enforced subscription lifecycle, a
proration rule, a cross-aggregate guard), promote that rule into the domain and
add a command handler for the mutation — at that point the facade stops being a
read shortcut and the handler earns its place. Until then, the facade-over-port
shape is the sanctioned convention.

### 11. Use the shared CTA + field vocabularies — don't hand-roll class strings

There is one canonical home for button and form-field class strings; a
`no-restricted-syntax` ratchet in
[apps/web/eslint.config.mjs](apps/web/eslint.config.mjs) enforces it (persona-ux
audit CC-1/CC-2):

- **Buttons:** import from
  [primary-button.tsx](apps/web/src/components/primary-button.tsx)
  (`primaryButtonClass` / `secondaryButtonClass` / `tonalButtonClass` /
  `textButtonClass`) instead of writing `bg-primary hover:bg-primary/90
text-white …`. The four M3 variants take a `'sm' | 'md'` size. For destructive
  actions use the **error family** — `errorButtonClass` (Filled, e.g. a delete
  confirm), `errorOutlinedButtonClass` (a "Delete…" trigger), `errorTextButtonClass`
  (a borderless row "Remove", pair with `tap-target`) — all on the M3 `error`
  role tokens, rather than hand-rolling `bg-red-600` / `text-red-600 dark:…`. See
  [confirm-submit-button.tsx](apps/web/src/components/confirm-submit-button.tsx),
  the delete/cancel danger-zone panels, and the divisions Remove.
- **Fields:** import from
  [field-styles.ts](apps/web/src/components/field-styles.ts) (`fieldInputClass`
  / `fieldLabelClass` / `fieldSubLabelClass` / `fieldHintClass` /
  `fieldErrorClass`) for bare `<input>` / `<textarea>` / `<select>`, or use the
  richer [TextField](apps/web/src/components/text-field.tsx) primitive when a
  field wants adornments / auto-wired `aria`. The recipes share the same chassis
  tokens so they mix without a seam. **Declaring a new local `const
inputClass`/`labelClass`/`selectClass = '…'` is a lint error.** A genuinely
  different control class (e.g. a compact inline table cell, a filter-bar select)
  opts out with `// eslint-disable-next-line no-restricted-syntax -- <reason>`.

This is the same ratchet-behind-migration strategy as the M3 shape-scale lock
(see [docs/audits/m3-alignment.md](docs/audits/m3-alignment.md)): the migration
collapses the drift, the lint rule keeps it from re-accumulating. Reference fix:
[docs/audits/persona-ux.md](docs/audits/persona-ux.md) remediation log
(2026-05-31 bundles).

### 12. Paginate list views with the shared `Pagination` — slice the display, keep the full set for aggregates

Any view that renders a list which can grow unbounded (per user, per event, or
over time) must page it with
[`Pagination`](apps/web/src/components/pagination.tsx). The convention, used in
~9 places (the `/players` `/groups` `/teams` directories, the `/groups/[id]` +
`/players/[id]` past-events sections, and the 2026-05-31 pagination-sweep
fixes):

1. Read a page param off `searchParams` (`Math.max(1, Number.parseInt(... ?? '1', 10) || 1)`).
2. Slice the **already-loaded** array for display.
3. Render `<Pagination basePath pageSize total searchParams [pageParam] [scrollToId]>`.
4. **Compute totals / counts / exclude-sets over the full array, not the page
   slice** — the `(N)` header count, `excludeIds` (add-friend / add-member
   pickers), CSV-statement years, and money totals all need the whole set.

`pageParam` lets one page host several independent paginators
(`mpage`/`ppage`/`hpage`/`apage`); `scrollToId` anchors the jump to the section.
`Pagination` returns `null` at ≤1 page — when it sits in a bordered/padded
wrapper, guard the wrapper with `total > PER_PAGE` so an empty strip doesn't
render.

Prefer the in-memory slice over a SQL `.range()` when the list is **derived**
(grouped/merged in memory — e.g. receipts grouped by `payment_intent_id`, hosted
events merged from primary + co-host queries): a `.range()` over the raw rows
would split a logical record across pages. Reach for SQL `limit`/`offset` +
`count: 'exact'` only when the list maps 1:1 to rows and the fetch itself is the
cost (the directory pages). Don't convert a server component to a client
component just to add a "show all" toggle if it renders per-row bound server
actions — that hits pitfall "Passing a function … from a Server Component to a
Client Component" above (reference: the `/events/[id]` attendee roster kept
`AttendeeList` server-side and paged via an `apage` param instead). Open backlog
of remaining unpaginated lists:
[performance.md § Pagination sweep](docs/audits/performance.md#2026-05-31--pagination-sweep-unbounded-ui-lists).

### 13. Read another user's display card from `profiles_public`, never base `profiles`

The base `public.profiles` SELECT policy is **owner-only**
(`auth.uid() = id OR is_platform_admin()`, PII audit P1 #4). So on any
**session-scoped client** (`getServerSupabase()`) or **`SECURITY INVOKER`**
SQL function, a read of another user's `display_name` / `avatar_url` — whether a
PostgREST embed (`sender:profiles!fk(...)`), a `.from('profiles').in('id', …)`,
or a `join public.profiles` — resolves to **null / no-row for everyone except the
caller** (and to nothing at all for anon viewers). RLS fails safe, so there's no
leak — but the feature silently shows "Member" / blank names. This has now bitten
three times after the bundle-89 sweep (chat `listMessages`, chat `get_inbox` DM
titles, media-post author cards — all fixed 2026-05-31).

The fix is always the same: read the **`profiles_public`** view
(`packages/supabase` generated types include it; granted to `anon` +
`authenticated`; definer-equivalent so it bypasses base-table RLS regardless of
the caller's security mode; already filters `deleted_at IS NULL`). For a
display-card join in app code, fetch the rows then `profiles_public` by collected
ids and merge in JS — PostgREST can't embed a view (no FK metadata). Reference
fixes: `loadSenderCards` in
[supabase-messaging-repository.ts](packages/infrastructure/src/supabase-messaging-repository.ts),
`decorate` in
[supabase-media-post-repository.ts](packages/infrastructure/src/supabase-media-post-repository.ts),
and the `join public.profiles_public` in
[20260827000000_fix_get_inbox_dm_title_profiles_public.sql](supabase/migrations/20260827000000_fix_get_inbox_dm_title_profiles_public.sql).
The **admin client** is the only path that may read base `profiles` directly, and
only for fields not in the view (`first_name` / `last_name` / `business_*`) on
already-authorized host/system reads — e.g. `SupabaseEventRepository`. Full
write-up: [privacy.md #13](docs/audits/privacy.md).

### 14. Storage orphan-sweep walkers: match the liveness check to how the row stores the reference

There are now three `storage.objects` orphan-sweep walkers
(`purge_hero_image_orphans`, `purge_sponsor_logo_orphans`,
`purge_chat_attachment_orphans`) — all SECURITY DEFINER, `search_path = ''`, with
`perform set_config('storage.allow_delete_query', 'true', true)` as the
supported escape hatch past the `protect_delete` BEFORE-DELETE trigger, and a
`grace_hours` window (default 24h) so freshly-uploaded objects aren't reaped
before the referencing row lands. When adding a fourth, clone the shape — but the
**liveness join is not copy-paste**, it depends on what the parent row stores:

- **Public buckets store a full URL with a `?t=<ms>` cache-buster**
  (`HeroImageUpload` / sponsor logos). Liveness must match the bare path tail
  **OR** the path + `'?%'`: `url like '%/'||name OR url like '%/'||name||'?%'`. A
  bare `like '%/'||name` with no trailing wildcard **never matches a live row**
  and the cron deletes every live image after the grace window — this shipped as
  a **P1 data-loss bug** in the hero walker
  ([20260819000000](supabase/migrations/20260819000000_fix_hero_image_orphan_cache_buster.sql)).
- **Private buckets store the bare object path** (chat attachments —
  `messages.attachments[].path`, built as `{conversation_id}/{user_id}/{uuid}.{ext}`,
  no URL, no cache-buster). Liveness is an exact `o.name = path` membership test
  (unnest the jsonb with `cross join lateral jsonb_array_elements(...)`); no
  LIKE-wildcard needed, and filter `path is not null` to dodge the `NOT IN (… NULL …)`
  trap. Reference:
  [20260829000000_chat_retention.sql](supabase/migrations/20260829000000_chat_retention.sql).

Before cloning, open the upload component and confirm whether it persists a URL
or a path. Pair a content-scrub job (e.g. the soft-deleted-message scrub) ahead
of the sweep so de-referenced objects are reclaimed the same night.

**One bucket can serve several parent tables — `union` the liveness branches in
the single owning walker rather than adding a second walker over the same
bucket.** Two independent walkers over one bucket fight (each reaps what the
other considers live — the hero-vs-avatar conflict that forced separate buckets
in 20260830000000). But when avatars added a **group**-scoped path
(`{uid}/groups/{gid}/avatar.webp`) to the existing `avatars` bucket, the right
fix was a second liveness branch inside `purge_avatar_orphans` — a `union` of
the `profiles.avatar_url` join and a `groups.avatar_url` join (the latter keyed
on the group id in the 3rd path segment, guarded by `[2] = 'groups'`), not a new
bucket/cron. The walker still owns the whole bucket, so the columns can't fight.
Match each branch's liveness check to that parent's path shape (per the rule
above). Reference:
[20260831000000_group_avatars_orphan_liveness.sql](supabase/migrations/20260831000000_group_avatars_orphan_liveness.sql).
