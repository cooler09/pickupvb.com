/**
 * Stripe Connect account webhook handlers (architecture audit P3-2 — extracted
 * verbatim from the webhook route). `account.updated` mirrors onboarding state
 * into `host_stripe_accounts`; `payout.paid` notifies the host their payout
 * settled.
 */
import type Stripe from 'stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { mirrorStripeAccountUpdate } from '@/lib/host-stripe-account';
import { analytics } from '@/lib/handlers';
import { notify } from '@/lib/notify';

/**
 * Mirror Stripe Connect account state into our `host_stripe_accounts` table.
 * Fired by Stripe whenever the account changes (KYC submission, capability
 * grants, requirements added/removed). The fields we care about let us
 * gate the "publish a paid event" UI.
 */
export async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  await mirrorStripeAccountUpdate(account.id, {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  });
  // Repo returns false (no row) silently — host hasn't onboarded through
  // our flow yet, so there's nothing to mirror.

  // Fire host_payout_setup_completed whenever the account is currently
  // charges-enabled. Stripe re-sends account.updated on every change
  // (re-verification, capability shifts), so PostHog will see repeats —
  // dashboards filter to first occurrence per actor. Acceptable for now;
  // tightening to first-transition would require comparing prior mirror
  // state (deferred).
  if (account.charges_enabled) {
    const admin = getAdminSupabase();
    const { data } = await admin
      .from('host_stripe_accounts')
      .select('user_id')
      .eq('stripe_account_id', account.id)
      .maybeSingle();
    const hostId = (data as { user_id: string } | null)?.user_id ?? null;
    if (hostId) {
      analytics.capture({ name: 'host_payout_setup_completed', props: { hostId } }, hostId);
    }
  }
}

/**
 * Connect payout settled to the host's bank. Notify them with the amount
 * and expected arrival date so they don't have to babysit their dashboard.
 *
 * `event.account` is the connected account id (acct_...) — Stripe sends
 * Connect events with this top-level field populated.
 */
export async function handlePayoutPaid(
  payout: Stripe.Payout,
  accountId: string | null,
): Promise<void> {
  if (!accountId) return;
  const admin = getAdminSupabase();
  const { data: row } = await admin
    .from('host_stripe_accounts')
    .select('user_id')
    .eq('stripe_account_id', accountId)
    .maybeSingle();
  const userId = (row as { user_id: string } | null)?.user_id;
  if (!userId) return;
  const arrivalDate = payout.arrival_date
    ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
    : 'soon';
  try {
    await notify(
      'host.payout.paid',
      userId,
      { amountCents: payout.amount, arrivalDate },
      { idempotencyKey: `payout:${payout.id}` },
    );
  } catch {
    // best-effort
  }
}
