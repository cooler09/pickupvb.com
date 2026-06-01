# Account deletion — the erasure path (2026-05-31)

## Context

The privacy audit's biggest standing item (P1 #2): no "delete my account" flow,
while GDPR Art. 17 requires one. The schema groundwork shipped in Bundle 89
(`profiles.deleted_at` + the FK SET-NULL/CASCADE flips); this bundle builds the
application path on top. Follows the same-day data-export endpoint (which did the
data-inventory groundwork). User picked it as the next item; planned + approved
via plan mode ([ADR 0029](../adr/0029-account-deletion.md)).

## Decisions

- **Streamlined over email-confirm (locked with user).** `scheduled → executed |
cancelled`, no `pending → confirmed` email-link gate. The requester is already
  authenticated, so the gate adds a token subsystem for marginal value; the
  30-day grace + one-click cancel + a "scheduled for deletion" notice email are
  the safety net.
- **`deletion_requests.user_id` is `ON DELETE SET NULL`, not CASCADE.** This was
  the subtle one. `profiles.id → auth.users` is CASCADE, so `auth.admin.deleteUser`
  deletes the profile row (the "tombstone" is transient). To keep an anonymized
  proof-of-erasure record, the request row must survive that cascade — so the
  cron marks it `executed` _before_ the auth delete, and the cascade then
  SET-NULLs `user_id`, leaving `{executed, user_id: null, timestamps}`.
- **Purge order = defense-in-depth + retry-safe.** closure email → Stripe cancel
  → profile scrub → notif cleanup → mark executed → `auth.admin.deleteUser`. PII
  is scrubbed before the point of no return, so a failure at the auth-delete step
  still leaves the data erased (logged for ops). A failure _before_ `executed`
  leaves the request `scheduled` → the next daily cron retries. Steps are
  idempotent.
- **Proper aggregate, not a facade.** Unlike the payment "aggregates" (pattern
  #10), `DeletionRequest` has a real state machine with guards, so it earns a
  domain aggregate + command handlers (aligns with the architecture-refactor
  initiative). The cron's execute transition is the exception: it's session-less
  orchestration in `lib/account-purge.ts` (webhook-mirror precedent), calling the
  aggregate's `markExecuted()` + repo `save` inline.
- **Anon users excluded, not special-cased.** `requireRealUser` gates the UI +
  actions — anon users have no email/minimal data and the path is `/claim` or
  abandon. Simpler than a no-grace-period anon branch.
- **Stripe: cancel the subscription, keep the Connect account** (1099-K). The
  Connect `user_id` SET-NULLs; the `stripe_account_id` survives.
- **Testable cron sweep, integration purge.** The sweep core (cap + per-account
  failure isolation) is unit-tested with a fake port; the destructive
  `executeAccountDeletion` is integration logic (not mock-tested), mirroring the
  reminders cron's split.

## Changes

- Migration `20260828000000_account_deletion_requests.sql` — ledger + partial
  unique index + RLS (`user_id` SET NULL).
- Domain `users/deletion-request.ts` (aggregate + port) + test.
- Application `commands/account-deletion.handler.ts` (Request/Cancel) + 2 commands
  in `messages.ts` + test.
- Infra `supabase-deletion-request-repository.ts`.
- Web: `lib/account-purge.ts`; `api/account/execute-deletions/{route,sweep}.ts` +
  sweep test; `getAccountDeletionHandlers()` in `lib/handlers.ts`;
  `profile/account/delete/{page,actions}.ts`; "Delete account" link on the profile
  page; cron in `vercel.json`.
- Notifications: `account.deletion.requested` + `.cancelled` kinds + templates.
- Docs: ADR 0029; privacy.md (P1 #2 + #15 resolved, status + remediation log);
  README index row.

## Patterns observed

- **`profiles.id → auth.users` CASCADE drives the whole purge design.** Any
  per-user audit/ledger row that should outlive deletion needs `ON DELETE SET
NULL` on its `user_id` (not CASCADE), and the status transition must be
  persisted _before_ the auth-row delete. Worth remembering for the next
  retention/audit table.
- **Local migration iteration:** editing an unshipped migration after a local
  apply needs `supabase db reset` (not `migration up`) to re-run it, then
  `gen:types`. Fine for a not-yet-deployed migration; never for an applied/shipped
  one.

## Follow-ups

- **Live e2e against dev** — two-user + Stripe round-trip + the actual
  `auth.admin.deleteUser` cascade. Not in the default verify chain; mirrors the
  chat RLS-verification gap. The cron + purge are unit/integration-sound but the
  irreversible cascade hasn't been exercised against a real DB.
- **Chat DM tombstone** (#15) — deleting one DM party removes the other's copy;
  revisit if jarring.
- Remaining privacy backlog: `rate_limits.key` hashing (P3 #10), chat retention
  (#14).
