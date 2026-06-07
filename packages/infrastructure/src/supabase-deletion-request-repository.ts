import {
  ConflictError,
  DeletionRequest,
  DeletionRequestId,
  UserId,
  type DeletionRequestRepository,
  type DeletionStatus,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const UNIQUE_VIOLATION = '23505';

type Row = {
  id: string;
  user_id: string;
  status: string;
  reason: string | null;
  requested_at: string;
  scheduled_for: string;
  resolved_at: string | null;
};

function rowToAggregate(row: Row): DeletionRequest {
  return DeletionRequest.fromPersistence({
    id: DeletionRequestId(row.id),
    userId: UserId(row.user_id),
    status: row.status as DeletionStatus,
    reason: row.reason,
    requestedAt: new Date(row.requested_at),
    scheduledFor: new Date(row.scheduled_for),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  });
}

/**
 * Deletion-request adapter (ADR 0029). Built per request:
 * - the user-driven handlers (`request` / `cancel`) get a **user-scoped** client
 *   so the `deletion_requests` RLS (`auth.uid() = user_id`) is the real gate;
 * - the cron gets the **admin** client for the cross-user
 *   `findDueForExecution` + the scheduled→executed flip (RLS-bypassed).
 *
 * `save` is a full-row upsert keyed on `id`, so it serves both the initial
 * INSERT (arm) and the state transitions (cancel / execute). A
 * partial-unique-index race (two arms at once) surfaces as `ConflictError`.
 */
export class SupabaseDeletionRequestRepository implements DeletionRequestRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findActiveByUser(userId: UserId): Promise<DeletionRequest | null> {
    const { data, error } = await this.client
      .from('deletion_requests')
      .select('id, user_id, status, reason, requested_at, scheduled_for, resolved_at')
      .eq('user_id', String(userId))
      .eq('status', 'scheduled')
      .maybeSingle();
    if (error) throw new Error(`DeletionRequest.findActiveByUser failed: ${error.message}`);
    return data ? rowToAggregate(data as Row) : null;
  }

  async save(request: DeletionRequest): Promise<void> {
    const { error } = await this.client.from('deletion_requests').upsert(
      {
        id: String(request.id),
        user_id: String(request.userId),
        status: request.status,
        reason: request.reason,
        requested_at: request.requestedAt.toISOString(),
        scheduled_for: request.scheduledFor.toISOString(),
        resolved_at: request.resolvedAt ? request.resolvedAt.toISOString() : null,
      },
      { onConflict: 'id' },
    );
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new ConflictError('Account deletion is already scheduled.');
      }
      throw new Error(`DeletionRequest.save(${request.id}) failed: ${error.message}`);
    }
  }

  async findDueForExecution(now: Date, limit: number): Promise<DeletionRequest[]> {
    const { data, error } = await this.client
      .from('deletion_requests')
      .select('id, user_id, status, reason, requested_at, scheduled_for, resolved_at')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`DeletionRequest.findDueForExecution failed: ${error.message}`);
    return ((data as Row[] | null) ?? []).map(rowToAggregate);
  }
}
