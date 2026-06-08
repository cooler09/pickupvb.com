/**
 * Resend webhook signature verification (audit P2 #3).
 *
 * Resend signs webhooks with the Svix scheme: three headers (`svix-id`,
 * `svix-timestamp`, `svix-signature`) and an HMAC-SHA256 over
 * `${id}.${timestamp}.${rawBody}` keyed by the base64-decoded signing secret
 * (the `whsec_…` value from the Resend dashboard). We verify by hand with Node
 * `crypto` rather than pulling in the `svix` SDK — it's ~20 lines and keeps the
 * dependency graph lean (mirrors the hand-rolled Resend send adapter).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/** Reject timestamps more than this far from now (replay protection). */
const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Replay guard — reject stale or forward-dated deliveries.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - ts) > TOLERANCE_SECONDS) return false;

  // Secret is `whsec_<base64>`; the HMAC key is the decoded bytes.
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = Buffer.from(createHmac('sha256', key).update(signedContent).digest('base64'));

  // The header is a space-delimited list of `version,signature` pairs
  // (e.g. `v1,<base64> v1a,<base64>`); a delivery passes if any entry matches.
  for (const part of signature.split(' ')) {
    const comma = part.indexOf(',');
    const sig = comma === -1 ? part : part.slice(comma + 1);
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected)) {
      return true;
    }
  }
  return false;
}
