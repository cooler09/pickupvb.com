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
        const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
        if (json.success) return { ok: true };
        return {
            ok: false,
            error: `Verification failed${json['error-codes']?.length ? ` (${json['error-codes'].join(', ')})` : ''
                }.`,
        };
    } catch (err) {
        await log.error('[turnstile] verify error', err);
        return { ok: false, error: 'Verification service unavailable. Try again.' };
    }
}
