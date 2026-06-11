import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Resolve the request's absolute origin (scheme + host) for building
 * Stripe success/cancel URLs. Falls back to localhost in dev when neither
 * header is present.
 */
export async function buildOrigin(): Promise<string> {
  const h = await headers();
  return h.get('origin') ?? (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000');
}

/**
 * Build the `emailRedirectTo` for any anonymous-claim email confirmation —
 * the `/claim` form, guest RSVP, and guest checkout all attach an email to an
 * anonymous user, which makes GoTrue send a confirmation link. Route every one
 * of those links through `/auth/callback` → `/reset-password?from=claim` so the
 * click lands on the set-password step and finishes converting the account
 * (rather than the default Site URL, which strands a half-converted user with
 * no password — see docs/audits/anonymous-claim.md AC-2).
 *
 * `next` is an optional post-password destination. The caller MUST sanitize it
 * to a same-origin relative path; we only URL-encode here.
 */
export async function buildClaimEmailRedirect(next?: string): Promise<string> {
  const origin = await buildOrigin();
  const afterPassword = next
    ? `/reset-password?from=claim&next=${encodeURIComponent(next)}`
    : '/reset-password?from=claim';
  return `${origin}/auth/callback?next=${encodeURIComponent(afterPassword)}`;
}

/**
 * Redirect back to an event page with a `?<key>=<code>` (and optional
 * `?<key>_msg=<msg>`) flash. Used by paid-event server actions to surface
 * outcomes via querystring — the page renders a banner from these params.
 *
 * Keys in use:
 *   - 'rsvp'   → RSVP / checkout outcomes
 *   - 'tip'    → tip-jar outcomes
 *   - 'fa'     → free-agent signup outcomes
 *   - 'cohost' → add/remove co-host outcomes
 *   - 'forfeit'→ league-team forfeit/reinstate outcomes
 */
export function redirectEventNotice(
  eventId: string,
  key: 'rsvp' | 'tip' | 'fa' | 'cohost' | 'forfeit',
  code: string,
  msg?: string,
): never {
  const params = new URLSearchParams({ [key]: code });
  if (msg) params.set(`${key}_msg`, msg);
  redirect(`/events/${eventId}?${params.toString()}`);
}
