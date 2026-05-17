# Resetting test data

Pre-launch playbook for clearing test data out of production (or any environment).
Run these in Supabase **Dashboard → SQL Editor** on the target project. Review
each block before clicking Run.

## Option 1 — Truncate every public table (keeps auth users + schema)

Best when you want to keep your own login and just clear test events / RSVPs /
payments / notifications. This auto-discovers every table in `public`, so it
stays correct as migrations add or remove tables.

```sql
-- App data only. Auth users preserved.
do $$
declare
    stmt text;
begin
    select 'truncate table '
        || string_agg(format('%I.%I', schemaname, tablename), ', ')
        || ' restart identity cascade'
    into stmt
    from pg_tables
    where schemaname = 'public';

    if stmt is not null then
        execute stmt;
    end if;
end $$;
```

If you want to see exactly what would be wiped first:

```sql
select tablename from pg_tables where schemaname = 'public' order by tablename;
```

## Option 2 — Also wipe auth users (truly fresh)

If you want every test account gone too:

```sql
delete from auth.users;
```

Then run Option 1. `profiles` cascades from `auth.users`, so it'll get wiped
as part of the user delete.

**Keep your own admin login** — either skip your own user:

```sql
delete from auth.users where email <> 'you@example.com';
```

…or delete test accounts individually from **Dashboard → Authentication →
Users**.

## Option 3 — External services (do these too)

App-data wipes don't touch state outside Postgres.

### Stripe

- **Refund test charges**: Dashboard → **Payments** → refund anything live.
- **Reject test Connect accounts**: Dashboard → **Connect → Accounts**.
- **Long term**: use Stripe **test mode** keys (`sk_test_…` / `pk_test_…`
  plus a `whsec_…` from `stripe listen`) during development. Pre-launch with
  live keys risks accidental real charges.

### Supabase Storage

`truncate` doesn't touch buckets. If you've uploaded avatars / event images:

- Dashboard → **Storage** → bucket → select all → delete.

Or programmatically via `supabase.storage.from(bucket).remove([...paths])` in a
one-off script.

### Push subscriptions

Covered by Option 1's `truncate public.push_subscriptions`. Browsers will
need to re-enable push on `/profile/notifications` after reset.

### Resend

Past sent emails stay in the Resend dashboard history. No action needed; they
don't affect anything going forward.

### Sentry

Old errors stay in the project dashboard. Optional: **Project Settings →
Delete Data** if you want a clean error log baseline.

## Recommended pre-launch sequence

1. Run **Option 1** (truncate app tables).
2. Switch Stripe env vars to **test mode** until ready for real customers.
3. Optionally wipe Supabase Storage buckets if you uploaded images.
4. Don't run Option 2 unless you also want every account gone — usually
   skipping your own is enough.

## Future improvement

A `pnpm db:reset` script could auto-discover all `public` tables and
truncate them without maintaining a list. See [AGENTS.md](../AGENTS.md) for
how to wire a new script into the monorepo.
