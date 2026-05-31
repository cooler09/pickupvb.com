import type { BroadcastInput, BroadcastPort } from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Supabase adapter for the `broadcasts` table (ADR 0022). Client-injected: the
 * caller constructs it with the viewer's session client for RLS-enforced
 * reads/inserts (`create` / `findSender`) and with the service-role client for
 * the RLS-bypass admin ops (`markSent` / `softDelete`) — see the port doc.
 */
export class SupabaseBroadcastRepository implements BroadcastPort {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: BroadcastInput): Promise<{ id: string }> {
    const { data, error } = await this.client
      .from('broadcasts')
      .insert({
        sender_id: input.senderId,
        audience_type: input.audienceType,
        audience_id: input.audienceId,
        subject: input.subject,
        body: input.body,
        channels: input.channels,
      } as never)
      .select('id')
      .single();
    if (error) throw new Error(`Broadcast.create failed: ${error.message}`);
    return { id: (data as { id: string }).id };
  }

  async markSent(id: string): Promise<void> {
    const { error } = await this.client
      .from('broadcasts')
      .update({ sent_at: new Date().toISOString() } as never)
      .eq('id', id);
    if (error) throw new Error(`Broadcast.markSent failed: ${error.message}`);
  }

  async findSender(id: string): Promise<{ id: string; senderId: string } | null> {
    const { data, error } = await this.client
      .from('broadcasts')
      .select('id, sender_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Broadcast.findSender failed: ${error.message}`);
    if (!data) return null;
    const row = data as { id: string; sender_id: string };
    return { id: row.id, senderId: row.sender_id };
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await this.client
      .from('broadcasts')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', id);
    if (error) throw new Error(`Broadcast.softDelete failed: ${error.message}`);
  }
}
