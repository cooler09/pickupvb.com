/**
 * Resend email adapter. Plain fetch — avoids the `resend` SDK to keep the
 * web bundle smaller and the dependency graph simpler.
 *
 * Returns the provider message id on success, throws on failure. Callers
 * (the cron worker) translate throws into outbox `failed`/retry semantics.
 *
 * Hard-bounce / complaint handling lives in the Resend webhook
 * ([api/webhooks/resend](../app/api/webhooks/resend/route.ts) → the
 * `email_suppressions` sink); the outbox worker checks that sink before each
 * send, so this adapter just sends. Non-transactional mail carries a one-click
 * `List-Unsubscribe` header (RFC 8058) when the worker supplies a
 * `listUnsubscribeUrl`.
 */

const RESEND_API = 'https://api.resend.com/emails';

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Optional Resend idempotency key. The cron worker passes the outbox row id
   * so a redelivery after a crash between the send and `markSent` returns the
   * original email instead of sending a duplicate. Resend dedupes on this key
   * for 24h. See docs/audits/third-party-integrations.md TPI-8.
   */
  idempotencyKey?: string;
  /**
   * One-click unsubscribe URL (RFC 8058). When present, the email carries
   * `List-Unsubscribe: <url>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
   * so Gmail/Apple Mail render a native Unsubscribe affordance and POST to it.
   * Omitted for transactional mail (you can't unsubscribe from a receipt).
   */
  listUnsubscribeUrl?: string;
};

export type SendEmailResult = {
  provider: 'resend';
  id: string;
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['RESEND_FROM'] ?? 'PickupVB <noreply@pickupvb.com>';
  if (!apiKey) {
    // Soft-fail in dev: log and pretend it worked. Lets the outbox row
    // flip to `sent` so devs can iterate without sending real mail.
    console.log('[email/dev] (no RESEND_API_KEY)', {
      to: input.to,
      subject: input.subject,
    });
    return { provider: 'resend', id: `dev_${Date.now()}` };
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      // RFC 8058 one-click unsubscribe — surfaced as native mail-client
      // "Unsubscribe" UI. Resend forwards custom `headers` to the message.
      ...(input.listUnsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${input.listUnsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { id?: string };
  return { provider: 'resend', id: data.id ?? '' };
}
