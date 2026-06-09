import 'server-only';

import type { DeletionRequest, DeletionRequestRepository } from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase/admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { sendEmail } from '@/lib/email-resend';
import { log } from '@/lib/log';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Irreversible account purge (ADR 0029) — the cron's per-request work, run on the
 * service-role client (session-less, like the webhook mirrors). Ordered so the
 * PII-erasure steps land before the point of no return, and the request is marked
 * `executed` while its row still exists:
 *
 *   1. closure email (best-effort; read the address before the auth row is gone)
 *   2. cancel an active Stripe subscription (Connect account is intentionally kept)
 *   3. scrub the profile in place (anonymize + stamp deleted_at)
 *   4. drop transient notification rows
 *   5. mark the request `executed` and save it
 *   6. hard-delete the auth user — cascades through profiles; the executed
 *      deletion_requests row survives with user_id SET NULL as an anonymized
 *      proof-of-erasure record.
 *
 * The whole thing is best-effort-idempotent: steps 1-4 tolerate re-runs, so a
 * failure before step 5 leaves the request `scheduled` and the next cron retries.
 * A failure at step 6 (after `executed`) is logged loudly — the PII is already
 * erased (step 3); the lingering auth row is an ops cleanup, not a privacy gap.
 */
export async function executeAccountDeletion(
  admin: AdminClient,
  repo: DeletionRequestRepository,
  request: DeletionRequest,
): Promise<void> {
  const userId = String(request.userId);

  // 1. Closure email — resolve the address while the auth user still exists.
  //    Keep the address for step 4 (suppression cleanup) before it's gone.
  let email: string | undefined;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data.user?.email ?? undefined;
    if (email) await sendEmail(closureEmail(email));
  } catch (err) {
    await log.warn('[account-purge] closure email failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Cancel an active Pro subscription. Do NOT touch the Connect account
  //    (host_stripe_accounts) — it's kept for 1099-K reconciliation and its
  //    user_id SET-NULLs on the auth delete.
  await cancelActiveSubscription(admin, userId);

  // 3. Scrub the profile in place (defense-in-depth: even if step 6 fails, the
  //    PII is gone and profiles_public — which filters deleted_at — hides it).
  const { error: scrubError } = await admin
    .from('profiles')
    .update({
      display_name: 'Former member',
      first_name: null,
      last_name: null,
      avatar_url: null,
      hero_image_url: null,
      home_city: null,
      business_name: null,
      business_address: null,
      tax_id: null,
      instagram_handle: null,
      tiktok_handle: null,
      twitter_handle: null,
      facebook_handle: null,
      youtube_handle: null,
      website_url: null,
      primary_position: null,
      secondary_position: null,
      tertiary_position: null,
      deleted_at: new Date().toISOString(),
      deletion_reason: 'user_requested',
    })
    .eq('id', userId);
  if (scrubError) throw new Error(`profile scrub failed: ${scrubError.message}`);

  // 4. Drop transient notification rows (settings, device tokens, in-app feed)
  //    and cancel any still-pending outbox deliveries. Also clear the email
  //    suppression for this address (privacy #22) so a hard-bounced address
  //    doesn't outlive the account as residual PII and a future re-signup on a
  //    recycled mailbox isn't silently un-mailed. email_suppressions has no FK to
  //    profiles, so the auth-delete cascade in step 6 can't reach it.
  await Promise.all([
    admin.from('push_subscriptions').delete().eq('user_id', userId),
    admin.from('notification_preferences').delete().eq('user_id', userId),
    admin.from('notifications').delete().eq('user_id', userId),
    admin
      .from('notification_outbox')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'pending'),
    ...(email
      ? [admin.from('email_suppressions').delete().eq('address', email.trim().toLowerCase())]
      : []),
  ]);

  // 5. Record the transition while the row + FK target still exist.
  request.markExecuted();
  await repo.save(request);

  // 6. Point of no return — remove the auth identity. Cascades delete the
  //    profile tombstone; SET-NULL FKs preserve regulatory rows + this audit row.
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    await log.error('[account-purge] auth deleteUser failed after PII erasure', authError);
    throw new Error(`auth.admin.deleteUser failed: ${authError.message}`);
  }
}

/** Cancel the user's live Pro subscription, if any. Best-effort: a Stripe error
 * is logged but doesn't block the erasure (the account is going away regardless). */
async function cancelActiveSubscription(admin: AdminClient, userId: string): Promise<void> {
  if (!isStripeConfigured()) return;
  const { data } = await admin
    .from('host_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { stripe_subscription_id: string | null; status: string } | null;
  if (!row?.stripe_subscription_id) return;
  if (row.status !== 'active' && row.status !== 'trialing') return;
  try {
    await getStripe().subscriptions.cancel(row.stripe_subscription_id);
  } catch (err) {
    await log.error('[account-purge] subscription cancel failed', err);
  }
}

function closureEmail(to: string): { to: string; subject: string; html: string; text: string } {
  const subject = 'Your PickupVB account has been deleted';
  const text =
    'Your PickupVB account and personal data have been permanently deleted, as requested. ' +
    'Tournament and payment records you were part of are retained in anonymized form where ' +
    'we are legally required to keep them. Thanks for playing.';
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#f7f7f7;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e5e5">
    <div style="font-size:20px;font-weight:700;color:#e6004a;margin-bottom:16px">PickupVB</div>
    <h2 style="margin:0 0 12px">Your account has been deleted</h2>
    <p>${text}</p>
  </div></body></html>`;
  return { to, subject, html, text };
}
