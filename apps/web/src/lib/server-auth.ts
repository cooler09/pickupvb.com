/**
 * Auth helpers for server actions and server components.
 *
 * For Route Handlers (which need to return a NextResponse on failure) use
 * `requireUser` from `./api-helpers` instead.
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getServerSupabase } from './supabase';

type SupabaseClient = Awaited<ReturnType<typeof getServerSupabase>>;

/** Returns true for Supabase anonymous-auth users (`is_anonymous` claim). */
export function isAnonymousUser(user: Pick<User, 'id'> | null | undefined): boolean {
    return Boolean(user && (user as unknown as { is_anonymous?: boolean }).is_anonymous);
}

export interface ViewerSession {
    supabase: SupabaseClient;
    user: User;
    isAnonymous: boolean;
}

/**
 * Get the current viewer or `null` if no session exists. Never throws.
 * Wrapped in React `cache()` so repeated calls within the same request reuse
 * the result of a single `supabase.auth.getUser()` round-trip.
 */
export const getViewer = cache(async (): Promise<ViewerSession | null> => {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return { supabase, user, isAnonymous: isAnonymousUser(user) };
});

/**
 * Returns `{ supabase, user }` where `user` may be `null`. Convenience for
 * call sites that just need the (possibly missing) user without the viewer
 * envelope. Same cache as `getViewer()`.
 */
export async function getCurrentUser(): Promise<{
    supabase: SupabaseClient;
    user: User | null;
}> {
    const viewer = await getViewer();
    if (viewer) return { supabase: viewer.supabase, user: viewer.user };
    return { supabase: await getServerSupabase(), user: null };
}

/**
 * Require any session (anon or real). Redirects to `/login` (with optional
 * `?next=`) if no session is present. Use in server actions.
 */
export async function requireSession(nextPath?: string): Promise<ViewerSession> {
    const v = await getViewer();
    if (!v) {
        redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login');
    }
    return v;
}

/**
 * Require a permanent (non-anonymous) user. Redirects to `/login` if no
 * session, or to `/claim` if the viewer is still anonymous. Use in server
 * actions for operations that require a real account.
 */
export async function requireRealUser(nextPath?: string): Promise<ViewerSession> {
    const v = await requireSession(nextPath);
    if (v.isAnonymous) {
        redirect(nextPath ? `/claim?next=${encodeURIComponent(nextPath)}` : '/claim');
    }
    return v;
}
