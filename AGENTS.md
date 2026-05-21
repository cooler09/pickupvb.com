# AGENTS.md

Conventions and gotchas for AI coding agents working in this repo. Read this
before making changes. Related reading:

- [README.md](README.md) — human setup docs.
- [packages/domain/README.md](packages/domain/README.md) — how the domain layer
  is organized and how to extend an aggregate.
- [docs/adr/](docs/adr/) — architecture decision records (why hexagonal, why
  Supabase Auth, why typed domain errors, …).

## Verify

After any non-trivial change, run **all four** from the repo root:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Turborepo caches, so re-runs are fast. Don't ship a change until all four pass.
`pnpm test` runs the Vitest suites in `packages/domain` and `packages/application`.

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

## Testing

There's no end-to-end suite yet. Domain and application packages have unit
tests (`pnpm --filter @pickupvb/domain test`). When adding business rules,
add a test in `packages/{domain,application}/src/**/*.test.ts`.

## Common pitfalls

- **Forgetting `revalidatePath()` after a server action mutates data.** The
  page won't refresh on the next render. Pass a `returnPath` arg through and
  call `revalidatePath(returnPath)` at the end of the action.
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
