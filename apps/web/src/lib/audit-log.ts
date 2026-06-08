import type { Json } from '@pickupvb/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { log } from '@/lib/log';

/**
 * Append a security-relevant administrative action to `public.audit_log`
 * (security audit P3 #8 — group member add/remove/role, event co-host
 * add/remove, Stripe Connect account mirrors, host-subscription state changes).
 *
 * Service-role insert: `audit_log` is RLS-on with no policies, so only the admin
 * client may write — an audit trail users could forge is worthless. **Fail-quiet
 * by contract**: a logging failure must never block or fail the operation it
 * records, so every error is swallowed (and logged at warn). Call it *after* the
 * underlying mutation has succeeded so the trail only records real changes.
 */

export type AuditAction =
  | 'group_member.added'
  | 'group_member.removed'
  | 'group_member.role_changed'
  | 'event.co_host_added'
  | 'event.co_host_removed'
  | 'host_stripe.account_updated'
  | 'host_subscription.changed'
  | 'host_membership.changed';

export type AuditEntityType =
  | 'group'
  | 'event'
  | 'host_stripe_account'
  | 'host_subscription'
  | 'host_membership';

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  /** Affected entity id — a uuid (group/event) or a Stripe id (acct_…/sub_…). */
  entityId: string;
  /** Who performed the action; null for system / webhook-driven changes. */
  actorUserId?: string | null;
  /** Who was affected (member, co-host, host); null when not applicable. */
  targetUserId?: string | null;
  metadata?: Record<string, Json>;
}

export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    const admin = getAdminSupabase();
    const { error } = await admin.from('audit_log').insert({
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      actor_user_id: entry.actorUserId ?? null,
      target_user_id: entry.targetUserId ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      await log.warn('[audit] insert failed', { action: entry.action, error: error.message });
    }
  } catch (err) {
    await log.warn('[audit] insert threw', {
      action: entry.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
