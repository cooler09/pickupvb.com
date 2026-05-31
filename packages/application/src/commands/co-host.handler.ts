import type { EventMembershipStore } from '@pickupvb/domain';
import { ValidationError } from '@pickupvb/domain';
import { AddEventCoHostCommand, RemoveEventCoHostCommand } from '../messages.js';

/**
 * Authorization for co-host changes lives at the DB layer (RLS on
 * `event_co_hosts`): only the event host or owner/admin of the host group
 * can insert/delete. We intentionally don't duplicate that check here — the
 * repo will throw with a Postgres permission error if the requester isn't
 * authorized, which surfaces as a generic failure to the UI.
 *
 * `requesterId` is still passed through to populate `event_co_hosts.added_by`
 * for audit purposes.
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
