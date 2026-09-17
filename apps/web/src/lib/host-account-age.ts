import 'server-only';

import { getAdminSupabase } from '@/lib/supabase-admin';
import { log } from '@/lib/log';
import { isNewHostAccount } from '@/lib/new-host-policy';

/**
 * "Is this host account still unproven?" — the shared lookup behind both the
 * per-event exposure caps (`new-host-limits.ts`) and the fraud signals
 * (`fraud-signals.ts`).
 *
 * It lives in its own module specifically so those two can both use it without
 * importing each other: `new-host-limits` raises a signal when a cap trips, and
 * `fraud-signals` needs the same age test to avoid alerting on established
 * hosts. Putting the lookup in either one creates a cycle.
 *
 * Reads on the **admin client** deliberately. This is a platform risk control
 * about a *third party* (the host), not an authorization decision about the
 * caller — and base `profiles` is owner-only under RLS, so a session-scoped read
 * would return null for every viewer and mark every host unproven.
 *
 * **Fails closed:** any lookup failure returns `true` (unproven). Capping or
 * over-alerting on an established host is cheap; waving through an account whose
 * age we cannot establish is the 2026-09 incident.
 */
export async function isUnprovenHost(hostId: string, now: Date = new Date()): Promise<boolean> {
  let createdAt: string | null = null;
  try {
    const admin = getAdminSupabase();
    const { data } = await admin
      .from('profiles')
      .select('created_at')
      .eq('id', hostId)
      .maybeSingle();
    createdAt = (data as { created_at: string } | null)?.created_at ?? null;
  } catch (err) {
    log.warn('[host-account-age] lookup failed; treating host as unproven', {
      hostId,
      err: String(err),
    });
  }
  return isNewHostAccount(createdAt, now);
}
