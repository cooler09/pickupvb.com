# Security Audit

**Date:** 2026-05-17
**Scope:** entire `pickupvb.com` workspace (`apps/web`, `packages/*`,
`supabase/migrations`). `copilot-skills` workspace was not audited.
**Method:** read-only static review. Server actions, API routes, auth flows,
RLS policies, third-party integrations, secrets handling, logging.

**Status update (2026-05-17):** Quick-win bundle shipped — see
[Remediation log](#remediation-log) at the bottom.

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

**Status:** 🟡 _Partially resolved 2026-05-17_ — baseline headers (HSTS,
`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
`Permissions-Policy`) added via `async headers()` in
[apps/web/next.config.mjs](../../apps/web/next.config.mjs). CSP still open
— needs an allowlist for Stripe.js, Supabase, Sentry, OSM tiles, fonts, and
images, rolled out behind `Content-Security-Policy-Report-Only` first.

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

### 4. Admin Supabase client used for user-driven writes

**Status:** ✅ _Resolved 2026-05-24 (Bundle 14)_ — all three call sites
now use `getServerSupabase()` (RLS-enforced). New migration
[20260609000000_self_writes_attendees_tips.sql](../../supabase/migrations/20260609000000_self_writes_attendees_tips.sql)
adds self-service policies for `event_attendees` /
`event_tips` (own pending row only — caller can't self-promote to
`paid`) plus host-update policies for the manage-payments flow and a
host-insert policy for `event_payment_audit`. Stripe webhook handlers
continue to use the admin client (correct — they run with no user
session). See the [Bundle 14 journal](../journal/2026-05-24-bundle-14.md).

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

**Files:**

- [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts)
- [apps/web/src/app/claim/actions.ts](../../apps/web/src/app/claim/actions.ts)
- [apps/web/src/app/events/[id]/checkout-actions.ts](../../apps/web/src/app/events/[id]/checkout-actions.ts)
- [apps/web/src/app/events/[id]/guest-actions.ts](../../apps/web/src/app/events/[id]/guest-actions.ts)

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

`event_payment_audit` table exists ([20260516000000_ticketed_events.sql](../../supabase/migrations/20260516000000_ticketed_events.sql#L76))
but the pattern isn't extended to:

- Group member role changes
- Co-host add/remove
- Stripe account mutations
- Subscription state changes

**Fix:** add an `audit_log` table or extend the existing one.

### 9. FormData hard max-size

**File:** [apps/web/src/lib/form-data.ts](../../apps/web/src/lib/form-data.ts)

`field()` / `fieldOrNull()` take a per-field `max` arg. There's no global
upper bound — a manually crafted POST with a 1 MB `first_name` is only
limited by Next.js body-parsing defaults.

**Fix:** enforce a global hard cap (e.g. 4 KB) at the helper.

### 10. Turnstile token freshness

**File:** [apps/web/src/lib/turnstile.ts](../../apps/web/src/lib/turnstile.ts#L20-L46)

Cloudflare's `verify` endpoint returns `challenge_ts`. We don't assert it's
recent. A bot could pre-generate a token and replay it later.

**Fix:** reject tokens older than ~2 min.

### 11. File-upload hardening (preemptive)

No file uploads in the app today. If/when added (avatars, broadcast
images), validate `Content-Type` and `Content-Length` at the API boundary,
not just trust the client.

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

### 2026-05-24 — Bundle 14: admin-client refactor (P2 #4)

| Item                                             | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New RLS migration                                | ✅ Done | [20260609000000_self_writes_attendees_tips.sql](../../supabase/migrations/20260609000000_self_writes_attendees_tips.sql). Adds `event_attendees_update_own_pending`, `event_attendees_update_host`, `event_tips_{select,insert,update,delete}_own[_pending]`, `event_payment_audit_insert_host`. `is_event_host()` (added in 20260514000400) reused for host policies. |
| `checkout-actions.ts` swap admin → server        | ✅ Done | INSERT, the SELECT-existing lookup, the rollback DELETE, and the `checkout_session_id` stash UPDATE all run as the caller. Self-promote to 'paid' blocked by RLS (row must stay 'pending').                                                                                                                                                                            |
| `tip-actions.ts` swap admin → server             | ✅ Done | `loadEvent` now takes the server client; pending insert / session-id stash / rollback delete all RLS-enforced.                                                                                                                                                                                                                                                         |
| `manage-payments-actions.ts` swap admin → server | ✅ Done | Host UPDATE on `event_attendees` + audit INSERT both RLS-enforced via `is_event_host()`. Existing `canManage` app-layer check kept as belt-and-suspenders.                                                                                                                                                                                                             |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-22 — Bundle 2: postcss override

| Item                             | Status  | Notes                                                                                                                                                                                            |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2 transitive `postcss` advisory | ✅ Done | Added `pnpm.overrides.postcss: ">=8.5.10"` to root `package.json`. `pnpm install`; `pnpm audit --prod` now reports 0 vulnerabilities. See [Bundle 2 journal](../journal/2026-05-22-bundle-2.md). |

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

- **P2 #3** — CSP rollout (report-only first), once an allowlist is
  inventoried.
- ~~**P2 #4**~~ — resolved 2026-05-24 (Bundle 14).
- **P2 #6** — rate limiting on email-sending paths (needs a KV backend
  decision first).
- All **P3** items (audit-log coverage, FormData global cap, Turnstile
  freshness, upload hardening).

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
