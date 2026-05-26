-- ============================================================================
-- Soft-delete for `event_team_registrations` (post-checkout only).
-- Closes data-lifecycle.md audit item P2 #5.
--
-- Context: today the only delete path is `hostForceWithdrawTeamRegistration`
-- (apps/web/src/app/events/[id]/host-team-registration-actions.ts), which
-- already gates on payment_status ∈ {None, Refunded} and then DELETEs the row
-- outright. That's safe for the None branch (the captain never touched
-- Stripe), but for Refunded it erases the audit trail of a real payment —
-- the host issued a Connect refund and the only row that ties that refund
-- back to a roster, captain, and division disappears with it. The same
-- pattern applies to any future host/captain-initiated withdrawal after a
-- successful checkout: we want the row to leave product surfaces immediately
-- but stay queryable for reconciliation, dispute response, and the eventual
-- account-deletion purge.
--
-- Mirrors the `profiles.deleted_at` pattern (20260620000000) and the
-- groups/teams/broadcasts pattern (20260628000000): nullable
-- `deleted_at timestamptz` + partial index + SELECT-policy filter so soft-
-- deleted rows vanish from user-RLS reads without each call site having to
-- remember to filter. Admin-client reads (`createSupabaseAdminClient`,
-- which all `unstable_cache` event-detail loaders use) bypass RLS and must
-- still filter explicitly — those call sites are updated alongside this
-- migration.
--
-- Impact:
--   - Adds nullable `deleted_at timestamptz` + partial index to
--     `event_team_registrations`. Default NULL means existing rows are
--     untouched and continue to behave exactly as before.
--   - Rewrites `event_team_registrations_select` to add
--     `and deleted_at is null` so user-facing reads (captain page, public
--     event detail when fetched via user supabase, division-winner picker)
--     stop showing soft-deleted registrations automatically.
--   - Insert / update / delete policies are unchanged. The host's UPDATE
--     policy already covers flipping `deleted_at` (it doesn't reference
--     the column in WITH CHECK), so the new soft-delete writer doesn't
--     need a new policy.
--   - Webhook lookups (`findByCheckoutSessionId`, `findByPaymentIntentId`)
--     intentionally do NOT filter `deleted_at` — late `charge.refunded`
--     retries from Stripe must still resolve the row to a no-op the
--     idempotent state machine, otherwise the webhook would 500-loop.
--   - Members table (`event_team_registration_members`) is unchanged:
--     it CASCADEs on the parent and stays joined-via-id, so soft-deleting
--     the parent automatically removes the roster from any read that
--     respects the new SELECT policy on registrations.
-- ============================================================================

alter table public.event_team_registrations
  add column deleted_at timestamptz;

create index event_team_registrations_deleted_at_idx
  on public.event_team_registrations (deleted_at)
  where deleted_at is not null;

drop policy if exists event_team_registrations_select on public.event_team_registrations;
create policy event_team_registrations_select
  on public.event_team_registrations for select
  using (deleted_at is null);
