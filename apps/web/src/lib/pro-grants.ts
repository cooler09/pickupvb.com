import 'server-only';
import { cache } from 'react';
import { getAdminSupabase } from './supabase-admin';

/**
 * Comped Pro time (ADR 0039) — e.g. a referral reward. A `pro_grants` row with
 * `granted_until > now()` makes the user Pro-entitled; `hasProBenefits()` ORs
 * this in. Read on the admin client so it resolves for any user id regardless of
 * the viewer (the gate is checked for the host, not necessarily the caller), and
 * so it's safe inside cached contexts (no `cookies()`).
 */

/** Length of one referral reward, in days. */
export const REFERRAL_REWARD_DAYS = 30;

/** True when the user has Pro comped right now. Per-request memoized. */
export const hasActiveProGrant = cache(async (userId: string): Promise<boolean> => {
  const { data } = await getAdminSupabase()
    .from('pro_grants')
    .select('id')
    .eq('user_id', userId)
    .gt('granted_until', new Date().toISOString())
    .limit(1);
  return ((data as { id: string }[] | null)?.length ?? 0) > 0;
});

/** The furthest-out active grant end, for display ("Pro free until …"). */
export async function activeProGrantUntil(userId: string): Promise<string | null> {
  const { data } = await getAdminSupabase()
    .from('pro_grants')
    .select('granted_until')
    .eq('user_id', userId)
    .gt('granted_until', new Date().toISOString())
    .order('granted_until', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { granted_until: string } | null)?.granted_until ?? null;
}
