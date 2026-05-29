import { randomUUID } from 'node:crypto';
import { Group, GroupId, NotFoundError, UserId, type GroupRepository } from '@pickupvb/domain';
import {
  AddGroupMemberCommand,
  ChangeGroupMemberRoleCommand,
  CreateGroupCommand,
  FollowGroupCommand,
  RemoveGroupMemberCommand,
  UnfollowGroupCommand,
  UpdateGroupProfileCommand,
} from '../messages';

/**
 * Create a group (ADR 0021). The aggregate validates the name + slug; the
 * repository surfaces a slug-uniqueness collision as `ConflictError`, and the
 * DB trigger adds the founding-owner membership row.
 */
export class CreateGroupHandler {
  constructor(private readonly repo: GroupRepository) {}

  async execute({ createdBy, input }: CreateGroupCommand): Promise<{ id: string; slug: string }> {
    const group = Group.create({
      id: GroupId(randomUUID()),
      slug: input.slug,
      name: input.name,
      createdBy: UserId(createdBy),
      description: input.description,
      homeCity: input.homeCity,
      region: input.region,
      avatarUrl: input.avatarUrl,
    });
    await this.repo.add(group);
    return { id: group.id, slug: group.slug };
  }
}

/**
 * Edit a group's profile (ADR 0021). Returns the slug so the caller can
 * revalidate the public `/groups/{slug}` path.
 */
export class UpdateGroupProfileHandler {
  constructor(private readonly repo: GroupRepository) {}

  async execute({ groupId, edit }: UpdateGroupProfileCommand): Promise<{ slug: string }> {
    const group = await this.repo.findById(GroupId(groupId));
    if (!group) throw new NotFoundError('group', groupId);
    group.editProfile(edit);
    await this.repo.save(group);
    return { slug: group.slug };
  }
}

/**
 * Add a member to a group (ADR 0021). The aggregate enforces owner/admin
 * authorization; `saveMembers` persists the single new row.
 */
export class AddGroupMemberHandler {
  constructor(private readonly repo: GroupRepository) {}

  async execute({ groupId, actorId, userId, role }: AddGroupMemberCommand): Promise<void> {
    const group = await this.repo.findById(GroupId(groupId));
    if (!group) throw new NotFoundError('group', groupId);
    group.addMember(UserId(actorId), UserId(userId), role);
    await this.repo.saveMembers(group);
  }
}

/**
 * Remove a member (owner/admin, or self-leave). The aggregate refuses to remove
 * the last owner; `saveMembers` deletes the single row.
 */
export class RemoveGroupMemberHandler {
  constructor(private readonly repo: GroupRepository) {}

  async execute({ groupId, actorId, userId }: RemoveGroupMemberCommand): Promise<void> {
    const group = await this.repo.findById(GroupId(groupId));
    if (!group) throw new NotFoundError('group', groupId);
    group.removeMember(UserId(actorId), UserId(userId));
    await this.repo.saveMembers(group);
  }
}

/**
 * Change a member's role (owner/admin). The aggregate refuses to demote the
 * last owner; `saveMembers` updates the single row.
 */
export class ChangeGroupMemberRoleHandler {
  constructor(private readonly repo: GroupRepository) {}

  async execute({ groupId, actorId, userId, role }: ChangeGroupMemberRoleCommand): Promise<void> {
    const group = await this.repo.findById(GroupId(groupId));
    if (!group) throw new NotFoundError('group', groupId);
    group.changeMemberRole(UserId(actorId), UserId(userId), role);
    await this.repo.saveMembers(group);
  }
}

/**
 * Follow a group (ADR 0021). A follow is the viewer's own self-scoped edge with
 * no group-side invariant, so it's a focused edge write — no aggregate load.
 */
export class FollowGroupHandler {
  constructor(private readonly repo: GroupRepository) {}

  async execute({ groupId, userId }: FollowGroupCommand): Promise<void> {
    await this.repo.addFollowEdge(GroupId(groupId), UserId(userId));
  }
}

/** Unfollow a group (ADR 0021). Focused edge delete. */
export class UnfollowGroupHandler {
  constructor(private readonly repo: GroupRepository) {}

  async execute({ groupId, userId }: UnfollowGroupCommand): Promise<void> {
    await this.repo.removeFollowEdge(GroupId(groupId), UserId(userId));
  }
}
