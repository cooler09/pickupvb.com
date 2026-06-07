import type { GroupProfileEdit, GroupRole } from '@pickupvb/domain';

// ---- Group commands (ADR 0021) ------------------------------------------
export interface CreateGroupInput extends GroupProfileEdit {
  slug: string;
}

export class CreateGroupCommand {
  constructor(
    public readonly createdBy: string,
    public readonly input: CreateGroupInput,
  ) {}
}

export class UpdateGroupProfileCommand {
  constructor(
    public readonly groupId: string,
    public readonly edit: GroupProfileEdit,
  ) {}
}

export class SetGroupAvatarCommand {
  constructor(
    public readonly groupId: string,
    /** Storage URL, or `null` to clear the group avatar (logo). */
    public readonly url: string | null,
  ) {}
}

export class AddGroupMemberCommand {
  constructor(
    public readonly groupId: string,
    /** The caller; must be an owner/admin of the group. */
    public readonly actorId: string,
    public readonly userId: string,
    public readonly role: GroupRole,
  ) {}
}

export class RemoveGroupMemberCommand {
  constructor(
    public readonly groupId: string,
    public readonly actorId: string,
    public readonly userId: string,
  ) {}
}

export class ChangeGroupMemberRoleCommand {
  constructor(
    public readonly groupId: string,
    public readonly actorId: string,
    public readonly userId: string,
    public readonly role: GroupRole,
  ) {}
}

export class FollowGroupCommand {
  constructor(
    public readonly groupId: string,
    public readonly userId: string,
  ) {}
}

export class UnfollowGroupCommand {
  constructor(
    public readonly groupId: string,
    public readonly userId: string,
  ) {}
}

export class DeleteGroupCommand {
  constructor(
    public readonly groupId: string,
    /** The caller; must be the group owner. */
    public readonly actorId: string,
  ) {}
}
