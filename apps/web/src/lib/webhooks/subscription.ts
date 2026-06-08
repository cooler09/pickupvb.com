/**
 * `customer.subscription.*` webhook handler (architecture audit P3-2 —
 * extracted verbatim from the webhook route). One handler covers
 * create/update/delete: trial start, payment success, cancellation, past_due,
 * and end-of-period cancel — keeping `host_subscriptions` in sync with Stripe.
 */
import type Stripe from 'stripe';
import { findHostByStripeCustomerId, upsertHostSubscriptionFromStripe } from '@/lib/pro';
import { analytics } from '@/lib/handlers';
import { recordAuditEvent } from '@/lib/audit-log';
import { log } from '@/lib/log';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { upsertGroupSubscriptionFromStripe } from '@/lib/club';

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
  // Recurring HOST memberships (ADR 0037 Phase 2) are Connect destination
  // subscriptions tagged with `metadata.kind = 'host_membership'`. They mirror
  // into `host_memberships`, not the PickupVB-Pro `host_subscriptions` table —
  // route them out before the Pro path below.
  if (sub.metadata?.['kind'] === 'host_membership') {
    await handleHostMembershipChange(sub);
    return;
  }

  // Group Club subscriptions (ADR 0038) mirror into group_subscriptions, not the
  // per-user host_subscriptions table.
  if (sub.metadata?.['kind'] === 'club') {
    await handleClubSubscriptionChange(sub);
    return;
  }

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

  // Audit trail of subscription state transitions (security audit P3 #8).
  // System-driven (Stripe webhook), so there's no actor; the host is the target.
  await recordAuditEvent({
    action: 'host_subscription.changed',
    entityType: 'host_subscription',
    entityId: sub.id,
    targetUserId: userId,
    metadata: {
      eventType,
      status: sub.status,
      plan,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
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

/**
 * Mirror a host-membership (ADR 0037 Phase 2) Connect destination subscription
 * into `host_memberships`. Identity comes from the subscription metadata set at
 * Checkout (`plan_id` / `host_id` / `member_user_id`). Admin client —
 * `host_memberships` writes are admin-only. Idempotent: update by
 * `stripe_subscription_id` if the row exists, else insert; a redelivered webhook
 * is a no-op beyond refreshing status.
 */
async function handleHostMembershipChange(sub: Stripe.Subscription): Promise<void> {
  const planId = sub.metadata?.['plan_id'];
  const hostId = sub.metadata?.['host_id'];
  const memberUserId = sub.metadata?.['member_user_id'];
  if (!planId || !hostId || !memberUserId) {
    await log.error('[stripe-webhook] host_membership: missing metadata', null, {
      subscriptionId: sub.id,
    });
    return;
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
  const cancelAtPeriodEnd = sub.cancel_at_period_end ?? false;

  const admin = getAdminSupabase();

  const { data: existing } = await admin
    .from('host_memberships')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();

  if (existing) {
    await admin
      .from('host_memberships')
      .update({
        status: sub.status,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        stripe_customer_id: customerId,
      })
      .eq('stripe_subscription_id', sub.id);
  } else {
    const { data: planRow } = await admin
      .from('host_membership_plans')
      .select('title')
      .eq('id', planId)
      .maybeSingle();
    const title = (planRow as { title: string } | null)?.title ?? 'Membership';

    await admin.from('host_memberships').insert({
      plan_id: planId,
      host_id: hostId,
      member_user_id: memberUserId,
      title_snapshot: title,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    });
  }

  await recordAuditEvent({
    action: 'host_membership.changed',
    entityType: 'host_membership',
    entityId: sub.id,
    targetUserId: memberUserId,
    metadata: { status: sub.status, hostId, planId, cancelAtPeriodEnd },
  });
}

/**
 * Mirror a group Club subscription (ADR 0038) into `group_subscriptions`.
 * Identity comes from `metadata.group_id` set at Checkout. Admin client (writes
 * are admin-only); the upsert keys on the group_id PK so a redelivered webhook
 * just refreshes status.
 */
async function handleClubSubscriptionChange(sub: Stripe.Subscription): Promise<void> {
  const groupId = sub.metadata?.['group_id'];
  if (!groupId) {
    await log.error('[stripe-webhook] club: missing group_id metadata', null, {
      subscriptionId: sub.id,
    });
    return;
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const trialEnd = sub.trial_end;

  await upsertGroupSubscriptionFromStripe({
    groupId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    trialEnd: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });
}
