import 'server-only';
import { getAdminSupabase } from './supabase-admin';
import { getServerSupabase } from './supabase';
import { REFERRAL_REWARD_DAYS } from './pro-grants';
import { log } from './log';

/**
 * Host referrals (ADR 0039, monetization O-3). First-touch attribution at signup
 * (`recordReferralAttribution`), the ≥N-paid-events milestone that rewards the
 * referrer a comped Pro month (`maybeQualifyReferral`), and the referrer's stats
 * for the UI (`getReferralStats`). Writes use the admin client (`referrals` /
 * `pro_grants` are admin-write); all mutators are best-effort and never throw
 * into their callers (a referral failure must not break signup or event create).
 */

/** Paid events the referred host must publish before the referrer is rewarded. */
export const REFERRAL_QUALIFY_PAID_EVENTS = 3;

/** Cookie set by `/r/[code]` and consumed by the auth callback to attribute a
 * signup to the referrer. Shared so both sites agree on the name. */
export const REFERRAL_COOKIE = 'pickupvb_ref';

/**
 * Record first-touch attribution. No-op when self-referral, the referred user is
 * already attributed, or the referred account already has events (so we only
 * attribute new-ish accounts, not established hosts who click a ref link).
 */
export async function recordReferralAttribution(
  referredUserId: string,
  referrerUserId: string,
): Promise<void> {
  try {
    if (!referrerUserId || referrerUserId === referredUserId) return;
    const admin = getAdminSupabase();

    const { data: existing } = await admin
      .from('referrals')
      .select('id')
      .eq('referred_user_id', referredUserId)
      .maybeSingle();
    if (existing) return;

    const { count } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('host_id', referredUserId);
    if ((count ?? 0) > 0) return;

    const { error } = await admin
      .from('referrals')
      .insert({ referrer_user_id: referrerUserId, referred_user_id: referredUserId });
    // A bad referrer id (FK violation) or a race (unique on referred) is fine —
    // attribution is best-effort.
    if (error && error.code !== '23505' && error.code !== '23503') {
      await log.warn('[referral] attribution insert', { error: error.message });
    }
  } catch (err) {
    await log.error('[referral] attribution failed', err, { referredUserId });
  }
}

/**
 * After the referred host publishes a paid event, qualify the pending referral
 * once they've published ≥ `REFERRAL_QUALIFY_PAID_EVENTS` paid events, and reward
 * the referrer a comped Pro month (stacked from their latest active grant).
 */
export async function maybeQualifyReferral(referredUserId: string): Promise<void> {
  try {
    const admin = getAdminSupabase();
    const { data: ref } = await admin
      .from('referrals')
      .select('id, referrer_user_id, status')
      .eq('referred_user_id', referredUserId)
      .maybeSingle();
    const r = ref as { id: string; referrer_user_id: string; status: string } | null;
    if (!r || r.status !== 'pending') return;

    // Distinct paid events ever published by the referred host (status-agnostic,
    // same notion as the paid-event cap).
    const { data: rows } = await admin
      .from('events')
      .select('id, event_divisions!inner(price_cents)')
      .eq('host_id', referredUserId)
      .gt('event_divisions.price_cents', 0);
    const distinct = new Set(((rows as { id: string }[] | null) ?? []).map((e) => e.id));
    if (distinct.size < REFERRAL_QUALIFY_PAID_EVENTS) return;

    const now = new Date();
    const { data: latest } = await admin
      .from('pro_grants')
      .select('granted_until')
      .eq('user_id', r.referrer_user_id)
      .order('granted_until', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestMs = (latest as { granted_until: string } | null)?.granted_until
      ? new Date((latest as { granted_until: string }).granted_until).getTime()
      : 0;
    const baseMs = Math.max(latestMs, now.getTime());
    const grantedUntil = new Date(baseMs + REFERRAL_REWARD_DAYS * 86_400_000).toISOString();

    await admin.from('pro_grants').insert({
      user_id: r.referrer_user_id,
      granted_until: grantedUntil,
      reason: 'referral',
      source_ref: r.id,
    });
    await admin
      .from('referrals')
      .update({
        status: 'rewarded',
        qualified_at: now.toISOString(),
        rewarded_at: now.toISOString(),
      })
      .eq('id', r.id);
  } catch (err) {
    await log.error('[referral] qualify failed', err, { referredUserId });
  }
}

export type ReferralStats = {
  /** Referred hosts not yet at the paid-event threshold. */
  pending: number;
  /** Referrals that earned a reward. */
  rewarded: number;
};

/** The referrer's own referral counts (RLS: referrer reads own rows). */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const sb = await getServerSupabase();
  const { data } = await sb.from('referrals').select('status').eq('referrer_user_id', userId);
  const rows = (data as { status: string }[] | null) ?? [];
  return {
    pending: rows.filter((r) => r.status === 'pending').length,
    rewarded: rows.filter((r) => r.status === 'rewarded' || r.status === 'qualified').length,
  };
}
