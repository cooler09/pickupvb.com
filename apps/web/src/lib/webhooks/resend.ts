/**
 * Resend webhook event handler (audit P2 #3).
 *
 * Applies a verified Resend event to the email suppression list: a recipient is
 * suppressed on a **hard bounce** (permanent — the mailbox doesn't exist) or a
 * **complaint** (they marked the mail as spam). Everything else — delivered /
 * opened / clicked, and crucially a *transient* (soft) bounce — is ignored: a
 * soft bounce is temporary and the outbox retry/backoff already handles it.
 *
 * Kept as a pure function over an injected `EmailSuppressionPort` (no Supabase,
 * no `next/*`) so the bounce/complaint classification is unit-testable; the
 * route wires the concrete repo.
 */
import type { EmailSuppressionPort, EmailSuppressionReason } from '@pickupvb/domain';

export type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string };
  };
};

export async function handleResendEvent(
  event: ResendEvent,
  suppressions: EmailSuppressionPort,
): Promise<{ suppressed: number }> {
  const reason = suppressionReason(event);
  if (!reason) return { suppressed: 0 };

  const messageId = event.data?.email_id;
  let suppressed = 0;
  for (const address of toAddresses(event.data?.to)) {
    await suppressions.suppress(address, reason, messageId);
    suppressed += 1;
  }
  return { suppressed };
}

function suppressionReason(event: ResendEvent): EmailSuppressionReason | null {
  if (event.type === 'email.complained') return 'complained';
  if (event.type === 'email.bounced') {
    // Suppress every bounce except an explicitly transient (soft) one — a soft
    // bounce is temporary, so let the outbox retry it rather than blocking the
    // address. Permanent / undetermined / missing-type all suppress.
    return event.data?.bounce?.type?.toLowerCase() === 'transient' ? null : 'bounced';
  }
  return null;
}

function toAddresses(to: string[] | string | undefined): string[] {
  if (!to) return [];
  return (Array.isArray(to) ? to : [to]).map((a) => a.trim()).filter(Boolean);
}
