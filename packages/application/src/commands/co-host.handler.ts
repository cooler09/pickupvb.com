import type { EventMembershipStore } from '@pickupvb/domain';
import { ValidationError } from '@pickupvb/domain';
import { AddEventCoHostCommand, RemoveEventCoHostCommand } from '../messages/index.js';

/**
 * Authorization is enforced at the server-action boundary
 * (`assertCanManage` in co-host-actions.ts), NOT here: the shared
 * `SupabaseEventRepository` these handlers write through runs on the
 * service-role admin client, so the `event_co_hosts` RLS policies never fire
 * (AGENTS.md pitfall #8 — admin client bypasses RLS). Do not re-delegate
 * authorization to RLS from this layer. (Security audit P1 #12.)
 *
 * `requesterId` is passed through to populate `event_co_hosts.added_by`.
 */
export class AddEventCoHostHandler {
  constructor(private readonly repo: EventMembershipStore) {}

  async execute({ eventId, party, requesterId }: AddEventCoHostCommand): Promise<void> {
    if (!party.userId && !party.groupId) {
      throw new ValidationError('Co-host party must specify either userId or groupId.');
    }
    await this.repo.addCoHost(eventId, party, requesterId);
  }
}

export class RemoveEventCoHostHandler {
  constructor(private readonly repo: EventMembershipStore) {}

  async execute({ eventId, party }: RemoveEventCoHostCommand): Promise<void> {
    await this.repo.removeCoHost(eventId, party);
  }
}
