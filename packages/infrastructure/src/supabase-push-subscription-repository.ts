import type { PushSubscriptionPort, PushSubscriptionRecord } from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type SubRow = { user_id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Supabase adapter for `push_subscriptions` (ADR 0022). Runs on the service-role
 * client — the cron worker is session-less. Client-injected so the caller
 * constructs it with the admin client explicitly.
 */
export class SupabasePushSubscriptionRepository implements PushSubscriptionPort {
  constructor(private readonly admin: SupabaseClient) {}

  async listByUsers(
    userIds: ReadonlyArray<string>,
  ): Promise<Map<string, PushSubscriptionRecord[]>> {
    const out = new Map<string, PushSubscriptionRecord[]>();
    if (userIds.length === 0) return out;
    const { data, error } = await this.admin
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', userIds as string[]);
    if (error) throw new Error(`listByUsers failed: ${error.message}`);
    for (const row of (data as SubRow[] | null) ?? []) {
      const entry: PushSubscriptionRecord = {
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      };
      const existing = out.get(row.user_id);
      if (existing) existing.push(entry);
      else out.set(row.user_id, [entry]);
    }
    return out;
  }

  async deleteByEndpoints(endpoints: ReadonlyArray<string>): Promise<void> {
    if (endpoints.length === 0) return;
    const { error } = await this.admin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', endpoints as string[]);
    if (error) throw new Error(`deleteByEndpoints failed: ${error.message}`);
  }
}
