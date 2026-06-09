/**
 * Resend webhook receiver (audit P2 #3).
 *
 * Resend POSTs delivery events here (Svix-signed). We:
 *   1. Verify the `svix-*` signature with `RESEND_WEBHOOK_SECRET`.
 *   2. On a hard bounce / complaint, add the recipient to the email suppression
 *      list so the outbox worker stops mailing that address.
 *
 * Invariants (mirror the Stripe webhook):
 *   - Reachable without authentication; the signature is the trust boundary.
 *   - 4xx for "expected" failures (missing/invalid signature, bad JSON) so
 *     Resend doesn't retry forever; 5xx only for a transient server fault, where
 *     a retry is safe because `suppress()` is idempotent.
 *
 * Ops: set `RESEND_WEBHOOK_SECRET` (the `whsec_…` from the Resend dashboard) and
 * point a Resend webhook at `/api/webhooks/resend` for the `email.bounced` +
 * `email.complained` events. Until then this route 503s and nothing suppresses —
 * sends are unaffected.
 */
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { SupabaseEmailSuppressionRepository } from '@pickupvb/infrastructure';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { verifyResendSignature } from '@/lib/webhooks/resend-verify';
import { handleResendEvent, type ResendEvent } from '@/lib/webhooks/resend';
import { log } from '@/lib/log';

// Body must be the raw text — signature verification needs byte-exact input.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const secret = process.env['RESEND_WEBHOOK_SECRET'];
  if (!secret) {
    return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET_MISSING' }, { status: 503 });
  }

  const rawBody = await request.text();
  const h = await headers();
  const ok = verifyResendSignature(
    rawBody,
    {
      id: h.get('svix-id'),
      timestamp: h.get('svix-timestamp'),
      signature: h.get('svix-signature'),
    },
    secret,
  );
  if (!ok) return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 });
  }

  try {
    const suppressions = new SupabaseEmailSuppressionRepository(createSupabaseAdminClient());
    const { suppressed } = await handleResendEvent(event, suppressions);
    return NextResponse.json({ ok: true, type: event.type ?? null, suppressed });
  } catch (err) {
    await log.error('[resend-webhook] failed', err, { type: event.type });
    // 5xx → Resend retries; suppress() is idempotent so a retry is safe.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
