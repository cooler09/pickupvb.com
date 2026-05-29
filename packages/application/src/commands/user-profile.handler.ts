import { NotFoundError, UserId, type UserRepository } from '@pickupvb/domain';
import { ChangeHandleCommand, UpdateProfileCommand } from '../messages';

/**
 * Apply an edit from the profile form (ADR 0020). Loads the `UserProfile`
 * aggregate, mutates it, and persists via `UserRepository.save`.
 */
export class UpdateProfileHandler {
  constructor(private readonly repo: UserRepository) {}

  async execute({ userId, details }: UpdateProfileCommand): Promise<void> {
    const profile = await this.repo.findById(UserId(userId));
    if (!profile) throw new NotFoundError('profile', userId);
    profile.editDetails(details);
    await this.repo.save(profile);
  }
}

/**
 * Change the user's public handle. The aggregate validates the format; the DB
 * unique constraint is mapped to `ConflictError` by the repository's `save`.
 */
export class ChangeHandleHandler {
  constructor(private readonly repo: UserRepository) {}

  async execute({ userId, handle }: ChangeHandleCommand): Promise<void> {
    const profile = await this.repo.findById(UserId(userId));
    if (!profile) throw new NotFoundError('profile', userId);
    profile.changeHandle(handle);
    await this.repo.save(profile);
  }
}
