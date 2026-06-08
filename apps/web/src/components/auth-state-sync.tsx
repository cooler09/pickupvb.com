'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

/**
 * `undefined` until the first auth event seeds the baseline; thereafter the
 * current signed-in user id (or `null` when signed out).
 */
type AuthBaseline = string | null | undefined;

/**
 * Pure decision for `AuthStateSync`: given the prior baseline and the next auth
 * event, decide whether the App Router needs a `router.refresh()` and what the
 * new baseline is.
 *
 * Only an actual identity change (sign-in, sign-out, switch user) — or a
 * same-user `USER_UPDATED` (email / metadata edit) — warrants re-rendering the
 * server tree. In particular `TOKEN_REFRESHED` must NOT refresh: the middleware
 * (proxy.ts) re-validates the session on every request and rotates the auth
 * cookie when the access token is stale; the browser client then emits
 * `TOKEN_REFRESHED`. Refreshing on it re-runs the middleware, which can rotate
 * the cookie again, which re-emits `TOKEN_REFRESHED` — a back-to-back reload
 * loop (the "404 keeps refreshing in dev" report). The first emission after
 * subscribe just seeds the baseline; the server already rendered that state.
 */
export function reduceAuthSync(
  prev: AuthBaseline,
  event: string,
  nextUserId: string | null,
): { next: AuthBaseline; refresh: boolean } {
  // Seed the baseline from the first emission (`INITIAL_SESSION` / the initial
  // `SIGNED_IN`) without refreshing.
  if (prev === undefined) return { next: nextUserId, refresh: false };

  // Token rotation keeps the user the same — refreshing here starts the loop.
  if (event === 'TOKEN_REFRESHED') return { next: prev, refresh: false };

  // No identity change (e.g. a duplicate SIGNED_IN on tab focus) and not a
  // user-data edit → nothing for the server to re-render.
  if (nextUserId === prev && event !== 'USER_UPDATED') return { next: prev, refresh: false };

  return { next: nextUserId, refresh: true };
}

/**
 * Keeps the App Router layout in sync with Supabase auth changes that happen
 * in the browser after the current RSC payload was rendered. See
 * {@link reduceAuthSync} for which events trigger a refresh and why
 * `TOKEN_REFRESHED` is deliberately excluded.
 */
export function AuthStateSync() {
  const router = useRouter();
  const baselineRef = useRef<AuthBaseline>(undefined);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const { next, refresh } = reduceAuthSync(
        baselineRef.current,
        event,
        session?.user?.id ?? null,
      );
      baselineRef.current = next;
      if (refresh) router.refresh();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
