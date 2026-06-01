# 0029. Account deletion — soft-delete tombstone + grace-windowed hard purge

- **Status:** Accepted
- **Date:** 2026-05-31
- **Relates to:** [docs/audits/privacy.md](../audits/privacy.md) (P1 #2, the
  standing erasure gap + the FK groundwork), [docs/audits/data-lifecycle.md](../audits/data-lifecycle.md)
  (per-table delete posture), [ADR 0020 — User profile aggregate](0020-user-profile-aggregate.md).

## Context

PickupVB had no "delete my account" path, while GDPR Art. 17 (erasure) requires
one. The schema groundwork already shipped (Bundle 89, privacy P1 #1/#2/#3):
`profiles.deleted_at` + `deletion_reason` exist, and every FK pointing at
`profiles` / `auth.users` was set so deleting the auth row resolves cleanly —
regulatory rows (`event_tips`, `host_stripe_accounts`, `host_subscriptions`,
`event_participants`, `event_team_payments`, `community_listings`) `SET NULL`;
transient rows (friendships, push subs, chat, notifications) `CASCADE`;
`events.host_id` / `groups.created_by` / `broadcasts.sender_id` `SET NULL` so the
content survives host-less and renders as "Former member". Note
`profiles.id → auth.users(id)` is itself `ON DELETE CASCADE`, so deleting the
auth user removes the profile row too.

What was missing is the **application path**: a way to request deletion, a grace
period to undo it, and the orchestration that performs the purge.

## Decision

**A streamlined, grace-windowed flow** driven by a `deletion_requests` ledger.

1. **No email-confirm gate.** The requester is already authenticated, so an
   email round-trip to "confirm" identity adds friction and a token subsystem for
   marginal value. The safety net is instead a **30-day grace window** + a
   one-click cancel + a "scheduled for deletion" notice email. State machine:
   `scheduled → executed | cancelled`. (Rejected: the audit's original two-stage
   `pending → confirmed → …` email-link design.)

2. **A daily cron does the purge.** `/api/account/execute-deletions` (Vercel
   cron, `CRON_SECRET`-gated, mirrors the reminders cron) picks up `scheduled`
   requests whose `scheduled_for` has elapsed and, per account, in order:
   closure email → cancel active Stripe subscription → scrub the profile in place
   → drop transient notification rows → mark the request `executed` → hard-delete
   the auth user. The destructive work is session-less admin-client orchestration
   in [lib/account-purge.ts](../../apps/web/src/lib/account-purge.ts); the cap +
   per-account failure isolation is a unit-tested sweep core.

3. **Two layers of removal.** The profile is scrubbed in place first
   (anonymize PII, `display_name = 'Former member'`, stamp `deleted_at` so
   `profiles_public` immediately hides it) — defense-in-depth so the PII is gone
   even if the final step fails. Then `auth.admin.deleteUser` removes the
   identity; the FK cascade/SET-NULL does the structural cleanup.

4. **An anonymized proof-of-erasure record survives.** `deletion_requests.user_id`
   is `ON DELETE SET NULL` (not CASCADE): the row is marked `executed` while it
   still exists, then the auth-user delete cascades through `profiles` and
   SET-NULLs `user_id`, leaving an `executed` row with status + timestamps but no
   identifier — proof we erased on date X without retaining PII.

5. **Stripe: cancel the subscription, keep the Connect account.** An active Pro
   subscription is cancelled so the user isn't billed. The Connect account
   (`host_stripe_accounts`) is **never** deleted — it's tied to 1099-K issuance
   and historical payouts; its `user_id` SET-NULLs and the `stripe_account_id`
   survives as a reconciliation key (privacy P1 #3 / payments.md).

6. **Anonymous users are excluded.** They have no email, minimal data, and the
   product path is abandon-or-`/claim`. The UI + actions gate on
   `requireRealUser`.

## Consequences

- **Reversible for 30 days, irreversible after.** The grace window + cancel + the
  type-`DELETE`-to-confirm form are the guardrails; once the cron runs it cannot
  be undone.
- **Retry-safe up to the point of no return.** A failure in any step before the
  auth-user delete leaves the request `scheduled`, so the next daily run retries.
  A failure _at_ the auth-user delete (after the PII scrub + `executed` mark) is
  logged loudly for ops — the privacy-critical erasure already happened; a
  lingering auth row is a cleanup, not a data-leak.
- **Hosted content goes host-less.** Events/groups/broadcasts the user authored
  remain with a null author, rendered "Former member" (the intended P1 #1
  posture), so co-hosts and attendees keep their records.
- **Chat:** a user's messages CASCADE-delete with them; in a DM this removes the
  copy the _other_ party received. Accepted for now; revisit with a tombstone if
  it proves jarring (privacy #15).

## Retention windows (pinned)

- **Tax / payout records** (`event_tips`, `event_payment_audit`,
  `host_stripe_accounts`): retained via SET-NULL pinning — 7 years (US federal).
- **`notification_outbox`:** 30 days (existing purge cron).
- **Deletion grace window:** 30 days.
- **Proof-of-erasure (`deletion_requests` executed rows):** retained,
  anonymized.

## Follow-ups

- Live two-user / Stripe round-trip e2e against dev (not in the default verify
  chain — mirrors the chat RLS-verification gap).
- Chat retention + the DM-tombstone question (privacy #14 / #15).
