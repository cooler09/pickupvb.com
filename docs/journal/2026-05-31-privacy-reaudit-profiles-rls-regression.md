# Privacy re-audit — owner-only `profiles` RLS regression in chat + media (2026-05-31)

## Context

User asked for a privacy compliance re-audit ("fix any bug and update any
suggestions"). The standing audit is [docs/audits/privacy.md](../audits/privacy.md)
(2026-05-24), whose P1 #4 step 3 tightened the base `profiles` SELECT policy to
owner-only (`auth.uid() = id OR is_platform_admin()`) and moved all public reads
to the `profiles_public` view.

Re-running the review, the 2026-05-24 hardening is all still in place. The find
was a **regression caused by it**: three features that shipped _afterward_ —
chat/messaging (ADR 0028, the four Phase journal entries also dated 2026-05-31)
and media posts — read _other users'_ display cards (`display_name` /
`avatar_url`) straight from the base `profiles` table over a user-scoped client
or a SECURITY INVOKER function. Under owner-only RLS those reads resolve to the
caller's own row only, so everyone else's name/avatar came back null.

Why it slipped through: the broken path only manifests with **2+ real users**.
Single-user local dev and the existing single-session tests never exercised it,
and the chat initiative's own notes already flagged "live Realtime + RLS path
needs dev verification." Live Realtime chat rows even _masked_ it in the team
room — `ConversationView` resolves those from the `participants` roster, so only
the server-loaded history looked wrong.

## Decisions

- **Route display-card reads through `profiles_public`, not the base table.**
  Chose the existing bundle-89 pattern (read the public view, which is
  definer-equivalent and `anon`/`authenticated`-readable) over loosening the
  base-`profiles` policy. Loosening would undo P1 #4 and re-expose `first_name` /
  `last_name` / `business_*` / `tax_id`. The view exposes exactly the safe
  columns and already filters `deleted_at IS NULL`.
- **Chat `listMessages`: split query + JS merge, not an embedded join.** Chose a
  separate `profiles_public` fetch keyed by distinct sender ids over a PostgREST
  embed because embeds don't work against a view (no FK metadata) — the same
  gotcha AGENTS.md documents for the groups/teams pages.
- **`get_inbox`: change the join, keep SECURITY INVOKER.** Chose `create or
replace` swapping `join public.profiles` → `join public.profiles_public` over
  promoting the function to SECURITY DEFINER. The view bypasses base-table RLS on
  its own regardless of the caller's security mode, so DEFINER would add an
  escalation surface for no benefit. Signature is unchanged ⇒ no `gen:types`.
- **Graded the regression P1 but framed as correctness, not a leak.** RLS failed
  safe (returned nothing), so privacy posture was never at risk — but the live
  features were visibly broken in prod for the multi-user path, which is
  ship-blocking on the feature axis.
- **Exported + unit-tested `rowToView` rather than mocking the Supabase client.**
  The infra test suite is pure-function/mapper style (no client mocks); a
  builder-mock test would be a new, brittle pattern. The mapper test pins the
  contract that the sender card arrives as a separate argument (i.e. from a
  separate lookup), which is the decision the fix hinges on. The data-source
  itself (view vs base table) is an RLS-integration concern — e2e territory,
  already flagged pending dev verification in the chat initiative.

## Changes

- `packages/infrastructure/src/supabase-messaging-repository.ts` — `listMessages`
  drops the `sender:profiles!…` embed; new private `loadSenderCards` reads
  `profiles_public`; `rowToView` takes the resolved card as an arg and is now
  exported.
- `packages/infrastructure/src/supabase-messaging-repository.test.ts` — new; 4
  mapper cases (card resolution, null-card fallback, tombstone, edited flag).
- `packages/infrastructure/src/supabase-media-post-repository.ts` — `decorate`
  submitter-card read `from('profiles')` → `from('profiles_public')`.
- `supabase/migrations/20260827000000_fix_get_inbox_dm_title_profiles_public.sql`
  — new; `create or replace get_inbox` with the DM-title join on
  `profiles_public`.
- `docs/audits/privacy.md` — re-audit status block; new finding #13 (fixed) +
  #14 / #15 (open); P3 #11 marked resolved-by-side-effect; remediation log entry.
- `docs/audits/README.md` — privacy index row updated to 2026-05-31.

## Patterns observed

- **Owner-only `profiles` RLS is a standing trap for every new feature that
  shows someone else's name.** This is the third batch of reads to hit it after
  the bundle-89 sweep. Promoted the guardrail into AGENTS.md (new pitfall):
  display cards for other users must come from `profiles_public`, never the base
  table, on any session-scoped or SECURITY INVOKER path.
- **Single-user testing hides multi-user RLS bugs.** A working-looking local run
  is not evidence the RLS path works; these need 2+ users (e2e against dev).

## Follow-ups

- **Chat retention** (privacy P2 #14): no TTL on `messages`, no
  `chat-attachments` orphan sweep, soft-deleted bodies retained in place. Track
  with [data-lifecycle.md](../audits/data-lifecycle.md).
- **Account-deletion + data-export must cover chat** (privacy P2 #15) when those
  features are built; flag the DM "deleting one party removes the other party's
  copy" side-effect in the deletion ADR.
- **`get_inbox` migration pending local `pnpm db:migrate`** (Docker) — function
  body only, CI/CD auto-applies on deploy.
- Standing-open: account-deletion app path, data-export endpoint (P3 #12),
  `rate_limits.key` plaintext (P3 #10).
