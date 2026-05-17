# @pickupvb/supabase

Thin Supabase client factories + generated database types for the monorepo.
Nothing in this package contains business logic — its job is to centralize
client construction so apps and infrastructure adapters pick the right client
for the calling context.

## What's here

| Export | Source | Purpose |
|---|---|---|
| `Database` | [src/database.types.ts](src/database.types.ts) | Generated row/insert/update types for every table, view, and function. Regenerated from the live schema (see below). Do not hand-edit. |
| `createSupabaseBrowserClient()` | [src/browser.ts](src/browser.ts) | Client component / browser-only client. Uses public anon key + browser cookie storage. |
| `createSupabaseServerClient()` | [src/server.ts](src/server.ts) | Server component / route handler client. Honors the user's session via `@supabase/ssr` cookies. RLS applies. |
| `createSupabaseAdminClient()` | [src/admin.ts](src/admin.ts) | Service-role client. **Bypasses RLS.** Only call from infrastructure adapters or trusted server-only code (webhooks, cron). Never import from a page or `'use client'` file. |

The web app wraps these in [apps/web/src/lib/supabase.ts](../../apps/web/src/lib/supabase.ts)
(`getServerSupabase()`) so most server code imports from there instead of
calling the factory directly.

## Regenerating database types

After running a new migration, regenerate the types so TypeScript catches
shape mismatches:

```bash
# 1. Make sure the local DB has the migration applied
pnpm db:migrate

# 2. Regenerate
pnpm --filter @pickupvb/supabase gen:types

# 3. Verify the rest of the monorepo still typechecks
pnpm typecheck
```

The `gen:types` script writes to a temp file and atomically renames it, so a
partial generation can't corrupt `src/database.types.ts`. Commit the
regenerated file in the same PR as the migration.

If `supabase gen types` fails:

- Confirm the local Supabase stack is running (`supabase status`).
- Confirm the migration applied cleanly (`pnpm db:migrate`).
- If a relation rename or drop confuses the generator, restart the stack
  (`supabase stop && supabase start`) and try again.

## Conventions

- **Joined rows return nested objects, not arrays**, when the FK is single-
  valued and the relation is `!inner`. Narrow with a local row type:

  ```ts
  const { data: rows } = await supabase
    .from('group_members')
    .select('user_id, role, profiles:profiles!inner(display_name)');
  type Row = { user_id: string; role: string; profiles: { display_name: string } | null };
  const typed = (rows as Row[] | null) ?? [];
  ```

- **Snake_case at the DB boundary, camelCase in the app.** Do the mapping at
  the page or repository boundary; don't push DB shape into reusable
  components.

- **Anonymous auth is enabled.** A user may be authenticated but have
  `is_anonymous: true` in their JWT. Guard "real account required" actions
  on that claim, not just `user != null`.

## Environment variables

This package reads from the same env vars the apps do:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (admin client only)

See [.env.example](../../.env.example) for the full list.
