-- Optional business fields on profiles. Used by:
--   * Buyers — show as "Billed to" on printable receipts (for expense
--     reports + accounting). `tax_id` is intended for EIN; do NOT store
--     SSN here — there's no special encryption.
--   * Hosts — when set, used as "Sold by" instead of display_name on
--     printable receipts. Stripe is still the entity that issues the
--     1099-K (it has its own legal name from the Connect onboarding).
--
-- All three fields are nullable and unauthenticated by RLS beyond the
-- existing profile policies (a user can only modify their own row).

alter table public.profiles
  add column business_name    text,
  add column business_address text,
  add column tax_id           text;
