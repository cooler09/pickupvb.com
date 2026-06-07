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
import { recordAuditEvent } from '@/lib/audit-log';
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

  // Resolve the host once — both the audit trail and analytics key on it.
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('host_stripe_accounts')
    .select('user_id')
    .eq('stripe_account_id', account.id)
    .maybeSingle();
  const hostId = (data as { user_id: string } | null)?.user_id ?? null;

  if (hostId) {
    // Audit trail of Connect account state mirrors (security audit P3 #8).
    // System-driven (webhook), so there's no actor; the host is the target.
    await recordAuditEvent({
      action: 'host_stripe.account_updated',
      entityType: 'host_stripe_account',
      entityId: account.id,
      targetUserId: hostId,
      metadata: {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      },
    });

    // Fire host_payout_setup_completed whenever the account is currently
    // charges-enabled. Stripe re-sends account.updated on every change
    // (re-verification, capability shifts), so PostHog will see repeats —
    // dashboards filter to first occurrence per actor. Acceptable for now;
    // tightening to first-transition would require comparing prior mirror
    // state (deferred).
    if (account.charges_enabled) {
      analytics.capture({ name: 'host_payout_setup_completed', props: { hostId } }, hostId);
    }
  }

  // Nudge the host if Stripe needs more info to keep payouts flowing.
  await maybeNotifyStripeActionRequired(account);
}

/**
 * Ping the host when their Connect account has an outstanding Stripe
 * requirement (lights up the previously-dead `host.stripe.action_required`
 * kind). Stripe re-sends `account.updated` on every change, so this dedups two
 * ways:
 *   - email/push carry a requirement-*signature* idempotency key, so the host
 *     gets one mail per distinct set of outstanding requirements, not one per
 *     webhook; and
 *   - in_app (which carries no idempotency key) is coalesced — skip when an
 *     unread action-required bell is already waiting, so the host sees one
 *     "fix Stripe" bell at a time.
 *
 * Best-effort: a notify failure must never reject the webhook (Stripe would
 * retry the whole event).
 */
export async function maybeNotifyStripeActionRequired(account: Stripe.Account): Promise<void> {
  const req = account.requirements;
  const pastDue = req?.past_due ?? [];
  const currentlyDue = req?.currently_due ?? [];
  const disabledReason = req?.disabled_reason ?? null;
  if (pastDue.length === 0 && currentlyDue.length === 0 && !disabledReason) return;

  const admin = getAdminSupabase();
  const { data: row } = await admin
    .from('host_stripe_accounts')
    .select('user_id')
    .eq('stripe_account_id', account.id)
    .maybeSingle();
  const hostId = (row as { user_id: string } | null)?.user_id ?? null;
  if (!hostId) return;

  // Coalesce in_app: one outstanding action-required bell at a time.
  const { data: pending } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', hostId)
    .eq('kind', 'host.stripe.action_required')
    .is('read_at', null)
    .limit(1);
  if (pending && pending.length > 0) return;

  const message =
    pastDue.length > 0 || disabledReason
      ? 'Your payouts are paused until you finish verifying your account with Stripe.'
      : 'Stripe needs more information to keep your payouts active.';
  // Stable per distinct outstanding-requirement set so resends with the same
  // state dedup, but a newly-added requirement re-notifies.
  const signature = `${disabledReason ?? ''}|${[...pastDue, ...currentlyDue].sort().join(',')}`;

  try {
    await notify(
      'host.stripe.action_required',
      hostId,
      { message },
      { idempotencyKey: `stripe-req:${account.id}:${signature}` },
    );
  } catch {
    // best-effort
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
