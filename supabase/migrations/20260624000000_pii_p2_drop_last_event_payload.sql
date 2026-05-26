-- ============================================================================
-- P2 #9 remediation: drop host_stripe_accounts.last_event_payload
--
-- Context: last_event_payload stored the full raw Stripe `account.updated`
-- webhook JSON for incident debugging. That payload contains PII (legal
-- name, DOB, address, SSN/EIN last4, bank account last4) per the Stripe
-- Account object schema. The column is write-only in app code — no query
-- reads it back. Retaining it indefinitely is unnecessary PII accumulation.
-- See docs/audits/privacy.md P2 #9.
--
-- Impact: the column is removed. updateStatusByAccountId and
-- mirrorStripeAccountUpdate drop the lastEventPayload parameter in the
-- same PR. No existing read query references the column. The generated
-- types in packages/supabase/src/database.types.ts lose the field after
-- the next `pnpm --filter @pickupvb/supabase gen:types` run.
-- ============================================================================

alter table public.host_stripe_accounts
  drop column if exists last_event_payload;
