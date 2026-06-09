'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured, PLATFORM_FEE_BPS } from '@/lib/stripe';
import { PRO_PLATFORM_FEE_BPS } from '@/lib/pro';
import { getServerSupabase } from '@/lib/supabase';
import { requireRealUser } from '@/lib/server-auth';
import { hasProBenefits } from '@/lib/admin';
import { getMembershipPlan, getActiveMembershipForHost } from '@/lib/memberships';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { buildOrigin, redirectEventNotice } from '@/lib/server-redirects';
import { renderNowMs } from '@/lib/render-now';
import { analytics } from '@/lib/handlers';
import { log } from '@/lib/log';

/**
 * Buyer-facing recurring-membership actions (ADR 0037 Phase 2): subscribe to a
 * host's plan (Connect destination subscription — the host is paid monthly, less
 * the tiered platform fee), claim a free spot on an eligible open-play event
 * while active, and cancel at period end. The host_memberships row is created /
 * kept in sync by the `customer.subscription.*` webhook off the subscription's
 * `metadata.kind = 'host_membership'`.
 */

function back(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'rsvp', code, msg);
}

/** Application-fee percent for a destination subscription, at the host's tier. */
async function membershipFeePercent(hostId: string): Promise<number> {
  const bps = (await hasProBenefits(hostId)) ? PRO_PLATFORM_FEE_BPS : PLATFORM_FEE_BPS;
  return bps / 100; // 250 bps → 2.5(%)
}

export async function startMembershipCheckout(
  planId: string,
  eventId: string,
  _formData: FormData,
): Promise<void> {
  if (!isStripeConfigured()) back(eventId, 'payments_off');
  const { user } = await requireRealUser(`/events/${eventId}`);

  const plan = await getMembershipPlan(planId);
  if (!plan || plan.status !== 'active') {
    back(eventId, 'error', 'That membership is no longer available.');
  }
  if (plan.priceCents <= 0) back(eventId, 'error', 'That membership is misconfigured.');

  // Already a member? Nothing to buy — bounce back so they can just claim a spot.
  const existing = await getActiveMembershipForHost(user.id, plan.hostId, renderNowMs());
  if (existing) {
    revalidatePath(`/events/${eventId}`);
    back(eventId, 'already');
  }

  const hostAccountId = await getHostStripeAccount(plan.hostId);
  if (!hostAccountId) back(eventId, 'host_not_ready');

  const feePercent = await membershipFeePercent(plan.hostId);
  const origin = await buildOrigin();
  const metadata = {
    kind: 'host_membership',
    plan_id: plan.id,
    host_id: plan.hostId,
    member_user_id: user.id,
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: 'subscription',
        ...(user.email ? { customer_email: user.email } : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: plan.priceCents,
              recurring: { interval: 'month' },
              product_data: { name: plan.title },
            },
          },
        ],
        subscription_data: {
          transfer_data: { destination: hostAccountId! },
          application_fee_percent: feePercent,
          metadata,
        },
        metadata,
        success_url: `${origin}/events/${eventId}`,
        cancel_url: `${origin}/events/${eventId}`,
      },
      // Dedupe the SDK's own retries / a double-click to one session.
      { idempotencyKey: `membership:${plan.id}:${user.id}` },
    );
  } catch (err) {
    await log.error('[membership] checkout create failed', err, { planId, hostId: plan.hostId });
    back(eventId, 'error', err instanceof Error ? err.message : 'Could not start checkout.');
  }

  if (!session.url) back(eventId, 'error', 'Stripe did not return a checkout URL.');

  analytics.capture(
    {
      name: 'checkout_started',
      props: {
        eventId,
        hostId: plan.hostId,
        amountCents: plan.priceCents,
        kind: 'pass_purchase',
      },
    },
    user.id,
  );

  redirect(session.url as Route);
}

/**
 * Claim a free spot on an eligible open-play event using an active membership.
 * All eligibility / capacity checks happen atomically in `claim_membership_spot`.
 */
export async function claimMembershipSpot(eventId: string, _formData: FormData): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}`);
  const sb = await getServerSupabase();

  const { error } = await sb.rpc('claim_membership_spot', { p_event_id: eventId });

  if (error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('full')) back(eventId, 'full');
    if (m.includes('already_joined')) back(eventId, 'already');
    if (m.includes('not_a_member')) back(eventId, 'error', 'Your membership isn’t active.');
    if (m.includes('event_not_pass_eligible') || m.includes('event_not_open_play')) {
      back(eventId, 'error', 'This event does not accept memberships.');
    }
    await log.error('[membership] claim failed', error, { eventId, userId: user.id });
    back(eventId, 'error', 'Could not claim your spot.');
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, 'joined');
}

/**
 * Cancel a membership at period end. The subscription lives on the platform
 * account (destination model), so we cancel it directly — no billing portal.
 * The `customer.subscription.updated` webhook mirrors `cancel_at_period_end`.
 * Bound from `/profile/passes`.
 */
export async function cancelMembership(
  membershipId: string,
  returnPath: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser('/profile/passes');
  const sb = await getServerSupabase();
  // RLS lets the member read their own membership row.
  const { data } = await sb
    .from('host_memberships')
    .select('stripe_subscription_id, member_user_id')
    .eq('id', membershipId)
    .maybeSingle();
  const row = data as { stripe_subscription_id: string | null; member_user_id: string } | null;
  if (!row || row.member_user_id !== user.id || !row.stripe_subscription_id) {
    redirect(`${returnPath}?membership=error` as Route);
  }

  try {
    await getStripe().subscriptions.update(row!.stripe_subscription_id!, {
      cancel_at_period_end: true,
    });
  } catch (err) {
    await log.error('[membership] cancel failed', err, { membershipId, userId: user.id });
    redirect(`${returnPath}?membership=error` as Route);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?membership=canceled` as Route);
}
