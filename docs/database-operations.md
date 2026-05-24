# Database operations

> **Audience:** anyone running a query, applying a migration, or
> investigating production data. Migration mechanics + client-factory
> conventions live elsewhere — this doc covers the operational tasks
> the existing docs don't.

**Where to look first:**

- **Schema migrations end-to-end** (create / apply / regenerate types
  / never edit applied) — [AGENTS.md → Migrations](../AGENTS.md#migrations)
  - [packages/supabase/README.md](../packages/supabase/README.md#regenerating-database-types).
- **A migration broke production** — [runbook.md → Code rollback when
  a bad migration shipped](runbook.md#code-rollback-when-a-bad-migration-shipped)
  - [Migration failed partway](runbook.md#migration-failed-partway).
- **Where to look during an incident** — [monitoring.md](monitoring.md#supabase).
- **Client factory + nested-join + anon-auth conventions** —
  [packages/supabase/README.md](../packages/supabase/README.md#conventions).

This doc covers what those don't: inspecting production safely,
running one-off SQL fixes, working with RLS in the SQL editor, and
watching storage growth.

---

## Environments at a glance

| Environment | Database                                        | How you connect                                   |
| ----------- | ----------------------------------------------- | ------------------------------------------------- |
| Local       | Local Postgres started by `pnpm supabase:start` | Supabase Studio at <http://localhost:54323>       |
| Staging     | Supabase **staging** project                    | Supabase dashboard → staging project → SQL Editor |
| Production  | Supabase **production** project                 | Supabase dashboard → production project           |

The dashboard URL is the canonical entry point — there is no separate
admin CLI surface configured. Connection strings (for `psql` or
external tooling) live in the project's **Settings → Database** page.

---

## Inspecting production data

**Use the dashboard SQL Editor.** It runs queries as the **service
role by default**, which bypasses RLS — convenient for diagnostics,
but worth knowing because the same query against the app will return
fewer rows.

### Read-only by default

Wrap exploratory queries in an explicit transaction so a stray
`UPDATE` can't escape:

```sql
begin;
-- query goes here
rollback;
```

For one-off SELECTs, the dashboard's "Run" button is fine — the
editor will not commit on its own.

### Simulating a real user (RLS-on)

When you need to confirm "would the app return this row for user X?",
switch the SQL editor's role from `service_role` to `authenticated`
and set the JWT claims:

```sql
-- Pretend to be a specific user
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"<user-uuid>","role":"authenticated"}';

-- Now the same query the app would run
select * from events where id = '<event-id>';
```

`set local` only applies for the current transaction; the role
resets when you click Run again (each statement runs in its own
transaction unless you wrap them). Anonymous-auth users need
`"is_anonymous": true` in the claims object — that's what the app
checks for "real account required" gates.

### Common ad-hoc probes

| Question                               | Query starting point                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Who attended event X?                  | `select user_id, role from event_attendees where event_id = '...'`                       |
| Is the notifications outbox backed up? | See [monitoring.md → Notification outbox](monitoring.md#notification-outbox).            |
| Are Stripe webhooks getting stuck?     | See [monitoring.md → Stripe webhooks](monitoring.md#stripe-webhooks).                    |
| What rows did a user actually create?  | Join against `auth.users` by `id` — most app tables FK to `auth.users.id` via `user_id`. |
| Did a specific email ever sign up?     | `select id, created_at, is_anonymous from auth.users where email = '...'`                |

---

## One-off SQL fixes (production)

The rule from AGENTS.md applies: **never edit an applied migration**.
But sometimes a row needs to be fixed by hand — a stripe event missed
a webhook, an admin needs to grant access, a stuck notification needs
to be re-queued.

### Decide first: data fix or schema fix?

- **Schema fix** (column add/drop, index, constraint) → **always a
  migration.** Don't run `alter table` in the SQL editor; it puts the
  prod schema out of sync with the migration history and the next
  `gen:types` will see drift.
- **Data fix** (UPDATE / INSERT / DELETE on application rows) → SQL
  editor is fine. Capture what you did somewhere lasting (Linear /
  Slack thread / runbook entry).

### Safe-edit checklist

1. **`begin;` the change** so you can `rollback;` if the row-count
   surprises you.
2. **Run the SELECT first** with the exact same `where` clause. The
   row count is your sanity check.
3. **Make the change**, re-run the SELECT, confirm the new state.
4. **`commit;`** (or `rollback;` and start over).
5. **If the change affects more than ~10 rows,** consider whether it
   should be a migration after all — bulk fixes are easier to review
   in a PR than reconstruct from a Slack thread.

```sql
begin;

-- 1. Look before you leap
select id, status, attempts from notifications_outbox
 where id = '<row-id>';

-- 2. Make the change
update notifications_outbox
   set status = 'pending', attempts = 0, next_attempt_at = now()
 where id = '<row-id>';

-- 3. Confirm
select id, status, attempts from notifications_outbox
 where id = '<row-id>';

commit;
```

### When the fix is a re-run of a missed webhook

For Stripe specifically, **don't synthesize the row by hand** — use
Stripe Dashboard → **Developers → Events → "Resend webhook"** so the
signature verification + dedupe path in
[ADR 0011](adr/0011-stripe-webhook-dedupe.md) runs end-to-end.

---

## RLS in the SQL editor — common surprises

- **The editor bypasses RLS unless you change role.** A query that
  returns rows in the editor may return nothing for the app. See
  [Simulating a real user](#simulating-a-real-user-rls-on).
- **`auth.uid()` returns NULL in the editor by default** (no JWT set).
  Policies that depend on `auth.uid()` will reject every row — that's
  the editor, not a broken policy.
- **Policies stack with OR, not AND.** Multiple permissive policies
  on the same table widen access. Use **Database → Policies** in the
  dashboard to see all policies on a table together rather than
  reading migration files in isolation.
- **`security definer` functions ignore the caller's role.** RPCs
  marked `security definer` run as their owner (usually `postgres`)
  and skip RLS by design — that's why
  [search_events RPC](../supabase/migrations/20260513000300_search_events_rpc.sql)
  works for anonymous viewers.

---

## Storage growth & performance

Watch from the Supabase dashboard:

- **Reports → Database** — total DB size + per-table sizes. The
  fast-growing tables to expect are `notifications_outbox`,
  `stripe_webhook_events`, and `analytics`-flavored append-only rows.
- **Database → Query Performance** — slow-query log; sort by total
  time, not mean. Cross-reference against
  [supabase/migrations/20260520000000_perf_indexes.sql](../supabase/migrations/20260520000000_perf_indexes.sql)
  before adding an index — many of the obvious ones are already there.
- **Storage → Buckets** — file-storage size; growth is usually
  user-uploaded avatars + tournament images.

### Pruning the high-churn tables

Two tables grow forever today and will eventually need a TTL:

| Table                   | Purpose                                                            | Suggested retention                         |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| `notifications_outbox`  | Per-message send log                                               | 30 days for `sent`, indefinite for `failed` |
| `stripe_webhook_events` | Webhook dedupe (see [ADR 0011](adr/0011-stripe-webhook-dedupe.md)) | 90 days (Stripe never retries past this)    |

Neither has a prune job today — when they get big enough to matter,
add a Vercel cron (see [monitoring.md → Vercel Crons](monitoring.md#vercel-crons))

- a SQL `delete` with the retention window.

---

## Connecting from outside the dashboard

For pgAdmin / DataGrip / `psql`:

1. Supabase dashboard → **Settings → Database** → copy the connection
   string. **Use the "Connection pooler" string** for tools that hold
   connections open; the direct one for one-shot scripts.
2. The password is the project's DB password — rotate from the same
   page if it's ever shared.
3. **Use a read-only role for exploratory work.** Create one once via
   migration; don't hand out the `postgres` superuser password.

For local dev, `pnpm supabase:start` exposes the same DB on port
54322 with the default `postgres` / `postgres` credentials.

---

## When you really do need to bypass RLS in code

Inside the app, **never** widen RLS by reaching for the service-role
key from a page or `'use client'` file. The pattern is:

1. Stay in the user-scoped client (`getServerSupabase()`) wherever
   possible — RLS keeps you honest.
2. If the operation genuinely needs RLS bypass (webhook handler,
   cron worker, system-driven backfill), call `createSupabaseAdminClient()`
   from [packages/supabase/src/admin.ts](../packages/supabase/src/admin.ts)
   **only inside an infrastructure adapter or a `'server-only'` lib
   module.**
3. Add a comment at the top of the file explaining why the bypass is
   needed so the next reader doesn't widen it accidentally.

See [packages/supabase/README.md](../packages/supabase/README.md#whats-here)
for the full client-factory table.

---

## See also

- [AGENTS.md → Supabase](../AGENTS.md#supabase) — client-selection rules.
- [AGENTS.md → Migrations](../AGENTS.md#migrations) — migration mechanics.
- [packages/supabase/README.md](../packages/supabase/README.md) —
  client factories, `gen:types` workflow, nested-join pattern,
  anonymous-auth guard.
- [runbook.md](runbook.md) — incident playbooks (bad migration,
  partway-applied migration, Supabase outage).
- [monitoring.md](monitoring.md) — Supabase dashboards + SQL probes
  for outbox / webhook tables.
- [ADR 0011](adr/0011-stripe-webhook-dedupe.md) — `stripe_webhook_events`
  schema rationale.
