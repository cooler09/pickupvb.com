import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless one-click unsubscribe tokens (RFC 8058). A token is
 * `<userId>.<hmac>` where the HMAC is `HMAC-SHA256(userId)` keyed on the
 * server's `CRON_SECRET` (an existing server-only secret — reused so this needs
 * no new ops config). The token is opaque to the recipient, can't be forged
 * without the secret, and carries no expiry: an unsubscribe link must keep
 * working for the life of the email.
 *
 * When `CRON_SECRET` is unset (local dev) signing returns `null`, so the worker
 * simply omits the `List-Unsubscribe` header rather than minting an
 * unverifiable token — the header degrades off, the email still sends.
 */

function secret(): string | null {
  return process.env['CRON_SECRET'] ?? null;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function hmac(userId: string, key: string): string {
  return b64url(createHmac('sha256', key).update(userId).digest());
}

/** Mint a token for `userId`, or `null` when no signing secret is configured. */
export function signUnsubscribeToken(userId: string): string | null {
  const key = secret();
  if (!key || !userId) return null;
  return `${userId}.${hmac(userId, key)}`;
}

/**
 * Verify a token and return the embedded `userId`, or `null` if it's malformed,
 * unsigned (no secret), or the signature doesn't match.
 */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(userId, key);
  // Constant-time compare; lengths must match first or `timingSafeEqual` throws.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}
