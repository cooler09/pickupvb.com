# Security Audit

**Date:** 2026-05-17
**Scope:** entire `pickupvb.com` workspace (`apps/web`, `packages/*`,
`supabase/migrations`). `copilot-skills` workspace was not audited.
**Method:** read-only static review. Server actions, API routes, auth flows,
RLS policies, third-party integrations, secrets handling, logging.

**Status update (2026-06-07) — fresh re-audit (chat / media / badges / waitlist /
GDPR surface):** read-only pass over the large feature surface added since the
2026-05-30 re-audit — chat messaging, media posts, gamification badges, capacity
waitlist, account deletion + GDPR export, host-added teams, live scoring, the new
cron + data-export routes. Lens: authorization on write paths, admin-client (RLS
bypass) usage, RLS column-pinning, route auth. **Headline: 2 P1 (one a confirmed
un-applied regression) + 1 P2 worsened + 1 P2 new + 1 P3 new.** Full write-up:
[§ Reevaluation — 2026-06-07](#reevaluation--2026-06-07).

> **✅ All five findings remediated (2026-06-07):** the two P1s, the cron
> fail-open (P2 #13), the RLS column-pinning gaps (P2 #16), and the public
> `/api/sentry-test` (P3 #17) are fixed and verified
> (`pnpm typecheck && lint && test && build` green) — see the
> [P1 bundle entry](#2026-06-07--p1-12--p1-15--p2-13-authz--cron-hardening), the
> [P2 #16 entry](#2026-06-07--p2-16-rls-column-pinning-on-media_posts--messages),
> and the [P3 #17 entry](#2026-06-07--p3-17-sentry-test-gated) (the two trigger
> migrations are **deploy-gated** — CI applies them). The bullets below describe
> the findings as-found. _(Pre-existing backlog also addressed 2026-06-07: the
> P1 #14 `getBracketMeta` spectator follow-up and P3 #8 audit-log coverage are
> both closed; **P2 #3b** (CSP nonce) was assessed and closed
> **wontfix-with-rationale** — see [§ 3b](#3b-nonce-based-csp-hardening-drop-unsafe-inline).
> No open security items remain on this file.)_

- **P1 #12 is STILL OPEN — the 2026-05-30 recommended fix was never applied.**
  Re-confirmed exploitable at HEAD: `addEventCoHost` / `add|update|removeEventDivision`
  ([co-host-actions.ts#L48](../../apps/web/src/app/events/[id]/co-host-actions.ts#L48),
  [division-actions.ts#L91](../../apps/web/src/app/events/[id]/division-actions.ts#L91))
  still only `requireSession()` (any signed-in, incl. anonymous, user); the handlers
  still carry the "authz lives at the DB layer (RLS)" comment with **no app-layer host
  check** ([co-host.handler.ts](../../packages/application/src/commands/co-host.handler.ts),
  [event-division.handler.ts](../../packages/application/src/commands/event-division.handler.ts));
  and `eventRepo` is still `new SupabaseEventRepository()` with no client →
  lazy service-role admin → RLS bypassed
  ([handlers.ts#L166](../../apps/web/src/lib/handlers.ts#L166),
  [supabase-event-repository.ts#L304-L313](../../packages/infrastructure/src/supabase-event-repository.ts#L304-L313)).
  Any signed-in user self-adds as co-host of any event (privilege escalation into the
  full host surface incl. attendee-PII CSV export) or adds/edits/**deletes** divisions
  on any event (data loss).
- **P1 #15 (new) — `GET /api/events/[id]` leaks any scoped / private / draft event,
  unauthenticated.** The unclosed REST sibling of P1 #14:
  [route.ts](../../apps/web/src/app/api/events/[id]/route.ts) → `GetEventByIdHandler`
  reads via the admin client with **no viewer and no visibility gate** and returns full
  detail including the **exact street address + latitude/longitude**, for any event id
  regardless of `visibility` (`friends_of_host` / `invite_only`) or `status`
  (draft/unpublished). The route has **no auth check at all**. The 2026-06-04 fix only
  covered the page loader + `generateMetadata`. The endpoint is also unreferenced by the
  frontend (stale-but-live surface).
- **P2 #13 worsened — cron fail-open spread to 6 routes, still no shared helper.** The
  `if (!secret) return true` pattern was copied verbatim into three new crons, including
  the **destructive** `account/execute-deletions` (hard-deletes accounts after the grace
  window), `community-listings/auto-approve`, and `badges/reconcile`.
- **P2 #16 (new) — RLS `UPDATE` policies don't pin privileged columns.** Two instances
  let a row's owner escalate via a direct PostgREST `PATCH`: `media_posts_update`
  (self-set `featured=true` → bypasses the host-gated `feature_event_stream` RPC;
  self-set `status='active'` → reverses report auto-hide) and `messages_update`
  (`WITH CHECK` never re-validates `can_access_conversation`, doesn't pin
  `conversation_id` / `deleted_at` → cross-room message injection + self-undelete of a
  moderator-removed message). The app's own code paths are clean; the gap is the RLS
  policy, reachable directly with the user's JWT.
- **P3 #17 (new) — `/api/sentry-test` is publicly invokable** with no auth — anyone can
  flood Sentry or force unhandled rejections (`?kind=unhandled`). Stale debug surface;
  gate to non-prod or remove.

Verified still-safe this pass: `pnpm audit --prod` reports **0 vulnerabilities**; the
P1 #14 page + metadata visibility gate is present
([load-event-detail.ts#L228-L268](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts#L228-L268));
chat access helpers (`can_access_conversation` / `can_moderate_conversation`),
`list_room_recipients` (service-role only), `event_waitlist` RLS, `set_user_badge_hidden`
(owner-scoped), `feature_event_stream` (host-gated RPC), and the `awardEventBadge`
`canManage` gate are all sound. SECURITY DEFINER hygiene is good — almost all new
definers run `set search_path = ''` with schema-qualified refs.

**Status update (2026-06-04) — scoped-event read leak (e2e-surfaced):** the
persona e2e suite (`persona-olivia-social`) caught a **P1 privacy leak**, the
read-side twin of P1 #12 / [P2 #4](#4-admin-supabase-client-used-for-user-driven-writes).

- **P1 #14 — event-detail read bypasses scoped-event visibility.** The
  event-detail read runs on the **service-role admin client** — `getDetail` on
  the no-arg module-singleton `SupabaseEventRepository`
  ([eventRepo](../../apps/web/src/lib/handlers.ts)) reads `events_view` by id
  with **no visibility check**. The `viewerId` carried into `GetEventDetailQuery`
  drives the friend graph / RSVP bits, not access (the doc comment claimed it
  enforced visibility — it never did). So any signed-in (incl. anonymous) viewer
  could load a `friends_of_host` / `friends_of_attendees` (or unpublished
  private) event; anon viewers leaked the same way via
  `loadEventReadModelPublic` + `generateMetadata` (title in `<head>`/og). **Fix
  (2026-06-04):** [load-event-detail.ts](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts)
  gates logged-in viewers with a cheap user-scoped existence check against the
  RLS-protected base `events` table (delegate to the canonical `events_select`
  policy — invite\*only stays link-readable), and anon viewers with a static
  `published && (public|invite_only)` check;
  [page.tsx](../../apps/web/src/app/events/[id]/page.tsx) `generateMetadata`
  gated the same way. **Deploy-gated** (fix ships to dev on the next deploy).
  **Follow-up (✅ closed 2026-06-07):** the bracket / schedule / watch spectator
  pages read via `getBracketMeta` (same admin client, no gate), so a _scoped_
  tournament's title + division structure leaked there (page bodies, both
  `generateMetadata`s, and the bracket-watch OG image). Closed with a shared,
  cache-preserving [`assertEventVisibleOrNotFound`](../../apps/web/src/lib/event-visibility.ts)
  gate — see the
  [remediation entry](#2026-06-07--p1-14-spectator-follow-up-bracketschedulewatch).

**Status update (2026-05-30) — fresh re-audit:** read-only pass over the
feature surface added since the 2026-05-17 audit (brackets, leagues, event
divisions, ad-hoc + walk-in registrations, community listings, host
payments). Opened **1 P1 + 1 P2** — full write-up + recommended fixes in
[§ Reevaluation — 2026-05-30](#reevaluation--2026-05-30).

- **P1 #12 — division CRUD + co-host add/remove bypass authorization (new
  instance of the [P2 #4](#4-admin-supabase-client-used-for-user-driven-writes)
  admin-client → RLS-bypass class).** The `AddEventDivision` / `UpdateEventDivision`
  / `RemoveEventDivision` and `AddEventCoHost` / `RemoveEventCoHost` handlers
  explicitly delegate authorization to RLS ("the repo will throw a Postgres
  permission error"), but the shared `SupabaseEventRepository` lazily
  constructs a **service-role** client, so RLS never fires and there is **no
  app-layer host check** anywhere on these paths. Any signed-in (incl.
  anonymous) user can **add themselves as a co-host of any event** →
  `canManage` flips true → full host management surface (privilege
  escalation), or **add / edit / delete divisions on any event** (integrity
  damage; remove can cascade registration data → data loss). This is exactly
  the adapter-hides-the-gap warning in AGENTS.md pitfall #8.
- **P2 #13 — cron routes fail _open_ when `CRON_SECRET` is unset.** All three
  admin-client cron endpoints (`worker`, `reminders`, `outbox-purge`) return
  `true` from their auth guard when the secret is missing. A prod
  misconfiguration leaves email/push fan-out and the destructive outbox purge
  publicly invokable.

**Status update (2026-05-31):** CSP `frame-src` widened to permit the media
post video embeds — YouTube (`www.youtube-nocookie.com` + `www.youtube.com`)
and Twitch (`player.twitch.tv` VODs/channels + `clips.twitch.tv` clips). These
are the only providers we iframe (Instagram / TikTok / Facebook / `other` are
link cards). The embeds were silently blocked by the enforcing CSP since
Bundle 27. `frame-src` only — the framed third-party document loads its own
sub-resources under its origin, so no `img-src` / `connect-src` / `script-src`
additions, and no CORS change (iframes, not cross-origin fetch). See the
[remediation log](#2026-05-31--csp-frame-src-for-media-video-embeds) below.

**Status update (2026-05-17):** Quick-win bundle shipped — see
[Remediation log](#remediation-log) at the bottom.

**Status update (2026-12-04):** New instance of P2 #4 (admin client →
RLS bypass) found and closed — the match-result writes (bracket
record/reset, league score entry) persisted through the service-role
admin client, so the "host or either captain" RLS policies never
enforced and any signed-in user could overwrite any match's score.
Now routed through a user-scoped client + authorization-gated RPCs.
See [P2 #4](#4-admin-supabase-client-used-for-user-driven-writes) and
the [remediation log](#2026-12-04--captain-rls-on-match-result-writes-p2-4-follow-on).

**Status update (2026-05-23, Bundle 53):** All three remaining P3
findings closed in audit text. #9 (FormData hard cap) and #10
(Turnstile freshness) were code-closed in Bundle 17 (2026-05-24) but
the finding headers still read as open — flipped to ✅ with status
lines pointing at the resolved code. #11 (file-upload hardening)
closed as **wontfix-preemptive** with an explicit re-open trigger
(any new `apps/web/src/app/api/` upload route or Supabase Storage
`upload()` call). The only open security items remaining are P2 #3b
(nonce-based CSP hardening) and P3 #8 (audit-log coverage gaps).

**Status update (2026-05-23):** CSP allowlist extended to cover
Vercel Live's preview-deployment feedback widget — `vercel.live`
(script/style/img/font/frame), `assets.vercel.com` (font),
`vercel.com` (img), and `wss://ws-us3.pusher.com` (Pusher realtime
that backs the widget's comments). Preview builds were emitting a
console-blocking CSP violation on every page load. Widget is not
injected on production builds; allowlisting is harmless either way.
See [apps/web/next.config.mjs](../../apps/web/next.config.mjs).

**Status update (2026-05-22, Bundle 27):** P2 #3a closed — CSP promoted
from `Content-Security-Policy-Report-Only` to enforcing
`Content-Security-Policy` in [next.config.mjs](../../apps/web/next.config.mjs).
Same allowlist that soaked behind Report-Only since Bundle 15 (2026-05-24)
without producing real violations. Browsers now block any script/style/
connect/img/frame/font/worker target that isn't explicitly allowed.

**Status update (2026-05-22):** New P1 — `pnpm audit --prod` reports **15
vulnerabilities** in `next` (2 low / 8 moderate / 5 high), all resolved by
upgrading from the installed `next@14.2.35` to `>=15.5.16`. Details below.
No other security shipments this pass; CSP, admin-client refactor, and
rate-limiting remain open.

---

## P1 — fix before next deploy

### 0. Outdated `next` with 15 known vulnerabilities (5 high) 🆕 2026-05-22

**Files:** [apps/web/package.json](../../apps/web/package.json), [packages/supabase/package.json](../../packages/supabase/package.json), [packages/infrastructure/package.json](../../packages/infrastructure/package.json)
**Category:** Dependency vulnerabilities

`pnpm audit --prod` reports **15 advisories** against `next@14.2.35`, all
fixed by `>=15.5.16`. High-severity items include:

- HTTP request deserialization → DoS via insecure RSC ([GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf))
- Two distinct DoS via Server Components ([GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3), [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj))
- SSRF via WebSocket upgrade ([GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r))
- Middleware / proxy bypass in Pages Router with i18n (not exercised here — we're App Router only — but the advisory still applies to the package)

This disagrees with the README's claim of Next 16.2.6; the installed
version is what matters. The mismatch likely came from the `--webpack`
flag rollback noted in the [organization audit](organization.md).

**Fix:** bump to the latest 15.x (or 16.x) across `apps/web`,
`packages/supabase`, and `packages/infrastructure`, run `pnpm install`,
then verify `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
Re-evaluate the `--webpack` flag at the same time — Turbopack defaults
are back on 15.x and 16.x.

### 1. Open redirect in `auth/callback`

**Status:** ✅ _Resolved 2026-05-17_ — `next` is now validated against the
`/^\/(?![/\\])/` regex; non-matching values fall back to `/events`.

**File:** [apps/web/src/app/auth/callback/route.ts](../../apps/web/src/app/auth/callback/route.ts#L11-L20)
**Category:** Open redirect

```ts
const next = searchParams.get('next') ?? '/events';
// ...
return NextResponse.redirect(`${origin}${next}`);
```

`next` is concatenated raw. An attacker can send
`/auth/callback?code=…&next=//evil.com` (or `/\evil.com`) and the user gets
bounced to a phishing page right after confirming an email.

**Fix:** require `next` to start with `/` AND not start with `//` or `/\`.

```ts
const raw = searchParams.get('next') ?? '/events';
const safe = /^\/(?![/\\])/.test(raw) ? raw : '/events';
return NextResponse.redirect(`${origin}${safe}`);
```

### 2. Local-only secrets (informational)

**File:** [.env](../../.env)
**Category:** Secrets exposure

The agent's initial pass flagged `.env` as committed. **Verified false** —
`.env` is in `.gitignore` and not tracked by git (`git ls-files | grep
^\.env` returns only `.env.example`). The risk is local-only: anyone with
access to the laptop or this workspace can read live Stripe/Supabase/Resend
secrets.

**Recommendation:** rotate any keys you don't fully trust the local history
of (e.g. if this folder ever lived on a shared drive). No production
exploit, no commit-history scrub needed.

---

## P2 — important

### 3. Missing security headers

**Status:** ✅ _Resolved 2026-05-22 (Bundle 27, enforcement milestone)_ —
baseline headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy`) added 2026-05-17. CSP shipped
2026-05-24 as `Content-Security-Policy-Report-Only` with the full
third-party allowlist (Supabase REST/Realtime, Cloudflare Turnstile,
OSM tiles); see the [Bundle 15 journal](../journal/2026-05-digest.md#bundle-15).
Bundle 27 (2026-05-22) promoted the same policy to enforcing
`Content-Security-Policy` after a clean soak window. Nonce-based
hardening of `'unsafe-inline'` on `script-src` / `style-src` (to drop
the JSON-LD + Tailwind escape hatches) is tracked as **P2 #3b** below.

**Files:** [apps/web/next.config.mjs](../../apps/web/next.config.mjs), [apps/web/vercel.json](../../apps/web/vercel.json)
**Category:** Security headers / CSP

No `async headers()` config and no `headers` array in `vercel.json`. Missing:

- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (geolocation, microphone, camera, payment off by default)
- `X-Frame-Options: DENY` (or equivalent CSP `frame-ancestors`)
- `Content-Security-Policy`

HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and
`X-Frame-Options` are one-liners and safe to add globally via
`next.config.mjs`. CSP needs an allowlist for every third party (Stripe.js,
Supabase, Sentry, Turnstile, OSM tiles, fonts, images) — roll it out behind
`Content-Security-Policy-Report-Only` first.

### 3b. Nonce-based CSP hardening (drop `'unsafe-inline'`)

**Status:** 🟡 _Assessed 2026-06-07 — **wontfix-with-rationale** (cost ≫ benefit;
re-open triggers below)._ The enforcing CSP retains `'unsafe-inline'` on
`script-src` and `style-src` ([next.config.mjs](../../apps/web/next.config.mjs#L75-L76)).
Dropping it was assessed in full and is **not worth implementing as the app is
built today**:

- **`style-src` — infeasible.** CSP nonces only cover `<style>` _elements_, not
  inline `style={{…}}` _attributes_. The app has ~9 inline-style sites (event-map
  height, dashboard widgets) plus libraries (Leaflet / Radix) that inject inline
  styles at runtime. None can carry a nonce, so `'unsafe-inline'` on `style-src`
  cannot be removed without refactoring every inline style to a class/CSS-var
  **and** guaranteeing no dependency ever injects one — brittle and high-maintenance
  for no change to the actual attack surface.
- **`script-src` — feasible but net-negative.** The only inline scripts are
  JSON-LD (`<script type="application/ld+json">`), emitted by `layout.tsx` on
  **every page**. JSON-LD is dynamic (per-event), so it can't be hashed — it needs
  a per-request **nonce**, which means moving CSP generation into `proxy.ts` and
  reading the nonce at render time. That **forces dynamic rendering site-wide and
  defeats static/ISR caching** — directly counter to this codebase's caching
  investment (e.g. the cache-preserving P1 #14 spectator gate). The benefit is
  marginal: the only `dangerouslySetInnerHTML` is server-built `JSON.stringify` of
  trusted data (verified under "✅ Verified safe" — XSS), so `'unsafe-inline'` is a
  defense-in-depth gap here, not a live vector.

**Recommended posture:** keep `'unsafe-inline'` until a re-open trigger fires, and
prefer the lower-cost mitigations already in place (no user-controlled HTML
rendering; typed/escaped JSON-LD; `object-src 'none'`, `base-uri 'self'`,
`frame-ancestors 'none'`).

**Re-open triggers** (any one flips this back to an actionable P2):

- The app starts rendering **user-influenced HTML** (a rich-text/markdown field,
  a CMS block, an embed the user controls) — then inline-script XSS becomes real
  and the nonce cost is justified.
- The app **moves off static/ISR caching** for the pages that emit JSON-LD (so a
  per-request nonce no longer costs cacheability), or Next ships first-class
  nonce support that preserves caching.
- A dependency is added that requires a tighter CSP for compliance (PCI/SOC2
  control, a partner requirement).

### 4. Admin Supabase client used for user-driven writes

**Status:** ✅ _Resolved 2026-05-24 (Bundle 14)_ — all three call sites
now use `getServerSupabase()` (RLS-enforced). New migration
[20260609000000_self_writes_attendees_tips.sql](../../supabase/migrations/20260609000000_self_writes_attendees_tips.sql)
adds self-service policies for `event_attendees` /
`event_tips` (own pending row only — caller can't self-promote to
`paid`) plus host-update policies for the manage-payments flow and a
host-insert policy for `event_payment_audit`. Stripe webhook handlers
continue to use the admin client (correct — they run with no user
session). See the [Bundle 14 journal](../journal/2026-05-digest.md#bundle-14).

**Follow-on (2026-12-04):** a second instance of this same pattern
surfaced in the bracket / league **match-result** writes — the repos
(`SupabaseBracketRepository`, `SupabaseLeagueScheduleRepository`) build
their own admin client, and the record/reset handlers delegated authz
entirely to RLS policies that the admin client bypassed. Closed via
user-scoped clients + authorization-gated RPCs; see the
[2026-12-04 remediation entry](#2026-12-04--captain-rls-on-match-result-writes-p2-4-follow-on)
and the
[journal entry](../journal/2026-05-digest.md#bundle-captain-rls-match-result).
**Durable lesson:** "swap admin → server client" only fixes the call
sites you can see — an adapter that self-constructs the admin client
internally hides the same gap behind the port. Audit repository
adapters, not just page/action code, when chasing RLS-bypass.

**Files:**

- [apps/web/src/app/events/[id]/checkout-actions.ts](../../apps/web/src/app/events/[id]/checkout-actions.ts#L65) — admin `INSERT` into `event_attendees` for the calling user.
- [apps/web/src/app/events/[id]/tip-actions.ts](../../apps/web/src/app/events/[id]/tip-actions.ts#L89) — admin write to `event_tips`.
- [apps/web/src/app/events/[id]/manage-payments-actions.ts](../../apps/web/src/app/events/[id]/manage-payments-actions.ts#L45) — admin `UPDATE` on attendee payment status, with auth derived from `detail.canManage`.

**Category:** AuthZ / RLS

`getAdminSupabase()` bypasses RLS. Authorization correctness depends
entirely on app-layer checks — if a single guard regresses, there's no
defense in depth.

**Fix pattern:** prefer `getServerSupabase()` (RLS-enforced) for any write
where the caller is the resource owner. Reserve `getAdminSupabase()` for
webhook handlers, crons, and explicit admin tooling. Where admin truly is
needed (cross-user side effects), wrap calls in an audit-logged helper that
re-checks authorization inside the helper, not in the caller.

### 5. PII (emails) logged

**Status:** 🟡 _Partially resolved 2026-05-17_ — `{ email }` removed from
the `claim/actions.ts` log call. The `checkout-actions.ts:210` call cited
in the original finding logs `{ error: emailErr.message }` and does not
directly include the email field; left as-is, but worth a follow-up to
truncate Supabase error messages in case they echo the address.

**Files:**

- [apps/web/src/app/claim/actions.ts](../../apps/web/src/app/claim/actions.ts#L94) — `log.error('[claim] updateUser(email) failed', emailErr, { email })`
- [apps/web/src/app/events/[id]/checkout-actions.ts](../../apps/web/src/app/events/[id]/checkout-actions.ts#L210)

**Category:** Logging / data leakage

Email addresses are PII under GDPR/CCPA. Sentry ingests these and persists
them indefinitely. The stack trace is sufficient for debugging.

**Fix:** drop the `{ email }` context from both `log.*` calls.

### 6. No rate limiting on email-sending paths

**Status:** ✅ _Resolved 2026-05-24_ (Bundle 16). Postgres-backed fixed-window
limiter (`public.rate_limits` + `public.consume_rate_limit()`) gates the
three user-facing email paths (`claimAccount`, `signupAsGuest`,
`startGuestTicketCheckout`) at 20 requests/hour per IP and 5/hour per
email. Cron-driven `api/notifications/worker/route.ts` was intentionally
skipped — it's `CRON_SECRET`-guarded with no user-driven trigger surface.

**Files:**

- [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts)
- [apps/web/src/app/claim/actions.ts](../../apps/web/src/app/claim/actions.ts)
- [apps/web/src/app/events/%5Bid%5D/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts)
- [apps/web/src/app/events/%5Bid%5D/guest-actions.ts](../../apps/web/src/app/events/%5Bid%5D/guest-actions.ts)

**Category:** Rate limiting / abuse

Custom transactional emails ride on Resend. Supabase Auth limits its own
magic-link sends, but the Resend paths don't. Repeatedly POSTing
`claimAccount` or `startGuestTicketCheckout` could be used to email-bomb a
target.

**Fix:** add per-IP + per-email throttle. Vercel KV or Upstash for shared
state; in-memory `Map` with TTL is an acceptable interim if all traffic
hits a single region.

### 7. Stripe webhook handlers don't cross-check metadata

**Status:** ✅ _Resolved 2026-05-17_ — `handleCheckoutCompleted` and
`handleSubscriptionChange` now assert that when both session/subscription
metadata and (expanded) customer metadata carry `user_id`, the values
match; mismatches throw + log + trigger Stripe retry.

**File:** [apps/web/src/app/api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts)
**Category:** Webhook integrity

Signature verification is correct, but handlers trust `metadata.user_id` on
incoming events without cross-checking. A misconfigured Stripe Dashboard
rule (someone in your Stripe org mass-editing customers) could corrupt
metadata.

**Fix:** when both `customer.metadata.user_id` and
`session.metadata.user_id` exist, assert they match. Reject and log
otherwise.

---

## P3 — nice to have

### 8. Audit log coverage gaps

**Status:** ✅ _Resolved 2026-06-07 (deploy-gated)._ Added a generic append-only
[`audit_log`](../../supabase/migrations/20260923000000_audit_log.sql) table
(service-role write/read only, mirroring `event_payment_audit`) + a fail-quiet
[`recordAuditEvent`](../../apps/web/src/lib/audit-log.ts) helper, wired into all
four flagged categories: group member add/remove/role
([member-actions.ts](../../apps/web/src/app/groups/member-actions.ts)), event
co-host add/remove
([co-host-actions.ts](../../apps/web/src/app/events/[id]/co-host-actions.ts)),
Stripe Connect account mirrors
([connect.ts](../../apps/web/src/lib/webhooks/connect.ts)), and host-subscription
state changes ([subscription.ts](../../apps/web/src/lib/webhooks/subscription.ts)).
See the [remediation entry](#2026-06-07--p3-8-audit-log-coverage).

`event_payment_audit` table exists ([20260516000000_ticketed_events.sql](../../supabase/migrations/20260516000000_ticketed_events.sql#L76))
but the pattern isn't extended to:

- Group member role changes
- Co-host add/remove
- Stripe account mutations
- Subscription state changes

**Fix:** add an `audit_log` table or extend the existing one.

### 9. FormData hard max-size

**Status:** ✅ _Resolved 2026-05-24 (Bundle 17)_ — `FIELD_HARD_MAX = 4096`
enforced inside `rawValue()`, so every helper (`field`, `fieldOrNull`,
`fieldOrUndefined`, `bool`) inherits the cap. Per-call `maxLen` can
narrow but never raise the ceiling. Test coverage in
[form-data.test.ts](../../apps/web/src/lib/form-data.test.ts).

**File:** [apps/web/src/lib/form-data.ts](../../apps/web/src/lib/form-data.ts)

`field()` / `fieldOrNull()` take a per-field `max` arg. There's no global
upper bound — a manually crafted POST with a 1 MB `first_name` is only
limited by Next.js body-parsing defaults.

**Fix:** enforce a global hard cap (e.g. 4 KB) at the helper.

### 10. Turnstile token freshness

**Status:** ✅ _Resolved 2026-05-24 (Bundle 17)_ —
`verifyTurnstileToken` rejects tokens whose `challenge_ts` is older
than `TURNSTILE_MAX_AGE_MS = 2 * 60 * 1000`. Replays return
`{ ok: false, error: 'Verification expired. Please try again.' }`.
Test coverage in
[turnstile.test.ts](../../apps/web/src/lib/turnstile.test.ts).

**File:** [apps/web/src/lib/turnstile.ts](../../apps/web/src/lib/turnstile.ts#L20-L46)

Cloudflare's `verify` endpoint returns `challenge_ts`. We don't assert it's
recent. A bot could pre-generate a token and replay it later.

**Fix:** reject tokens older than ~2 min.

### 11. File-upload hardening (preemptive) — ✅ Closed (2026-05-23, Bundle 53) (Wontfix until uploads exist)

**Decision:** No file-upload endpoints exist in the app today. Closing
as preemptive — re-open when the first upload endpoint lands (likely
avatars or broadcast images) with concrete requirements (`Content-Type`
allowlist, `Content-Length` cap, storage-bucket policy, virus-scan path
if needed). Keeping a vague "validate something someday" P3 on the
backlog adds noise without action.

**Re-open trigger:** any new route under `apps/web/src/app/api/` or any
client code that calls Supabase Storage `upload()` / `createSignedUploadUrl()`.

No file uploads in the app today. If/when added (avatars, broadcast
images), validate `Content-Type` and `Content-Length` at the API boundary,
not just trust the client.

---

## Reevaluation — 2026-06-07

Read-only re-audit against HEAD, graded with the
[audits README rubric](README.md#how-findings-are-graded) (P1 = ship-blocking
bug / data-loss / broken authz; P2 = next-sprint hardening; P3 = nice-to-have).
Scope: the feature surface added since the 2026-05-30 re-audit — chat messaging
(`conversations` / `messages` / `user_blocks`), media posts, gamification badges,
the capacity waitlist, account deletion + GDPR export, host-added teams, live
match scoring — plus the cron + data-export routes that grew alongside them.

### What's solid (verified safe this pass)

- **`pnpm audit --prod` → 0 vulnerabilities.** The P1 #0 / Bundle-2 dependency
  posture holds.
- **Chat access control** — `can_access_conversation` / `can_moderate_conversation`
  / `is_blocked_pair` are SECURITY DEFINER, `search_path = ''`, schema-qualified,
  and reused as the single gate by every chat RLS policy; `list_room_recipients`
  is **service-role only** (revoked from `public`). DM creation gates on block +
  anonymous + self-DM. `messages_insert` correctly enforces membership, non-anon,
  and the bidirectional block check.
- **`event_waitlist` RLS** — own-row select/insert/delete, host sees all; the
  promote-on-leave side effect runs admin (app-authorized, pitfall #8). Sound.
- **`set_user_badge_hidden`** is owner-scoped (`where user_id = auth.uid()`);
  **`feature_event_stream`** is host-gated (`is_event_host`); **`awardEventBadge`**
  self-authorizes via `canManage` and scopes deletes to `source='host'`.
- **GDPR export** ([account/export](../../apps/web/src/app/api/account/export/route.ts))
  runs entirely on the **user-scoped** client, every category filtered to the
  caller's own id, and excludes the push `auth` secret — RLS is the safety net.
- **P1 #14 page gate** is present (`load-event-detail.ts` + `generateMetadata`),
  deploy-gated as recorded — but see **P1 #15** for the REST route it missed.

---

### P1 #12 — ✅ RESOLVED 2026-06-07 (was a re-confirmed still-open regression): co-host / division CRUD bypass authorization

As-found, this was unchanged from 2026-05-30 except that it had survived two
deploys without the fix landing. **Fixed 2026-06-07** at the server-action
boundary (not the handler): `addEventCoHost` / `removeEventCoHost` and the three
division actions now call `assertCanManage(eventId)`, which loads
`GetEventDetailQuery.canManage` (host / co-host / group-owner-or-admin — the exact
set the manage UI gates on) and rejects everyone else before the admin-backed
handler runs. **Why the action boundary, not the handler** (a deviation from the
original recommendation): `canManage` is computed in the web layer from co-host +
group-membership data that the pure `@pickupvb/application` handler has no port
for, and the in-repo precedent for host-gated admin-client writes
(`record-division-winner-actions.ts`, `award-badge-actions.ts`,
`edit/sponsor-actions.ts`, `edit/badge-actions.ts`) all gate at the action with
`assertCanManage`. Matched that pattern. No action-level test was added — the
events/[id] action directory has none and the four sibling gates are untested
too; a future shared `requireEventManager` helper (DRY-ing all six copies) is the
natural home for a unit test. See the
[remediation entry](#2026-06-07--p1-12--p1-15--p2-13-authz--cron-hardening).

---

### P1 #15 — ✅ RESOLVED 2026-06-07: `GET /api/events/[id]` leaks any scoped / private / draft event, unauthenticated 🆕 2026-06-07

> **✅ Resolved 2026-06-07** via fix option (1): the route file
> `apps/web/src/app/api/events/[id]/route.ts` was **deleted** (it was unreferenced
> by the frontend — the app drives event detail through the page loader + server
> actions). The underlying `GetEventByIdHandler` is now unused by any route but
> remains wired in `handlers.ts`; it is still **ungated** and must not be
> re-exposed without a viewer/visibility gate. The orphaned `api/events`
> (GET/POST), `api/events/[id]/join`, and `.../leave` routes were left in place
> (authenticated, not leaking) pending confirmation there's no external API
> consumer. See the
> [remediation entry](#2026-06-07--p1-12--p1-15--p2-13-authz--cron-hardening).

**Category:** Broken access control / PII disclosure
**Files:**

- [apps/web/src/app/api/events/[id]/route.ts](../../apps/web/src/app/api/events/[id]/route.ts) — `GET` calls `handlers.getEventById.execute(new GetEventByIdQuery(params.id))` with **no `requireUser()` and no viewer**.
- [packages/application/src/queries/event-queries.handler.ts](../../packages/application/src/queries/event-queries.handler.ts) — `GetEventByIdHandler.execute({ id })` reads `repo.findById(id)` (admin client) and returns `title`, `description`, `rules`, `startsAt`, `attendeeCount`, and the full `location` block including `addressLine`, `latitude`, `longitude`. No `visibility` / `status` gate.

**Issue:** This is the **unclosed REST sibling of P1 #14.** The 2026-06-04 fix
gated the event-detail _page_ loader and `generateMetadata`, but this standalone
JSON endpoint reads the same admin-client repo with no gate and **no
authentication at all**. `GET /api/events/<id>` returns the full record for any
event id — including `friends_of_host` / `friends_of_attendees` / `invite_only`
events and **unpublished drafts** — to an anonymous, unauthenticated caller. The
exposed `location.addressLine` + `latitude` + `longitude` make this a
physical-location disclosure for private events, not just a metadata leak.

**Why P1:** Production-exploitable, unauthenticated disclosure of private user
data. Event UUIDs leak through share links, OG cards, and search; an attacker who
has (or enumerates) one reads a scoped event's address and exact coordinates with
a single unauthenticated GET. The endpoint is also **unreferenced by the frontend**
(no `fetch` call anywhere in `apps/web/src`), so it's pure attack surface with no
product value to weigh against removing it.

**Fix (pick one):**

1. **Delete the route** (and the now-orphaned `api/events/[id]/join`,
   `.../leave`, and `api/events` GET/POST if they're equally unused — confirm no
   external/mobile consumer first). Smallest surface.
2. **Gate it like the page:** add `requireUser()` and thread the viewer id into a
   visibility-aware query (delegate to the RLS-protected base `events` SELECT, the
   same pattern `load-event-detail.ts` now uses), returning 404 for events the
   viewer can't see. Anonymous callers get the static `published && (public |
invite_only)` check.

Either way, add a regression test (or e2e) asserting a `friends_of_host` event
returns 404 from this endpoint for a non-friend / anonymous caller — the same
shape as the `persona-olivia-social` spec that caught P1 #14.

---

### P2 #16 — RLS `UPDATE` policies don't pin privileged columns (owner can self-escalate via direct PostgREST) 🆕 2026-06-07

> **✅ Resolved 2026-06-07 (deploy-gated).** Added a `BEFORE UPDATE` guard trigger
> on each table — [media_posts](../../supabase/migrations/20260922000000_media_posts_guard_privileged_columns.sql)
> and [messages](../../supabase/migrations/20260922000100_messages_guard_privileged_columns.sql).
> Both are SECURITY INVOKER so `current_user` reflects the real caller: the
> trusted paths (SECURITY DEFINER functions running as the owner, and the
> `service_role` admin client) bypass; the event host / platform admin bypass on
> media_posts. A direct anon/authenticated write is then rejected for
> `media_posts` (featured false→true, status→'active', report_count edits — while
> still allowing the submitter's content edits, soft-remove, and the harmless
> featured true→false from remove/end-stream) and for `messages`
> (`conversation_id`/`sender_id` mutation, clearing `deleted_at`, report_count
> edits). No app-code or generated-types change — the app already authorizes via
> the handlers; this is the DB-level enforcement for direct-API callers.
> `media_posts_insert` was intentionally left open (community posting is allowed;
> the only escalation it enabled is closed by the featured guard). See the
> [remediation entry](#2026-06-07--p2-16-rls-column-pinning-on-media_posts--messages).

**Category:** Broken authorization / RLS column scoping
**Files:**

- [supabase/migrations/20260820000000_media_posts.sql#L223-L234](../../supabase/migrations/20260820000000_media_posts.sql#L223-L234) — `media_posts_update` `WITH CHECK` is `submitter_user_id = auth.uid() OR is_event_host(...) OR is_platform_admin()` with no column restriction; `media_posts_insert#L214-L220` requires only `submitter_user_id = auth.uid()` (no event-membership check).
- [supabase/migrations/20260824000000_chat_messaging.sql#L518-L527](../../supabase/migrations/20260824000000_chat_messaging.sql#L518-L527) — `messages_update` `USING`/`WITH CHECK` is `sender_id = auth.uid() OR can_moderate_conversation(...)`; it never re-asserts `can_access_conversation(conversation_id)` (unlike `messages_insert`) and doesn't pin `conversation_id` or `deleted_at`.

**Issue:** Supabase grants table-level `UPDATE` to `authenticated` by default; RLS
is the only gate, and an `UPDATE` policy that checks _who owns the row_ but not
_which columns changed_ lets the owner mutate **privileged** columns the feature
intends to be controlled elsewhere. Two concrete escalations, both reachable with
the caller's own JWT via a direct `PATCH` to PostgREST (the app's own code paths
are clean — `SupabaseMessageRepository.update` only writes `body`/`edited_at`/
`deleted_at`, and featuring goes through the host-gated RPC — so this is invisible
to the UI but live at the API):

1. **media_posts — bypass host curation + reverse moderation.** Any user may
   `INSERT` a `live_stream` media post pointed at **any event** (insert policy
   doesn't check event membership), then `PATCH featured=true` — the
   `media_posts_one_featured_stream` partial unique index only forbids _two_
   featured streams, so if none is featured the attacker's video becomes the
   host-promoted featured stream on someone else's event, despite
   `feature_event_stream` being host-gated. Separately, a submitter whose post was
   auto-hidden at 3 reports (or hidden by a host) can `PATCH status='active'` to
   un-hide it.
2. **messages — cross-room injection + un-delete.** A member of room A can `PATCH`
   one of their own messages, setting `conversation_id` to room B (which they
   cannot access); `WITH CHECK` passes on `sender_id` alone, the `broadcast_message`
   trigger fans it out live to `chat:B`, and room-B members see a message from a
   non-member. A sender can also `PATCH deleted_at=null` to resurrect a message a
   moderator soft-deleted.

**Why P2 (not P1):** conditional on an attacker hand-crafting PostgREST calls (no
UI path), and the blast radius is content-integrity / moderation rather than PII
or account takeover — but it's a genuine authorization bypass on write paths, the
same class as pitfall #8, and the two surfaces are the app's primary UGC
moderation story.

**Fix:** RLS `WITH CHECK` can't compare to `OLD`, so pin privileged columns with a
`BEFORE UPDATE` trigger (SECURITY DEFINER, `search_path=''`) that rejects changes
to the protected columns unless the actor is the privileged party:

- `media_posts`: reject a change to `featured` / `status` / `report_count` unless
  `is_event_host(old.event_id) OR is_platform_admin()` (let the submitter still
  edit `title` / `description` / `video_url`). Also add an event-membership /
  host check to `media_posts_insert` if posting is meant to be scoped.
- `messages`: reject any change to `conversation_id` (immutable); reject clearing
  `deleted_at` unless `can_moderate_conversation(conversation_id)`. Equivalent:
  route edits/soft-deletes through a SECURITY DEFINER RPC and drop the broad
  table `UPDATE` grant.

Add a regression test per surface (e.g. "submitter cannot self-feature",
"sender cannot move a message across conversations").

---

### P3 #17 — `/api/sentry-test` is publicly invokable 🆕 2026-06-07

> **✅ Resolved 2026-06-07.** The `GET` now gates on
> [`isCronAuthorized`](../../apps/web/src/lib/cron-auth.ts) — open in local dev
> (no `CRON_SECRET`), secret-required on every deployed environment — and returns
> 404 to unauthorized callers so the debug surface stays invisible. Kept (not
> deleted) so Sentry can still be verified on a deployed env via
> `curl -H "Authorization: Bearer $CRON_SECRET" …`. See the
> [remediation entry](#2026-06-07--p3-17-sentry-test-gated).

**Category:** Stale debug surface / abuse
**File:** [apps/web/src/app/api/sentry-test/route.ts](../../apps/web/src/app/api/sentry-test/route.ts)

**Issue:** A `GET` endpoint that intentionally `throw`s, captures a Sentry message,
or fires an unhandled rejection (`?kind=unhandled`) — with no auth. Anyone can hit
it in a loop to inflate Sentry error volume / quota cost and pollute the error
feed, and `?kind=unhandled` deliberately creates unhandled rejections in the
serverless runtime. It's a debug helper that shouldn't be reachable in production.

**Fix:** Return 404 when `NODE_ENV === 'production'` (or gate behind the same
`CRON_SECRET`/admin check as the crons), or delete it — the Sentry integration is
long since verified.

**Stale-code note (informational):** while confirming P1 #15, the REST routes
`api/events` (GET/POST), `api/events/[id]` (GET), `api/events/[id]/join`, and
`.../leave` were found to have **no `fetch` references anywhere in
`apps/web/src`** — the app drives all of this through server actions. The
authenticated ones (`join` / `leave` / create) are not insecure, but they are
unmonitored attack surface with no product consumer. Recommend confirming there's
no external/mobile API consumer, then deleting them (closes P1 #15 for free) or
documenting them as a supported public API with explicit auth + rate-limit
expectations.

---

## Reevaluation — 2026-05-30

Read-only re-audit against HEAD, graded with the
[audits README rubric](README.md#how-findings-are-graded) (P1 = bug /
data-loss / broken behavior; P2 = important hardening/quality; P3 =
nice-to-have). Scope: the feature surface added since the 2026-05-17 audit
— brackets, leagues, event divisions, ad-hoc + walk-in registrations,
community listings, host payments — plus the cron / data-export routes that
grew alongside them. Lens: authorization on write paths, admin-client (RLS
bypass) usage, route auth.

### What changed since the last audit

The 2026-05-17 → 05-24 backlog (open-redirect, CSP, admin-client refactor of
the checkout/tip/manage-payments actions, rate limiting, FormData cap,
Turnstile freshness) is **closed**. The codebase roughly doubled since: the
new aggregates each added their own server actions and command handlers.
Most follow the sanctioned patterns — community-listing actions delegate to
host-authorized handlers; walk-in / mark-paid-cash handlers carry explicit
`event.hostId === requesterId` guards; `recordDivisionWinner` checks
`canManage` on a **user-scoped** client; team delete/broadcast enforce the
captain check in the app layer before any admin write. Two paths did not.

---

### P1 #12 — Division CRUD + co-host add/remove bypass authorization (admin-client → RLS-bypass; privilege escalation + data loss) 🆕 2026-05-30

> **✅ Resolved 2026-06-07.** Both server actions now gate on `assertCanManage(eventId)`
> (the host / co-host / group-owner-or-admin `canManage` set, mirroring
> `record-division-winner-actions.ts`) before invoking the handler; the handlers'
> RLS-reliance comments were corrected to point at the action-boundary gate. See the
> [remediation entry](#2026-06-07--p1-12--p1-15--p2-13-authz--cron-hardening).
>
> **🔴 As-found 2026-06-07 — was STILL OPEN; the 2026-05-30 fix was never applied.**
> Re-verified exploitable at HEAD. Both server actions still only `requireSession()`,
> both handlers still carry the unchanged "authz lives at the DB layer (RLS)" comment
> with no app-layer host check, and `eventRepo = new SupabaseEventRepository()`
> ([handlers.ts#L166](../../apps/web/src/lib/handlers.ts#L166)) still has no injected
> client, so it lazily builds a **service-role** client and the RLS the comments rely on
> never fires. The `mapErrorAndFlash` in
> [co-host-actions.ts#L34](../../apps/web/src/app/events/[id]/co-host-actions.ts#L34)
> even maps `UnauthorizedError` to a flash — but nothing on the path ever throws it.
> This is the single highest-priority open item in this file.

**Category:** Broken authorization / privilege escalation
**Files:**

- [packages/infrastructure/src/supabase-event-repository.ts#L289-L295](../../packages/infrastructure/src/supabase-event-repository.ts#L289-L295) — `SupabaseEventRepository` lazily builds a **service-role** client (`createSupabaseAdminClient()`) when none is injected.
- [apps/web/src/lib/handlers.ts#L171-L175](../../apps/web/src/lib/handlers.ts#L171-L175) — `eventRepo` is constructed with **no client**, then handed to all five handlers.
- [packages/application/src/commands/event-division.handler.ts#L20-L47](../../packages/application/src/commands/event-division.handler.ts#L20-L47) — `Add/Update/RemoveEventDivisionHandler`: comment says auth "lives at the DB layer (RLS) … we intentionally don't duplicate that check here."
- [packages/application/src/commands/co-host.handler.ts#L6-L12](../../packages/application/src/commands/co-host.handler.ts#L6-L12) — `Add/RemoveEventCoHostHandler`: same RLS-reliance comment.
- [apps/web/src/app/events/[id]/division-actions.ts#L91](../../apps/web/src/app/events/%5Bid%5D/division-actions.ts#L91) and [co-host-actions.ts#L48](../../apps/web/src/app/events/%5Bid%5D/co-host-actions.ts#L48) — both server actions only `requireSession()` (anonymous-allowed); no host check.

**Issue:** The five handlers do **no** application-layer authorization. They
load the event, mutate it (`event.addDivision(division)`,
`repo.addCoHost(eventId, party, requesterId)`, …) and `save()` — and the
aggregate mutators take **no actor**, so they cannot enforce host identity
either. The handler comments document the intent: authorization is delegated
to the RLS policies on `event_divisions` / `event_co_hosts`. But those
mutations run through `eventRepo`, which — constructed with no client —
lazily self-builds a **service-role** client that **bypasses RLS entirely**.
The policy never executes; nothing throws. The bound server actions only
`requireSession()`, which is satisfied by any logged-in user, including
Supabase **anonymous** users. Both `eventId` and the co-host `party` are
attacker-supplied server-action arguments.

This is the precise scenario AGENTS.md pitfall #8 warns about — _"an adapter
that lazily builds its own admin client hides the same gap"_ — and a third
instance of the [P2 #4](#4-admin-supabase-client-used-for-user-driven-writes)
class (after the checkout/tip/manage-payments actions and the bracket/league
match-result writes), this time with **zero** app-layer guard. The
neighbouring `recordDivisionWinner`/`league-roster`/`league-schedule`
handlers already do the right thing (explicit `canManage` / `hostId` check),
which makes these two paths a clear oversight rather than a design choice.

**Why P1:** Production-exploitable broken authorization on write paths.

- **Co-host:** an attacker calls `addEventCoHost(eventId, { userId: <self> })`
  for any event → becomes a co-host → `GetEventDetailQuery.canManage` returns
  true → the entire host surface opens up (edit event, cancel, manage
  payments, **Pro attendee CSV export of PII**, record winners, broadcasts).
  Privilege escalation.
- **Division:** `removeEventDivision(eventId, divisionId)` on someone else's
  event deletes a division; depending on FK cascade this can take registered
  teams / free-agents / attendees / bracket rows with it → **data loss** on a
  live event. `add`/`update` let an attacker corrupt another host's
  tournament configuration (pricing, capacity, format).

**Fix:** Mirror the resolved match-result fix (security P2 #4 follow-on) and
the correct `recordDivisionWinner` pattern — two equivalent options:

1. **(preferred, consistent with `league-schedule`/`league-roster`)** Add an
   explicit host/co-host/group-admin authorization check at the top of each
   of the five handlers using the `requesterId` / `userId` they already
   receive (it's currently "reserved for future audit columns"). Load the
   event, and throw `UnauthorizedError` unless the requester is the host, an
   existing co-host, or an owner/admin of the primary host group. Then update
   the now-false RLS-reliance comments.
2. Route these mutations through a **per-request user-scoped** repository
   (like `getMatchResultHandlers()` in
   [handlers.ts](../../apps/web/src/lib/handlers.ts)) so the RLS policies the
   comments rely on actually fire.

Either way, add handler tests asserting **non-host → `UnauthorizedError`**
(the test name encodes the why, per AGENTS.md testing guidance). While here,
audit the other handlers wired to the singleton admin-backed `eventRepo`
([handlers.ts](../../apps/web/src/lib/handlers.ts)) for the same gap; the
walk-in, free-agent, and create-event paths were verified to self-authorize,
but the pattern is easy to re-introduce.

---

### P2 #13 — Cron routes fail _open_ when `CRON_SECRET` is unset 🆕 2026-05-30

> **✅ Resolved 2026-06-07.** All seven routes (the six Vercel crons + the
> pg_cron-triggered `badges/reconcile`) now call the shared
> [`isCronAuthorized`](../../apps/web/src/lib/cron-auth.ts), which **fails closed in
> production** (unset `CRON_SECRET` ⇒ only non-prod may run unauthenticated) and uses
> a constant-time token compare. Regression test:
> [cron-auth.test.ts](../../apps/web/src/lib/cron-auth.test.ts). See the
> [remediation entry](#2026-06-07--p1-12--p1-15--p2-13-authz--cron-hardening).
>
> **🟠 As-found 2026-06-07 — was STILL OPEN and WORSE.** The fail-open guard was
> copied verbatim into three crons added since: `account/execute-deletions`
> ([route.ts#L22-L26](../../apps/web/src/app/api/account/execute-deletions/route.ts#L22-L26))
> — **hard-deletes accounts** past the grace window —
> `community-listings/auto-approve`
> ([route.ts#L24-L28](../../apps/web/src/app/api/community-listings/auto-approve/route.ts#L24-L28)),
> and `badges/reconcile`
> ([route.ts#L27-L31](../../apps/web/src/app/api/badges/reconcile/route.ts#L27-L31)).
> Six cron routes now share the same `if (!secret) return true` line; none has been
> factored into the shared `lib/cron-auth.ts` helper the original finding recommended.
> The destructive account-deletion endpoint raises the blast radius from "spam /
> cost" to "mass account deletion" if `CRON_SECRET` is ever absent in prod.

**Category:** Authentication / fail-safe defaults
**Files:**

- [apps/web/src/app/api/notifications/worker/route.ts#L45-L50](../../apps/web/src/app/api/notifications/worker/route.ts#L45-L50)
- [apps/web/src/app/api/notifications/reminders/route.ts#L36-L41](../../apps/web/src/app/api/notifications/reminders/route.ts#L36-L41)
- [apps/web/src/app/api/notifications/outbox-purge/route.ts#L23-L28](../../apps/web/src/app/api/notifications/outbox-purge/route.ts#L23-L28)

**Issue:** Each route's auth guard is `const secret = process.env['CRON_SECRET']; if (!secret) return true; …` — i.e. **no secret configured ⇒ request authorized**. All three run on the **service-role** admin client. The "dev fallback" is convenient locally, but it is a fail-**open** posture: if `CRON_SECRET` is ever absent in the production env (rotation slip, new-environment bootstrap, typo'd key name), these endpoints become world-invokable:

- `worker` drains the notification outbox → fires real email (Resend) + web-push. Repeated anonymous hits → cost + sender-reputation damage.
- `reminders` triggers reminder fan-out to attendees → spam vector.
- `outbox-purge` **deletes** outbox rows older than the cutoff → destructive history loss.

Minor sub-point: the comparison `header === \`Bearer ${secret}\``is not constant-time. Over network jitter this is not practically exploitable, but a`crypto.timingSafeEqual` on the decoded token is the standard hardening.

**Why P2:** Conditional on a prod misconfiguration rather than exploitable as-shipped, but the failure mode is severe (destructive + cost-bearing on the admin client) and the fix is a one-liner per route — a fail-safe-defaults issue worth closing now.

**Fix:** Fail **closed** in production. Replace the dev fallback with:

```ts
function isAuthorized(req: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret) {
    // Fail closed in prod; only the local dev fallback may run unauthenticated.
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(header, expected);
}
```

Better still, validate `CRON_SECRET` presence at module load in production and throw `InvariantViolation` so a misconfigured deploy fails fast rather than silently opening the routes. Factor the guard into one shared helper (`lib/cron-auth.ts`) so all three routes — and any future cron endpoint — inherit the fix.

---

## ✅ Verified safe

- **RLS coverage** — every public table has RLS enabled with policies;
  service-role-only tables (`stripe_webhook_events`, `host_stripe_accounts`,
  `notification_outbox`, `host_subscriptions`) are RLS-on with no policies
  and only touched via admin client. Correct pattern.
- **Anonymous gating** — `is_anonymous` correctly checked on payment,
  payout, and Pro paths (`rsvp-actions.ts:49`, `profile/billing/actions.ts:36`,
  `profile/billing/pro/actions.ts:72`).
- **SSRF** — geocoding proxies fetch only fixed hosts (Photon, Nominatim)
  with `encodeURIComponent` on user input.
- **XSS** — only `dangerouslySetInnerHTML` usages are for JSON-LD scripts
  built from `JSON.stringify` of server-built data.
- **CSRF** — covered by Next.js Server Actions origin checks (no
  state-mutating GETs).
- **Stripe webhook signature verification** — correct raw-body order,
  event-id dedup table, 400 on bad signature.
- **Email / slug / handle validation** — present at each input boundary.
- **Capacity overflow** — guarded at app + DB layer (trigger in
  `20260512000000_init.sql`).
- **Domain error typing** — no string error codes; all `DomainError`
  subclasses with HTTP boundary mapping in `apps/web/src/lib/api-helpers.ts`.
- **`.env` not committed** — verified via `git ls-files`.

---

## Quick-win bundle

These can be batched into one PR (~30–45 min):

1. **(P1)** Sanitize `next` param in `auth/callback`.
2. **(P2)** Add HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy`, `X-Frame-Options` via `next.config.mjs`.
3. **(P2)** Strip email field from two `log.*` calls.
4. **(P2)** Add Stripe webhook metadata cross-check.

The bigger items deserve their own PR each:

- **(P2)** CSP rollout (report-only first).
- **(P2)** Admin-client refactor across server actions.
- **(P2)** Rate limiting on email paths (pick a KV backend first).

---

## Remediation log

### 2026-06-07 — P3 #8 (audit-log coverage)

Extended the refund-only `event_payment_audit` to a generic append-only
[`audit_log`](../../supabase/migrations/20260923000000_audit_log.sql) covering
the four flagged categories. Service-role write/read only (RLS-on, no policies —
mirrors `event_payment_audit`; a user-writable audit trail is worthless). The
[`recordAuditEvent`](../../apps/web/src/lib/audit-log.ts) helper is **fail-quiet**
(an audit write never blocks/fails the action it records) and is called only
after the underlying mutation succeeds.

| Category                      | Site                                                                        | Action(s)                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Group member add/remove/role  | [member-actions.ts](../../apps/web/src/app/groups/member-actions.ts)        | `group_member.added` / `.removed` / `.role_changed` (actor + target + role)                                     |
| Event co-host add/remove      | [co-host-actions.ts](../../apps/web/src/app/events/[id]/co-host-actions.ts) | `event.co_host_added` / `.co_host_removed` (actor + target user / group)                                        |
| Stripe Connect account mirror | [connect.ts](../../apps/web/src/lib/webhooks/connect.ts)                    | `host_stripe.account_updated` (host + charges/payouts/details flags; host lookup hoisted, reused for analytics) |
| Host-subscription state       | [subscription.ts](../../apps/web/src/lib/webhooks/subscription.ts)          | `host_subscription.changed` (host + eventType/status/plan/cancelAtPeriodEnd)                                    |

`entity_id` is text (holds our uuids + Stripe `acct_…`/`sub_…` ids); actor/target
FKs are `ON DELETE SET NULL` so the ADR 0029 account-deletion purge preserves the
trail. Generated types were hand-edited to add `audit_log` (will be canonicalised
on the next `gen:types`). Verified `pnpm typecheck && lint && test && build` green.
**Deploy-gated** — CI applies the migration. Follow-up: a retention cron to prune
old rows (noted in the migration), and surfacing the trail in an admin view.

### 2026-06-07 — P1 #14 spectator follow-up (bracket/schedule/watch)

Closed the last open branch of P1 #14: the bracket / schedule / watch spectator
pages read event metadata via `getBracketMeta` on the admin client (RLS-bypassed),
leaking a _scoped_ (`friends_of_*` / `private`) or unpublished tournament's title +
division structure. New shared helper
[event-visibility.ts](../../apps/web/src/lib/event-visibility.ts):

| Piece                              | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assertEventVisibleOrNotFound(id)` | Cache-preserving page-body gate. A published public/invite_only event passes for everyone with one admin-client `status,visibility` read and **no `cookies()`** (the page stays cacheable); only a scoped/unpublished event falls back to a per-viewer RLS existence check (delegating to `events_select`). Applied to [bracket](../../apps/web/src/app/events/[id]/bracket/page.tsx), [watch](../../apps/web/src/app/events/[id]/bracket/watch/page.tsx), [schedule](../../apps/web/src/app/events/[id]/schedule/page.tsx) page bodies. |
| `isEventPubliclyVisible(id)`       | Used by `generateMetadata` (watch + schedule) and the shared bracket-watch OG renderer ([\_og.tsx](../../apps/web/src/app/events/[id]/bracket/watch/_og.tsx)) to emit a **generic** title/card for non-anon-visible events instead of leaking the real one. The `status,visibility` read is deduped across `generateMetadata` + body via React `cache`.                                                                                                                                                                                  |

Design note: the bracket data itself is intentionally public (`event_brackets` /
`bracket_matches` RLS is `using (true)`) and most tournaments are public, so the
common path is unchanged + still cacheable; only scoped/draft events (where the
host is the audience) become per-viewer dynamic. No domain/type change. Verified
`pnpm typecheck && lint && test && build` green (268 web tests).

### 2026-06-07 — P3 #17 (sentry-test gated)

[apps/web/src/app/api/sentry-test/route.ts](../../apps/web/src/app/api/sentry-test/route.ts)
`GET` now returns 404 unless `isCronAuthorized` passes (open in local dev with no
`CRON_SECRET`; Bearer-secret-required on every deployed env). Closes the
public-abuse vector (loop-to-inflate-Sentry-quota / forced unhandled rejections)
while keeping the diagnostic usable by an authorized caller — gated rather than
deleted because the maintainer keeps such diagnostics (cf. the `test-push`
route). Reuses the P2 #13 helper rather than a bespoke `NODE_ENV` check, which
would also have 404'd on Vercel **preview** (where `NODE_ENV=production`).
Verified `pnpm typecheck && lint && test && build` green. **This closes every
finding from the 2026-06-07 re-audit.**

### 2026-06-07 — P2 #16 (RLS column-pinning on media_posts + messages)

Closed the two RLS `UPDATE` column-pinning gaps with `BEFORE UPDATE` guard
triggers (RLS WITH CHECK can't reference the OLD row). Both triggers are
SECURITY INVOKER + `search_path = ''`; the legitimate writers were mapped from
the aggregate + handlers first so no real flow breaks.

| Item                  | Status                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **media_posts** guard | ✅ Fixed (deploy-gated) | [20260922000000](../../supabase/migrations/20260922000000_media_posts_guard_privileged_columns.sql) — rejects, for a direct anon/authenticated non-host write: `featured` false→true (self-feature, bypassing the host-gated `feature_event_stream` RPC), `status`→'active' (resurrecting a reported/hidden post), and `report_count` edits. Allows the submitter's content edits, `remove()`→'removed', and the harmless `featured` true→false side-effect of remove/end-stream. Host/admin and SECURITY DEFINER/`service_role` paths bypass. |
| **messages** guard    | ✅ Fixed (deploy-gated) | [20260922000100](../../supabase/migrations/20260922000100_messages_guard_privileged_columns.sql) — rejects `conversation_id`/`sender_id` mutation (immutable; closes cross-room injection), clearing `deleted_at` (soft-delete is one-way; closes moderator-removal resurrection), and `report_count` edits. The sender-edit / soft-delete / `messages_after_report` paths are unaffected.                                                                                                                                                     |

No TypeScript, app-code, or generated-types change (no schema/column change).
`media_posts_insert` left open by design (community posting is allowed; the
escalation it enabled is closed by the featured guard). Verified
`pnpm typecheck && lint && test && build` green (SQL-only ⇒ full turbo cache).
**Deploy-gated** — CI applies the migrations on deploy; can't verify locally per
the repo's no-local-Docker policy, so correctness is established by reasoning
(documented in each migration preamble). A future pgTAP/e2e check (submitter
cannot self-feature; sender cannot move a message across conversations) would pin
it executably.

### 2026-06-07 — P1 #12 + P1 #15 + P2 #13 (authz + cron hardening)

Three findings from the same-day re-audit, fixed in one bundle.

| Item                                           | Status   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1 #12** — co-host / division authz bypass   | ✅ Fixed | `assertCanManage(eventId)` added to both [co-host-actions.ts](../../apps/web/src/app/events/[id]/co-host-actions.ts) and [division-actions.ts](../../apps/web/src/app/events/[id]/division-actions.ts) — gates on `GetEventDetailQuery.canManage` (host / co-host / group-owner-or-admin) before the admin-backed handler runs. The five handlers' false "authz lives at RLS" comments were corrected to point at the action-boundary gate. Co-host gate throws `UnauthorizedError` (→ existing `?cohost=unauthorized` flash); division gate redirects to `?rsvp=forbidden` (mirrors `record-division-winner-actions.ts`). |
| **P1 #15** — unauthenticated event-detail leak | ✅ Fixed | Deleted the unreferenced `api/events/[id]/route.ts`. `GetEventByIdHandler` is now route-less but still wired + ungated — flagged not to re-expose without a viewer gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **P2 #13** — cron fail-open                    | ✅ Fixed | New shared [`isCronAuthorized`](../../apps/web/src/lib/cron-auth.ts) — **fails closed in production** (unset `CRON_SECRET` ⇒ only non-prod runs unauthenticated) + constant-time compare. Wired into all 7 routes: `worker`, `reminders`, `league-reminders`, `outbox-purge`, `account/execute-deletions`, `community-listings/auto-approve`, `badges/reconcile`. New test [cron-auth.test.ts](../../apps/web/src/lib/cron-auth.test.ts) (5 cases incl. fail-closed-in-prod).                                                                                                                                              |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅
(268 web tests pass; lint 0 errors). Deleting the route left a stale
`.next/types` validator → cleared `apps/web/.next` and rebuilt to regenerate.

**Still open from the 2026-06-07 re-audit:** **P2 #16** (RLS `UPDATE`
column-pinning on `media_posts` + `messages` — needs `BEFORE UPDATE` trigger
migrations, deferred) and **P3 #17** (`/api/sentry-test` public — one-line
`NODE_ENV` gate or delete).

### 2026-06-04 — scoped event-detail visibility gate (P1 #14)

| Item                | Status                  | Notes                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logged-in read gate | ✅ fixed (deploy-gated) | `loadEventDetail` runs a user-scoped existence check on the RLS-protected base `events` table before returning; a viewer who can't `SELECT` the row → `notFound()`. Delegates to the canonical `events_select` policy.                                                                   |
| Anon read gate      | ✅ fixed (deploy-gated) | `loadEventDetail` gates the cacheable anon path with a static `published && (public \| invite_only)` check (anon has no friend edges).                                                                                                                                                   |
| Metadata gate       | ✅ fixed (deploy-gated) | `generateMetadata` emits a generic, noindex title for non-anon-visible events so scoped titles don't leak in `<head>`/og.                                                                                                                                                                |
| Spectator pages     | ✅ fixed 2026-06-07     | `getBracketMeta` (bracket/schedule/watch) page bodies + both `generateMetadata`s + the bracket-watch OG image now gate via `assertEventVisibleOrNotFound` / `isEventPubliclyVisible`. See the [2026-06-07 spectator entry](#2026-06-07--p1-14-spectator-follow-up-bracketschedulewatch). |

Regression coverage: `apps/web/tests/e2e/persona-olivia-social.authed.spec.ts`
(asserts a `friends_of_host` event is hidden from a non-friend). Deploy-gated —
the e2e goes green once the fix ships to dev. See
[journal 2026-06-04](../journal/2026-06-04-bundle-persona-e2e-real-bugs.md).

### 2026-05-31 — CSP `frame-src` for media video embeds

| Item                          | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Widen `frame-src`             | ✅ Done | [apps/web/next.config.mjs](../../apps/web/next.config.mjs) — added `https://www.youtube-nocookie.com`, `https://www.youtube.com`, `https://player.twitch.tv`, `https://clips.twitch.tv`. These are the exact embed hosts built by [video-embed.tsx](../../apps/web/src/components/video-embed.tsx). The enforcing CSP (Bundle 27) had been blocking every YouTube/Twitch media post + profile video embed. |
| Scope check (no other deltas) | ✅ Done | `frame-src` only. The framed third-party document loads its own scripts / images / XHR under its own origin, so no `img-src` / `connect-src` / `script-src` entries were needed. Not a CORS issue — embeds are iframes, not cross-origin fetch from our code. Instagram / TikTok / Facebook / `other` render as link cards (no iframe), so no entry for them.                                              |
| Comment refresh               | ✅ Done | Extended the inline CSP-rationale inventory in `next.config.mjs` with a "Media embeds" bullet so the next reader sees why these hosts are allowlisted and why no other directive changed.                                                                                                                                                                                                                  |

Verified after landing: `pnpm --filter @pickupvb/web build` ✅ (validates the
header config + route type generation). Full narrative:
[journal](../journal/2026-05-digest.md#csp-media-embeds).

### 2026-12-04 — Captain-RLS on match-result writes (P2 #4 follow-on)

**Problem.** The captain-reachable match-result writes persisted through
the service-role admin client, bypassing the RLS policies meant to gate
them, so any signed-in real user could record/overwrite any match:

- **Bracket** — `RecordMatchResultHandler` / `ResetMatchHandler` →
  `SupabaseBracketRepository.save` (full-replace `save_bracket` RPC) on the
  admin client. The bracket server actions even passed `requesterId = ''`,
  delegating authz wholly to the `bracket_matches_update` /
  `bracket_match_sets_write` policies — which never fired.
- **League** — `RecordLeagueMatchResultHandler` →
  `SupabaseLeagueScheduleRepository.save` (`save_league_schedule`) on the
  admin client; `league_schedule_matches_update` (host or captain) never
  fired.

The repos self-construct the admin client internally, so Bundle 14's
"swap admin → server client" sweep across pages/actions didn't reach them.

**Fix.**

| Piece                                   | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration `record_league_match_result`  | [20260814000000](../../supabase/migrations/20260814000000_record_league_match_result_rpc.sql) — `SECURITY INVOKER` single-row UPDATE; `league_schedule_matches_update` (host or either captain) is the gate. Raises `42501` (not authorized) / `P0002` (not found); 0-rows-after-update is treated as not-authorized since the public SELECT policy makes the row otherwise visible.                                                                                                                                                                                                                                                                                                                 |
| Migration `record_bracket_match_result` | [20260814000100](../../supabase/migrations/20260814000100_record_bracket_match_result_rpc.sql) — `SECURITY DEFINER`. Recording a result mutates rows a captain has no grant on (the downstream match the winner advances into; the bracket header on completion), so pure INVOKER can't work. Resolves the event behind the actor match, requires `is_event_host(event) OR is_bracket_match_captain(actor_match)`, then delegates to `save_bracket` (advancement/completion logic stays in the tested TS aggregate). `auth.uid()` is the end user inside the DEFINER body; the nested INVOKER `save_bracket` runs as the BYPASSRLS owner, so the downstream writes land _after_ the per-match authz. |
| Domain ports                            | `LeagueScheduleRepository.recordMatchResult`; `BracketRepository.saveAsMatchActor(bracket, actorMatchId)`. The host-only full-replace `save` stays for create/seed/generate/reset/reorder (authorized in the app layer, admin client).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Adapters                                | Both repos gained an optional user-scoped-client constructor arg and map `42501` → `UnauthorizedError`, `P0002` → `NotFoundError`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Composition root                        | `getMatchResultHandlers()` builds the three handlers per request around `getServerSupabase()` (user-scoped). The three were removed from the module-singleton `handlers` so the admin-bypass path can't be reused.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Server actions                          | `bracket/actions.ts` + `schedule/actions.ts` call `getMatchResultHandlers()` and pass the real `user.id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tests                                   | New `bracket.handler.test.ts` + extended `league-schedule.handler.test.ts` pin that record/reset use the narrow RLS-enforced methods, never the host-only `save` (the regression that re-opens the gap).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Stripe webhook handlers and the host-gated bracket/league operations keep
the admin client (correct — webhooks run session-less; host ops are
app-layer-authorized). `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
green. Full narrative:
[journal](../journal/2026-05-digest.md#bundle-captain-rls-match-result).

### 2026-05-23 — Bundle 53: Security P3 audit-text closure (#9, #10, #11)

| Item                                                                      | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3 #9 FormData hard cap — header flipped to ✅ (code closed Bundle 17)    | ✅ Done | Finding header now carries an inline `Status: ✅ Resolved 2026-05-24 (Bundle 17)` line pointing at `FIELD_HARD_MAX = 4096` in [form-data.ts](../../apps/web/src/lib/form-data.ts) and the existing test coverage. Bundle 17 shipped the code but left the audit text untagged, so the finding still read as open in scans. No code change.                                                                    |
| P3 #10 Turnstile freshness — header flipped to ✅ (code closed Bundle 17) | ✅ Done | Same situation as #9 — code-closed in Bundle 17, audit text untagged until this bundle. Header now points at `TURNSTILE_MAX_AGE_MS` in [turnstile.ts](../../apps/web/src/lib/turnstile.ts) and the matching test. No code change.                                                                                                                                                                             |
| P3 #11 File-upload hardening — closed as wontfix-preemptive               | ✅ Done | No upload endpoints exist; keeping a vague "validate something someday" P3 on the backlog adds noise without action. Closed with explicit **re-open trigger** in the finding body: any new route under `apps/web/src/app/api/` or any client call to Supabase Storage `upload()` / `createSignedUploadUrl()`. Concrete requirements (allowlist, size cap, virus-scan path) will be specified at re-open time. |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅
(no code change, all cached).

**Open security items after this bundle:** P2 #3b (nonce-based CSP
hardening — drops `'unsafe-inline'` on `script-src` / `style-src`,
requires nonce threading through middleware) and P3 #8 (audit-log
coverage gaps — extend `event_payment_audit` or add `audit_log` to
cover group role changes, co-host add/remove, Stripe account mutations,
subscription state changes).

### 2026-05-24 — Bundle 17: FormData hard cap + Turnstile freshness (P3 #9, #10)

| Item                               | Status  | Notes                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global 4 KB cap on form fields     | ✅ Done | [apps/web/src/lib/form-data.ts](../../apps/web/src/lib/form-data.ts) — `FIELD_HARD_MAX = 4096` applied inside `rawValue()`, so `field()` / `fieldOrNull()` / `fieldOrUndefined()` / `bool()` all inherit the ceiling. Per-call `maxLen` still narrows; it can never raise the ceiling.                  |
| Turnstile `challenge_ts` freshness | ✅ Done | [apps/web/src/lib/turnstile.ts](../../apps/web/src/lib/turnstile.ts#L13-L84) — reject tokens whose `challenge_ts` is older than 2 min. Replays return `{ ok: false, error: 'Verification expired. Please try again.' }`. Missing `challenge_ts` is accepted (Cloudflare always returns one on success). |
| Tests                              | ✅ Done | [form-data.test.ts](../../apps/web/src/lib/form-data.test.ts) — bare/slot-prefixed truncation, `fieldOrNull` cap precedence. [turnstile.test.ts](../../apps/web/src/lib/turnstile.test.ts) — fresh success, omitted `challenge_ts`, stale token rejection, error-codes path, empty token.               |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

**Follow-ups:**

- P3 #11 (file-upload hardening) is still preemptive — re-evaluate when
  the first upload endpoint lands.
- P3 #8 (audit-log coverage) is the largest open security P3 and the
  natural next bundle: extend `event_payment_audit` (or a sibling
  `audit_log` table) to cover group role changes, co-host add/remove,
  Stripe account mutations, and subscription state changes.

### 2026-05-24 — Bundle 16: rate limiting on email-sending paths (P2 #6)

| Item                                | Status  | Notes                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres-backed limiter migration   | ✅ Done | [20260610000000_rate_limits.sql](../../supabase/migrations/20260610000000_rate_limits.sql) — `public.rate_limits(key, count, window_start)` + `consume_rate_limit(p_key, p_limit, p_window_seconds)` `security definer` RPC. Atomic via `insert … on conflict do update`. Table locked down (RLS on, no policies); service role only via the function. |
| `consumeRateLimit()` helper         | ✅ Done | [apps/web/src/lib/rate-limit.ts](../../apps/web/src/lib/rate-limit.ts) — admin-client RPC wrapper, fail-open on infra error (logged via `log.warn`). `getClientIp()` reads `x-forwarded-for` (Vercel) with `x-real-ip` fallback.                                                                                                                       |
| `claimAccount` gated                | ✅ Done | [apps/web/src/app/claim/actions.ts](../../apps/web/src/app/claim/actions.ts) — 20/h per IP, 5/h per email; blocks `updateUser({ email })` (Supabase confirmation send) when over.                                                                                                                                                                      |
| `signupAsGuest` gated               | ✅ Done | [apps/web/src/app/events/%5Bid%5D/guest-actions.ts](../../apps/web/src/app/events/%5Bid%5D/guest-actions.ts) — same limits, only when an email is supplied (the abuse vector for P2 #6).                                                                                                                                                               |
| `startGuestTicketCheckout` gated    | ✅ Done | [apps/web/src/app/events/%5Bid%5D/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts) — same limits; `backWithError(eventId, 'rate_limited', …)` flash to surface the error.                                                                                                                                              |
| `rate_limited` banner               | ✅ Done | [apps/web/src/lib/event-rsvp-flash.ts](../../apps/web/src/lib/event-rsvp-flash.ts) — new `rate_limited` entry, `error` tone.                                                                                                                                                                                                                           |
| `api/notifications/worker/route.ts` | ⏭ Skip | Listed by the audit but cron-only and `CRON_SECRET`-guarded. No user-driven abuse surface; per-IP / per-email keys would be meaningless. Documented in the [Bundle 16 journal](../journal/2026-05-digest.md#bundle-16).                                                                                                                                |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

**Follow-ups:**

- Generated `database.types.ts` doesn't yet include the new RPC — the
  `consumeRateLimit` helper casts the rpc handle. Run
  `pnpm --filter @pickupvb/supabase gen:types` after applying the
  migration locally to drop the cast.
- A periodic prune of stale `public.rate_limits` rows is not yet scheduled.
  Volume is tiny (one row per active key, naturally collapses on next hit)
  but a nightly `delete from public.rate_limits where window_start < now() - interval '1 day'`
  would keep the table tidy.
- If traffic ever makes Postgres write contention visible on this path,
  swap the helper's backend to Upstash / Vercel KV behind the same
  `consumeRateLimit()` signature.

### 2026-05-22 — Bundle 27: CSP enforcement (P2 #3a)

| Item                                     | Status                           | Notes                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap header to `Content-Security-Policy` | ✅ Done                          | [apps/web/next.config.mjs](../../apps/web/next.config.mjs) — single one-line swap from `Content-Security-Policy-Report-Only`. Same allowlist that soaked behind Report-Only since Bundle 15 (2026-05-24); no policy changes. Browsers now block any script / style / connect / img / frame / font / worker target that isn't on the allowlist. |
| Comment refresh                          | ✅ Done                          | Updated the inline policy-rationale comment in `next.config.mjs` to reflect enforcement mode and re-pointed the nonce follow-up at the new **P2 #3b** entry.                                                                                                                                                                                   |
| Nonce-based hardening                    | 🟡 Wontfix (assessed 2026-06-07) | `'unsafe-inline'` stays on `script-src` (dynamic JSON-LD, can't be hashed; a nonce forces site-wide dynamic rendering) + `style-src` (inline `style` attributes + Leaflet/Radix can't carry a nonce). Full cost/benefit + re-open triggers in **[P2 #3b](#3b-nonce-based-csp-hardening-drop-unsafe-inline)**.                                  |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-24 — Bundle 15: CSP Report-Only (P2 #3)

| Item                             | Status  | Notes                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP allowlist + Report-Only ship | ✅ Done | [apps/web/next.config.mjs](../../apps/web/next.config.mjs) `async headers()`. Directives: `default-src 'self'`; `script-src` adds Turnstile; `connect-src` adds Supabase (https/wss) + Turnstile siteverify origin; `img-src` adds Supabase storage + OSM tiles; `frame-src` Turnstile only; `frame-ancestors 'none'`. |
| Inline-script accommodation      | ✅ Done | `'unsafe-inline'` retained on `script-src` to support JSON-LD `<script type="application/ld+json">` in [layout.tsx](../../apps/web/src/app/layout.tsx) + [event-jsonld.tsx](../../apps/web/src/app/events/[id]/_components/event-jsonld.tsx). Nonce-based hardening tracked as P2 #3a follow-up.                       |
| Inline-style accommodation       | ✅ Done | `'unsafe-inline'` retained on `style-src` (Tailwind + inline `style` attrs). Standard for Tailwind apps without a CSS-hash pipeline.                                                                                                                                                                                   |
| Sentry coverage                  | ✅ Done | Existing `tunnelRoute: '/monitoring'` keeps Sentry traffic same-origin, so no `*.ingest.sentry.io` allowlist entry needed.                                                                                                                                                                                             |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅. CSP
is Report-Only — violations log to the devtools console / Reporting API but do not
block requests.

### 2026-05-24 — Bundle 14: admin-client refactor (P2 #4)

| Item                                             | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New RLS migration                                | ✅ Done | [20260609000000_self_writes_attendees_tips.sql](../../supabase/migrations/20260609000000_self_writes_attendees_tips.sql). Adds `event_attendees_update_own_pending`, `event_attendees_update_host`, `event_tips_{select,insert,update,delete}_own[_pending]`, `event_payment_audit_insert_host`. `is_event_host()` (added in 20260514000400) reused for host policies. |
| `checkout-actions.ts` swap admin → server        | ✅ Done | INSERT, the SELECT-existing lookup, the rollback DELETE, and the `checkout_session_id` stash UPDATE all run as the caller. Self-promote to 'paid' blocked by RLS (row must stay 'pending').                                                                                                                                                                            |
| `tip-actions.ts` swap admin → server             | ✅ Done | `loadEvent` now takes the server client; pending insert / session-id stash / rollback delete all RLS-enforced.                                                                                                                                                                                                                                                         |
| `manage-payments-actions.ts` swap admin → server | ✅ Done | Host UPDATE on `event_attendees` + audit INSERT both RLS-enforced via `is_event_host()`. Existing `canManage` app-layer check kept as belt-and-suspenders.                                                                                                                                                                                                             |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-22 — Bundle 2: postcss override

| Item                             | Status  | Notes                                                                                                                                                                                                |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 transitive `postcss` advisory | ✅ Done | Added `pnpm.overrides.postcss: ">=8.5.10"` to root `package.json`. `pnpm install`; `pnpm audit --prod` now reports 0 vulnerabilities. See [Bundle 2 journal](../journal/2026-05-digest.md#bundle-2). |

### 2026-05-22 — Quick-win bundle landed

| Item                               | Status  | Notes                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 #0 `next` advisories (15 vulns) | ✅ Done | Root cause was `packages/supabase/package.json` `"next": ">=14.0.0"` peer floor, which pnpm satisfied with a phantom `next@14.2.35`. Bumped peer to `>=15.5.16`; `pnpm install`; `pnpm audit --prod` now reports 1 moderate (transitive `postcss` via `@sentry/nextjs`) instead of 15 (5 high). |

### 2026-05-17 — Quick-win bundle landed

| Item                                   | Status     | Notes                                                                                                                                      |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 #1 open redirect in `auth/callback` | ✅ Done    | `next` validated; falls back to `/events`.                                                                                                 |
| P2 #3 missing security headers         | 🟡 Partial | Baseline 5 headers added via `next.config.mjs`. CSP still open.                                                                            |
| P2 #5 PII in logs                      | 🟡 Partial | Removed `{ email }` from `claim/actions.ts`. `checkout-actions.ts:210` already logs only `emailErr.message`; flagged for follow-up review. |
| P2 #7 Stripe metadata cross-check      | ✅ Done    | Mismatch detection added to both checkout and subscription handlers.                                                                       |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm build` ✅.

**Still open** (not in quick-win scope):

- ~~**P2 #3a**~~ — resolved 2026-05-22 (Bundle 27). CSP now enforced.
  Optional follow-up (**P2 #3b**): wire a nonce through middleware to
  drop `'unsafe-inline'` from `script-src` / `style-src`.
- ~~**P2 #4**~~ — resolved 2026-05-24 (Bundle 14).
- ~~**P2 #6**~~ — resolved 2026-05-24 (Bundle 16).
- ~~**P3 #9** (FormData global cap)~~ — resolved 2026-05-24 (Bundle 17).
- ~~**P3 #10** (Turnstile freshness)~~ — resolved 2026-05-24 (Bundle 17).
- **P3 #8** (audit-log coverage) and **P3 #11** (preemptive upload
  hardening) remain open.

---

## Open questions

1. Does anyone currently embed PickupVB in an iframe (white-label)? If so
   `X-Frame-Options: DENY` would break them and we'd want CSP
   `frame-ancestors` allowlist instead.
2. Existing KV store available, or do we provision Vercel KV / Upstash for
   rate-limit state?
3. Any secrets we should rotate proactively because of past local exposure
   (shared drives, old machines, etc.)?
   </content>
   </invoke>
