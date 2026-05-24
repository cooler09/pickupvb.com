/**
 * Server-side Cloudflare Turnstile token verification.
 *
 * The widget posts a `cf-turnstile-response` token in the form. We POST it to
 * Cloudflare's siteverify endpoint along with the secret key; on success
 * Cloudflare returns `{ success: true, ... }`.
 *
 * Set in env:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (used by the client widget)
 *   TURNSTILE_SECRET_KEY            (server-only, used here)
 *
 * If the secret is missing we log a warning and accept the token — keeps
 * local dev from blocking. Production deploys MUST set both keys.
 */
import { log } from './log';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Maximum age of a Turnstile token, in milliseconds.
 *
 * Cloudflare's `siteverify` response includes a `challenge_ts` ISO timestamp
 * marking when the challenge was solved. We reject tokens whose
 * `challenge_ts` is older than this to prevent a bot from pre-generating a
 * token and replaying it later. Cloudflare's own docs say tokens are
 * valid for ~5 min server-side, but for our flows (signup / RSVP) the user
 * should solve the challenge and submit within seconds, so 2 min is a
 * comfortable bound.
 */
const TURNSTILE_MAX_AGE_MS = 2 * 60 * 1000;

export async function verifyTurnstileToken(token: string | null | undefined): Promise<{
  ok: boolean;
  error?: string;
}> {
  const secret = process.env['TURNSTILE_SECRET_KEY'];
  if (!secret) {
    log.warn('[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification.');
    return { ok: true };
  }
  if (!token) {
    return { ok: false, error: 'Please complete the human verification.' };
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);

    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const json = (await res.json()) as {
      success?: boolean;
      'error-codes'?: string[];
      challenge_ts?: string;
    };
    if (!json.success) {
      return {
        ok: false,
        error: `Verification failed${
          json['error-codes']?.length ? ` (${json['error-codes'].join(', ')})` : ''
        }.`,
      };
    }

    // Freshness check: reject replayed / pre-generated tokens.
    if (json.challenge_ts) {
      const issuedAt = Date.parse(json.challenge_ts);
      if (Number.isFinite(issuedAt)) {
        const age = Date.now() - issuedAt;
        if (age > TURNSTILE_MAX_AGE_MS) {
          log.warn('[turnstile] rejecting stale token', {
            ageMs: age,
            maxAgeMs: TURNSTILE_MAX_AGE_MS,
          });
          return {
            ok: false,
            error: 'Verification expired. Please try again.',
          };
        }
      }
    }

    return { ok: true };
  } catch (err) {
    await log.error('[turnstile] verify error', err);
    return { ok: false, error: 'Verification service unavailable. Try again.' };
  }
}
