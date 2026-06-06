import type {
  PushSubscriptionPort,
  PushSubscriptionRecord,
  PushSubscriptionUpsert,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type SubRow = { user_id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Supabase adapter for `push_subscriptions` (ADR 0022). Client-injected: the
 * cron worker passes the service-role client (session-less read/prune); the
 * subscribe route passes the viewer's session client (RLS-scoped self
 * upsert/delete).
 */
export class SupabasePushSubscriptionRepository implements PushSubscriptionPort {
  constructor(private readonly client: SupabaseClient) {}

  async listByUsers(
    userIds: ReadonlyArray<string>,
  ): Promise<Map<string, PushSubscriptionRecord[]>> {
    const out = new Map<string, PushSubscriptionRecord[]>();
    if (userIds.length === 0) return out;
    const { data, error } = await this.client
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
    const { error } = await this.client
      .from('push_subscriptions')
      .delete()
      .in('endpoint', endpoints as string[]);
    if (error) throw new Error(`deleteByEndpoints failed: ${error.message}`);
  }

  async upsert(userId: string, sub: PushSubscriptionUpsert): Promise<void> {
    const { error } = await this.client.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent,
        last_used_at: new Date().toISOString(),
        failure_count: 0,
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw new Error(`upsert failed: ${error.message}`);
  }

  async removeForUser(userId: string, endpoint: string): Promise<void> {
    const { error } = await this.client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);
    if (error) throw new Error(`removeForUser failed: ${error.message}`);
  }
}
