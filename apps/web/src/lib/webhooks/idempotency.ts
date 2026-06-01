/**
 * Stripe webhook idempotency decision (TPI-6).
 *
 * The webhook route claims each event by inserting its id into
 * `stripe_webhook_events`, runs the handler, then stamps `processed_at`. The
 * earlier design deduped on mere row *existence*, so a crash between the claim
 * insert and the handler completing (Vercel timeout/OOM, with no chance to run
 * the delete-on-error) left the row at `processed_at IS NULL` forever — and
 * Stripe's retry was then deduped against that orphaned claim, **silently
 * dropping the event** on the payments path.
 *
 * Deduping on `processed_at` instead fixes that: a row that was never finished
 * is re-driven on the next Stripe retry. Webhook handlers are idempotent at the
 * data layer, so re-driving an orphan (or the rare concurrent double-delivery
 * that this also lets through) is safe.
 */
export type WebhookDecision = 'process' | 'deduped';

/**
 * @param insertedNew        true when the claim insert created the row (first sight).
 * @param existingProcessedAt `processed_at` of the pre-existing row (only read on conflict).
 */
export function decideWebhookProcessing(
  insertedNew: boolean,
  existingProcessedAt: string | null,
): WebhookDecision {
  if (insertedNew) return 'process'; // first sight — claim is ours
  if (existingProcessedAt) return 'deduped'; // a prior attempt fully processed it
  return 'process'; // orphaned claim (crashed mid-handler) — re-drive it
}
