# 2026-06-07 — Fix: `AuthStateSync` reload loop ("404 keeps refreshing in dev")

## Symptom

Pages "constantly refreshed" in `next dev` — most visibly the 404, which is why
the first hypothesis blamed the freshly-added keep-ups game (it was the new thing
on that page). It was neither the game nor (despite the earlier
[delight-backlog note](2026-06-07-bundle-delight-backlog-complete.md)) the dev
CSP.

## Root cause

[`AuthStateSync`](../../apps/web/src/components/auth-state-sync.tsx) (mounted in
the root layout, so it runs on every route) called `router.refresh()` on
`TOKEN_REFRESHED`. The session-refreshing middleware
([proxy.ts](../../apps/web/src/proxy.ts)) calls `supabase.auth.getUser()` on
**every request** and rotates the auth cookie when the access token is stale.
That closes a loop **for any request carrying a session**:

```
onAuthStateChange('TOKEN_REFRESHED')
  → router.refresh()
    → RSC request hits middleware
      → getUser() rotates the auth cookie
        → browser client emits 'TOKEN_REFRESHED'
          → (repeat, back-to-back)
```

The refreshes chain with no real delay, so it reads as "constantly refreshing"
rather than once-per-token-expiry.

**Why every prior probe missed it:** the loop needs a session. A logged-out
visitor (and every headless probe that didn't sign in) has no cookie to rotate,
so it sees exactly one harmless mount-time refresh and no loop. The earlier
investigation concluded "no reload loop in headless → must be browser/HMR
timing" and chased CSP. The real discriminator was _signed-in vs. not_, not
_headless vs. real browser_.

## Fix

Refresh **only on an actual identity transition** (sign-in, sign-out, switch
user) plus same-user `USER_UPDATED`; never on `TOKEN_REFRESHED`, and seed the
baseline from the first emission without refreshing (the server already rendered
that state). The decision is a pure exported `reduceAuthSync(prev, event,
nextUserId)` so it's unit-testable in the node-env web suite; the component just
threads a `useRef` baseline through it.

## Verification — live A/B repro

Signed in as `TEST_USER_*` via the real login UI (so `@supabase/ssr` wrote its
own cookies), then watched a 404 for 12s with a Playwright probe counting full
page loads:

| Code                               | full reloads / 12s | nav events | result      |
| ---------------------------------- | ------------------ | ---------- | ----------- |
| old (refresh on `TOKEN_REFRESHED`) | 6                  | 11         | reload loop |
| fixed (skip `TOKEN_REFRESHED`)     | 1                  | 1          | no loop     |

Logged-out, both versions showed a single load — confirming the
session-dependence. Regression test:
[auth-state-sync.test.ts](../../apps/web/src/components/auth-state-sync.test.ts)
(fails if `TOKEN_REFRESHED` ever returns `refresh: true` again). Quad-green.

The keep-ups game was restored — it was never implicated.

## Follow-ups

- The dev-only `'unsafe-eval'` CSP entry from the earlier bundle stays (it's a
  legitimate dev-runtime requirement), just re-labeled as "not the loop fix."
- Worth a glance: any other client component wired to `router.refresh()` on a
  high-frequency Supabase auth event (`new-group-button.tsx` subscribes to
  `onAuthStateChange` but only reads the user, doesn't refresh — fine).
