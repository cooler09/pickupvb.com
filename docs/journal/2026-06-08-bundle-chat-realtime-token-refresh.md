# 2026-06-08 — Realtime token refresh for chat (M-3): verified, no fix needed

Resolves **M-3** from the chat-engine deep-dive
([notifications-messaging.md](../audits/notifications-messaging.md)). The finding:
the two live subscribers (`ConversationView`, `subscribe-notifications.ts`) call
`supabase.realtime.setAuth(session.access_token)` once at subscribe and never
again, so the worry was that after the ~1h access-token expiry a long-lived chat /
bell tab would silently stop receiving (the `realtime.messages` RLS policy
re-evaluates against the connection's token). The audit deliberately flagged it
**"verify first — some supabase-js versions propagate the refreshed token
automatically."**

## Outcome: the client library already handles it

Read the installed sources rather than shipping blind (the Realtime path is
deploy-gated, so a deployed two-tab soak wasn't available; the library source is
authoritative for _whether the mechanism exists_). On this stack — **supabase-js
2.107.0 + @supabase/ssr 0.10.3**, default browser client — the refresh is
automatic:

1. `@supabase/ssr` `createBrowserClient` → `createClient(..., { auth: {
autoRefreshToken: true (browser), persistSession: true, flowType: 'pkce',
   storage: cookieStorage } })`. Crucially it sets **no top-level `accessToken`
   option**.
2. In supabase-js, `accessToken` being unset means the constructor wires
   `_listenForAuthEvents()` → `_handleTokenChanged`, which on `TOKEN_REFRESHED` /
   `SIGNED_IN` calls `this.realtime.setAuth(newToken)` (and `setAuth()` on
   `SIGNED_OUT`). `autoRefreshToken` is what fires `TOKEN_REFRESHED` before expiry.
3. realtime-js `setAuth(token)` updates each channel's join payload **and**, for
   channels that are already joined (`channel.joinedOnce && isJoined()`), pushes
   an `access_token` event to the server — re-authorizing the _live_ socket, not
   just future channels.

So an open `chat:{id}` / `notifications:{uid}` subscription is re-authorized in
place every time the JWT rolls over. The "set once, never refreshed" symptom isn't
reachable here.

## Why no code, and the one thing that must stay

Adding our own `auth.onAuthStateChange → realtime.setAuth` would **duplicate** the
client's built-in handler — a layer with zero behavior (playbook: partial/empty
patterns cost more than none). Rejected.

The single gap in the auto path is `INITIAL_SESSION`: `_handleTokenChanged` acts
only on `TOKEN_REFRESHED` / `SIGNED_IN` / `SIGNED_OUT`, so the _first_ token on a
fresh page load is **not** auto-forwarded. That's exactly what the existing
explicit `setAuth(session.access_token)` covers — it's load-bearing and must not be
removed.

**Change shipped:** comments at both subscribe sites documenting this (set the
initial token only; the client refreshes the rest; don't add a redundant handler,
don't drop the initial call). Comment-only — quad-green.

**Re-open trigger:** if the browser client is ever switched to the
custom-`accessToken` (third-party / external-auth) mode, step 2 is disabled and a
manual `onAuthStateChange → setAuth` becomes necessary.

## Chat backlog after this

All remaining chat findings are P3: M-4 (inbox pagination), M-7 (sender card in
the broadcast payload — the "Member" fallback, now more visible with event rooms),
M-8 (load-earlier scroll anchor), M-9 (blocked-state banner), M-10 (text-message
rate limit), M-12 (chat e2e — would also exercise this token-refresh path against a
real socket).
