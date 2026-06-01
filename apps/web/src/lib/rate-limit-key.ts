import { createHash } from 'node:crypto';

/**
 * Build a rate-limit key with the per-actor portion **hashed**, so raw emails /
 * IPs never persist in `rate_limits.key` (privacy audit P3 #10).
 *
 * Deterministic — the same actor always hashes to the same key, so the
 * fixed-window lookup in `consumeRateLimit` still resolves. Salted with
 * `RATE_LIMIT_SALT` when set so a leaked `rate_limits` dump can't be reversed by
 * brute-forcing the small (2^32) IP space; falls back to an unsalted hash in dev.
 *
 * Email is lower-cased + trimmed first so `Alice@x.com` and `alice@x.com ` count
 * as the same actor (matching the prior `.toLowerCase()` call sites).
 *
 * Kept in its own module — no `server-only` / `next` imports — so it stays a
 * pure, unit-testable function.
 */
export function rateLimitKey(scope: string, dimension: 'ip' | 'email', value: string): string {
  const normalized = dimension === 'email' ? value.trim().toLowerCase() : value.trim();
  const salt = process.env['RATE_LIMIT_SALT'] ?? '';
  const hash = createHash('sha256').update(`${salt}:${normalized}`).digest('hex').slice(0, 16);
  return `${scope}:${dimension}:${hash}`;
}
