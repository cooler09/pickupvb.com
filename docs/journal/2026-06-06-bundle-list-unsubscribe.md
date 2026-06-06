# One-click List-Unsubscribe (RFC 8058) (2026-06-06)

## Context

Phase 2c of the "wrap up outstanding items" plan. The user chose the
List-Unsubscribe half of the email-deliverability work now and deferred the
bounce webhook (it needs Resend dashboard config to function). Closes
notifications-messaging audit P2 #4; P2 #3 (bounce/suppression) stays open.

## Decisions

- **HMAC token keyed on the existing `CRON_SECRET`** — no new ops env var. The
  token is `<userId>.<HMAC-SHA256(userId)>`; opaque, unforgeable without the
  secret, no expiry (an unsubscribe link must outlive the email). When
  `CRON_SECRET` is unset (dev) signing returns `null`, so the worker simply omits
  the header — the feature degrades off rather than minting an unverifiable link.
- **Thread `userId` through the outbox, don't token the email address.** The
  drained `OutboxRecord` carried `kind`/`toAddress` but not `userId`, and
  `toAddress` for email is the address, not the user. Rather than reverse-map
  address → user in the unsubscribe route (PII lookup, ambiguous on email
  change), `OutboxRecord` gained `userId` and `claimBatch` selects `user_id`.
  The token then identifies the user directly.
- **Header only on non-transactional mail.** The worker checks
  `TRANSACTIONAL_CATEGORIES.has(KIND_CATEGORY[kind])` — receipts / cancellations
  / account events get no unsubscribe header (CAN-SPAM: you can't unsubscribe
  from a transactional message, and `channelAllowedByPrefs` keeps sending them
  regardless). An unknown kind has no category ⇒ treated as non-transactional
  (gets a link — the safe default).
- **Unsubscribe = flip `email_enabled` off, globally.** Standard one-click
  behaviour; the granular per-category controls already live at
  `/profile/notifications`. A partial `upsert({user_id, email_enabled:false})` is
  safe because every other prefs column has a NOT NULL default (20260524000000) —
  a brand-new row lands email-off with the rest at default, an existing row only
  flips email.
- **Route handles GET _and_ POST, both token-gated, on the admin client.** POST
  is the RFC 8058 one-click target mail clients hit; GET is the human clicking
  the link (unsubscribes too — the token is the auth — and renders a small
  confirmation page). No session exists on the unsubscribe device, so the write
  runs on the admin client gated by the token (webhook-shaped, pitfall #8). GET
  mutating is a deliberate, idempotent exception for unsubscribe-link UX.

## Changes

- `packages/domain/src/notifications/outbox-port.ts` — `OutboxRecord.userId`.
- `packages/infrastructure/src/supabase-notification-outbox-repository.ts` —
  `claimBatch` selects + maps `user_id`.
- `apps/web/src/lib/unsubscribe-token.ts` (new) — HMAC sign/verify.
- `apps/web/src/lib/email-resend.ts` — optional `listUnsubscribeUrl` → headers.
- `apps/web/src/app/api/notifications/worker/route.ts` — mints the URL for
  non-transactional email rows.
- `apps/web/src/app/api/unsubscribe/route.ts` (new) — GET/POST unsubscribe.
- Tests: `unsubscribe-token.test.ts` (5), `email-resend.test.ts` (+2).
- `docs/audits/notifications-messaging.md` — P2 #4 resolved.

## Patterns observed

- **Reuse an existing server secret for stateless tokens before adding an env
  var.** `CRON_SECRET` is already server-only and present in every deployed env;
  keying the HMAC on it avoided a new ops dependency and a graceful-degrade path
  fell out for free (no secret ⇒ no header).

## Follow-ups

- **P2 #3 — bounce/complaint webhook + suppression (deferred).** Needs a
  suppression-table migration, a Resend webhook route with signature
  verification, a worker-side suppression check, _and_ registering the webhook +
  secret in the Resend dashboard (ops). Best as a paired code+ops pass.
- **Verify on a deployed env:** confirm Gmail/Apple Mail render the native
  Unsubscribe chip and the POST flips `email_enabled` (needs `CRON_SECRET` set,
  which prod has).
