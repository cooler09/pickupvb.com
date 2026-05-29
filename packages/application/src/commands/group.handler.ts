import { randomUUID } from 'node:crypto';
import { Group, GroupId, NotFoundError, UserId, type GroupRepository } from '@pickupvb/domain';
import { CreateGroupCommand, UpdateGroupProfileCommand } from '../messages';

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
