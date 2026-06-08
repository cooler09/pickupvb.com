import type { EmailSuppressionPort, EmailSuppressionReason } from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Supabase adapter for the email suppression sink (audit P2 #3).
 *
 * Service-role only — the Resend webhook (writer) and the outbox worker (reader)
 * are both session-less, and the table has no client-facing RLS policy.
 * Addresses are lowercased on both sides so the membership test is
 * case-insensitive.
 */
export class SupabaseEmailSuppressionRepository implements EmailSuppressionPort {
  constructor(private readonly admin: SupabaseClient) {}

  async listSuppressed(addresses: string[]): Promise<string[]> {
    if (addresses.length === 0) return [];
    const lowered = [...new Set(addresses.map((a) => a.toLowerCase()))];
    const { data, error } = await this.admin
      .from('email_suppressions')
      .select('address')
      .in('address', lowered);
    if (error) throw new Error(`EmailSuppression.listSuppressed failed: ${error.message}`);
    return ((data as { address: string }[] | null) ?? []).map((r) => r.address);
  }

  async suppress(
    address: string,
    reason: EmailSuppressionReason,
    providerMessageId?: string,
  ): Promise<void> {
    const { error } = await this.admin.from('email_suppressions').upsert(
      {
        address: address.toLowerCase(),
        reason,
        last_event_at: new Date().toISOString(),
        ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
      },
      { onConflict: 'address' },
    );
    if (error) throw new Error(`EmailSuppression.suppress failed: ${error.message}`);
  }
}
