/**
 * Email suppression sink (notifications audit P2 #3).
 *
 * The Resend webhook records hard-bounced / complained recipient addresses
 * here; the outbox worker reads it before each email send and skips suppressed
 * recipients. Without it, a dead or complaining address was re-mailed on every
 * future notification — burning sender reputation and risking domain throttling.
 *
 * Addresses are matched case-insensitively (the adapter lowercases on both
 * sides). Suppression is platform infrastructure, not user data — the port runs
 * on the service-role client (the webhook writer and the worker reader are both
 * session-less).
 */

export type EmailSuppressionReason = 'bounced' | 'complained';

export interface EmailSuppressionPort {
  /** Of `addresses`, the subset currently suppressed (returned lowercased). */
  listSuppressed(addresses: string[]): Promise<string[]>;
  /**
   * Record — or refresh, on a repeat event — a suppression for `address`.
   * Idempotent: a second bounce/complaint just bumps `last_event_at`.
   */
  suppress(
    address: string,
    reason: EmailSuppressionReason,
    providerMessageId?: string,
  ): Promise<void>;
}
