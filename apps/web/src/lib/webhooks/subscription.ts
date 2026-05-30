/**
 * `customer.subscription.*` webhook handler (architecture audit P3-2 —
 * extracted verbatim from the webhook route). One handler covers
 * create/update/delete: trial start, payment success, cancellation, past_due,
 * and end-of-period cancel — keeping `host_subscriptions` in sync with Stripe.
 */
import type Stripe from 'stripe';
import { findHostByStripeCustomerId, upsertHostSubscriptionFromStripe } from '@/lib/pro';
import { analytics } from '@/lib/handlers';
import { log } from '@/lib/log';

/**
 * Keep host_subscriptions in sync with Stripe. Fires on create/update/delete
 * so a single handler covers trial start, payment success, cancellation,
 * past_due, and end-of-period cancel.
 */
export async function handleSubscriptionChange(
  sub: Stripe.Subscription,
  eventType:
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted',
  previousAttributes?: Partial<Stripe.Subscription>,
): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Resolve user_id: prefer subscription metadata, then customer metadata,
  // then fall back to our existing row keyed by customer id. When both
  // subscription and (expanded) customer metadata carry a user_id, reject
  // mismatches — see docs/audits/security.md P2 #7.
  const subUserId = (sub.metadata?.['user_id'] as string | undefined) ?? undefined;
  const customerUserId =
    typeof sub.customer !== 'string' && !sub.customer.deleted
      ? ((sub.customer.metadata?.['user_id'] as string | undefined) ?? undefined)
      : undefined;
  if (subUserId && customerUserId && subUserId !== customerUserId) {
    await log.error('[stripe-webhook] metadata user_id mismatch (subscription vs customer)', null, {
      subscriptionId: sub.id,
      subUserId,
      customerUserId,
    });
    throw new Error('metadata user_id mismatch');
  }
  let userId = subUserId ?? customerUserId;
  if (!userId) {
    userId = (await findHostByStripeCustomerId(customerId)) ?? undefined;
  }
  if (!userId) {
    await log.error('[stripe-webhook] subscription change: no user_id resolvable', null, {
      subscriptionId: sub.id,
      customerId,
    });
    return;
  }

  // Derive plan from the first item's price id.
  const priceId = sub.items.data[0]?.price.id ?? null;
  const plan =
    priceId === process.env['STRIPE_PRO_YEARLY_PRICE_ID']
      ? 'yearly'
      : priceId === process.env['STRIPE_PRO_MONTHLY_PRICE_ID']
        ? 'monthly'
        : null;

  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const trialEnd = sub.trial_end;

  await upsertHostSubscriptionFromStripe({
    hostId: userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    plan,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    trialEnd: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });

  // Pro funnel analytics (audit P2 #5). Fires after the DB row is up to
  // date so downstream queries match the captured event. Failures inside
  // `analytics.capture` are swallowed by the adapter — never block a
  // webhook on telemetry.
  if (eventType === 'customer.subscription.created' && sub.status === 'trialing') {
    analytics.capture(
      {
        name: 'pro_trial_started',
        props: {
          hostId: userId,
          plan,
          trialEnd: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
        },
      },
      userId,
    );
  } else if (
    eventType === 'customer.subscription.updated' &&
    previousAttributes?.status === 'trialing' &&
    sub.status === 'active'
  ) {
    analytics.capture(
      {
        name: 'pro_trial_converted',
        props: { hostId: userId, plan },
      },
      userId,
    );
  }
}
