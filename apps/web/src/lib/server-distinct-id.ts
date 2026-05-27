import { createHash } from 'node:crypto';
import { cache } from 'react';
import { getCurrentUser, isAnonymousUser } from './server-auth';

/**
 * Server-side helper that derives the PostHog distinct id for the
 * current viewer. Mirrors the hashing scheme in
 * [PostHogAnalytics](../../../../packages/infrastructure/src/posthog-analytics.ts)
 * (`sha256(POSTHOG_DISTINCT_ID_SALT + ':' + userId)`) so a server-side
 * `capture()` and a browser SDK `identify()` for the same human land
 * under one PostHog Person.
 *
 * Returns `null` when:
 *  - `POSTHOG_DISTINCT_ID_SALT` is not configured (local dev / CI),
 *  - no Supabase user is signed in,
 *  - the user is anonymous (`is_anonymous` claim). Anonymous users
 *    should keep the browser-issued cookie distinct id; we never
 *    promote them to a salted-hash identity until they claim a real
 *    account.
 *
 * Wrapped in React `cache()` so the auth + hash round-trip runs once
 * per request.
 */
export const getViewerHashedDistinctId = cache(async (): Promise<string | null> => {
  const salt = process.env['POSTHOG_DISTINCT_ID_SALT'];
  if (!salt) return null;
  const { user } = await getCurrentUser();
  if (!user || isAnonymousUser(user)) return null;
  return createHash('sha256').update(`${salt}:${user.id}`).digest('hex');
});

/**
 * PII-free identify traits that match the allowlist enforced by
 * `AnalyticsTraits` in `@pickupvb/domain`. Kept small on purpose —
 * anything richer should flow through the server-side `identify`
 * (which has access to the full Supabase row and is gated by the
 * same consent decorator).
 */
export type ViewerTraits = {
  isAnonymous: boolean;
};

export const getViewerTraits = cache(async (): Promise<ViewerTraits | null> => {
  const { user } = await getCurrentUser();
  if (!user) return null;
  return { isAnonymous: isAnonymousUser(user) };
});
