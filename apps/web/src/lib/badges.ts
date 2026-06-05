import 'server-only';
import {
  getBadgeDefinition,
  isEasterEggBadgeKey,
  type GrantedBadge,
  type SystemBadgeKey,
} from '@pickupvb/domain';
import { ReconcileUserBadgesHandler } from '@pickupvb/application';
import { SupabaseBadgeRepository } from '@pickupvb/infrastructure';
import type { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { getAdminSupabase } from './supabase-admin';
import { notify } from './notify';

type ReadClient = ReturnType<typeof createSupabaseAnonClient>;

/**
 * Badge subsystem facade (gamification Phase 1). Thin wrapper over the
 * `BadgeRepository` port — kept in `apps/web/src/lib` so pages can reconcile /
 * read badges without threading the repo through everywhere. This mirrors the
 * sanctioned facade-over-port shape of `pro.ts` / `host-stripe-account.ts`
 * (AGENTS.md pattern #10): there is no aggregate invariant to protect, so the
 * single behavioural step (`ReconcileUserBadgesHandler`) is the only thing a
 * command handler would add — and that handler is reused directly here.
 */

const badgeRepo = () => new SupabaseBadgeRepository(getAdminSupabase());

/**
 * Reconcile a user's system badges and return the keys granted *on this run* so
 * the caller can surface a one-time "unlocked!" toast. Fail-quiet: badge
 * reconciliation is a side delight and must never break a page render — a thrown
 * stats/grant error degrades to "no new badges this load".
 */
export async function reconcileUserBadges(userId: string): Promise<SystemBadgeKey[]> {
  try {
    // Phase 2: also grant any on_attend host event badges the user earned by
    // attending. Pure per-event membership grant (no thresholds), so it lives in
    // SQL; fire-and-forget alongside the system reconcile.
    await getAdminSupabase()
      .rpc('grant_attended_event_badges', { p_user_id: userId })
      .then(
        () => undefined,
        () => undefined,
      );
    const newly = await new ReconcileUserBadgesHandler(badgeRepo()).execute(userId);
    // Bell notification (in_app only) for each newly-granted system badge. Only
    // fires the first time a badge is granted (reconcile is idempotent), so no
    // spam. Best-effort — a notify failure must not break the reconcile.
    await Promise.allSettled(
      newly.map((key) => {
        const def = getBadgeDefinition(key);
        return def ? notify('badge.earned', userId, { badgeTitle: def.title }) : Promise.resolve();
      }),
    );
    return newly;
  } catch {
    return [];
  }
}

/**
 * Grant a hidden easter-egg badge (Phase 3). Validates the key against the
 * easter-egg catalog (so a forged client call can't mint an arbitrary badge),
 * then grants idempotently. Returns true only when newly granted.
 */
export async function grantEasterEggBadge(userId: string, key: string): Promise<boolean> {
  if (!isEasterEggBadgeKey(key)) return false;
  try {
    return await badgeRepo().grant({ userId, badgeKey: key, source: 'easter_egg' });
  } catch {
    return false;
  }
}

/** Owner view: every badge the user holds, including hidden ones. */
export async function getOwnBadges(userId: string): Promise<GrantedBadge[]> {
  try {
    return await badgeRepo().listForUser(userId);
  } catch {
    return [];
  }
}

/** A publicly-visible badge (the trophy-case projection for other viewers). */
export interface PublicBadge {
  badgeKey: string;
  source: string;
  awardedAt: string;
  /** Snapshotted display fields for host badges (label/iconUrl in `context`). */
  context: Record<string, unknown> | null;
}

/**
 * Read another user's *public* badges from the `user_badges_public` view.
 * Takes the caller's Supabase client so the read runs in the page's existing
 * auth context (the anon client on the ISR-cached player page) — the view is
 * granted to anon + authenticated and already hides opted-out badges and
 * soft-deleted accounts.
 */
export async function loadPublicBadges(client: ReadClient, userId: string): Promise<PublicBadge[]> {
  const { data, error } = await client
    .from('user_badges_public')
    .select('badge_key, source, awarded_at, context')
    .eq('user_id', userId)
    .order('awarded_at', { ascending: true });
  if (error) return [];
  return (
    (data as
      | {
          badge_key: string;
          source: string;
          awarded_at: string;
          context: Record<string, unknown> | null;
        }[]
      | null) ?? []
  ).map((r) => ({
    badgeKey: r.badge_key,
    source: r.source,
    awardedAt: r.awarded_at,
    context: r.context,
  }));
}
