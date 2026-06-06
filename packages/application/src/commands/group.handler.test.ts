import { describe, it, expect } from 'vitest';
import {
  ConflictError,
  Group,
  type GroupId,
  type GroupRepository,
  type UserId,
} from '@pickupvb/domain';
import { CreateGroupHandler } from './group.handler.js';
import { CreateGroupCommand } from '../messages/index.js';

const FOUNDER = 'founder-1' as UserId;

/** Records the calls the handler makes; every method is a no-op by default. */
class FakeGroupRepo implements GroupRepository {
  readonly follows: Array<{ groupId: GroupId; userId: UserId }> = [];
  addFollowEdgeImpl: (groupId: GroupId, userId: UserId) => Promise<void> = () => Promise.resolve();

  findById = (): Promise<Group | null> => Promise.resolve(null);
  add = (): Promise<void> => Promise.resolve();
  save = (): Promise<void> => Promise.resolve();
  saveMembers = (): Promise<void> => Promise.resolve();
  removeFollowEdge = (): Promise<void> => Promise.resolve();

  async addFollowEdge(groupId: GroupId, userId: UserId): Promise<void> {
    this.follows.push({ groupId, userId });
    await this.addFollowEdgeImpl(groupId, userId);
  }
}

function createCmd() {
  return new CreateGroupCommand(FOUNDER, {
    slug: 'spikers',
    name: 'Spikers',
    description: '',
    homeCity: null,
    region: null,
  });
}

describe('CreateGroupHandler', () => {
  it('auto-follows the founder onto the new group', async () => {
    const repo = new FakeGroupRepo();
    const { id } = await new CreateGroupHandler(repo).execute(createCmd());

    expect(repo.follows).toEqual([{ groupId: id, userId: FOUNDER }]);
  });

  it('still creates the group when the follow-edge write fails (best-effort)', async () => {
    const repo = new FakeGroupRepo();
    repo.addFollowEdgeImpl = () => Promise.reject(new Error('group_followers write failed'));

    const res = await new CreateGroupHandler(repo).execute(createCmd());

    expect(res.slug).toBe('spikers');
  });

  it('propagates a slug-collision ConflictError from add()', async () => {
    const repo = new FakeGroupRepo();
    repo.add = () => Promise.reject(new ConflictError('That slug is taken — pick another.'));

    await expect(new CreateGroupHandler(repo).execute(createCmd())).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
