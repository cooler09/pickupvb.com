# 0002. Supabase Auth

- **Status:** Accepted
- **Date:** 2025-08-12

## Context

We need authentication that is:

1. Cheap or free at our expected scale (low thousands of MAU).
2. Friendly to **Postgres Row-Level Security**, which we already plan to use
   for visibility rules (public / invite-only / friends-of-host / etc.).
3. Supports email/password, social OAuth (Google), and **anonymous users**
   (so guests can RSVP before creating an account).
4. Has good Next.js App Router support.

## Decision

Use **Supabase Auth** with the `@supabase/ssr` cookie helpers.

- Session lives in a cookie set by Supabase; readable from server components
  via [`getServerSupabase()`](../../apps/web/src/lib/supabase.ts).
- The same JWT is what Postgres sees, so RLS policies can `SELECT
  auth.uid()` and `auth.jwt() -> 'is_anonymous'` directly.
- Anonymous auth is enabled — guests get a real session with `is_anonymous:
  true` in the JWT. We gate "real account required" actions on that claim,
  not on `user != null`.

## Consequences

- ✅ One vendor for DB + auth → one bill, one outage surface.
- ✅ RLS-first authorization. The DB enforces visibility regardless of which
  client is querying.
- ✅ 50k MAU free tier is far beyond our near-term needs.
- ❌ Coupling: switching auth means rewriting RLS policies and our
  Supabase-client wrappers. We accept this as a feature, not a bug, for now.
- 🔒 Anonymous users must be promoted to real accounts via the
  `linkIdentity` flow before they can host an event. That flow is documented
  in the auth callback route.

## Alternatives considered

- **Clerk.** Best DX in the category, but its user table is separate from
  Supabase, breaking the RLS-from-JWT model. Worth revisiting only if our
  auth UX needs outpace Supabase's hosted UI.
- **Auth.js (NextAuth).** Self-hosted, free, but a lot more wiring and no
  managed account UI. RLS would require manually syncing a `user_id` column
  with the JWT.
- **Firebase Auth.** Generous free tier but adds another vendor and has a
  weak Postgres story.
