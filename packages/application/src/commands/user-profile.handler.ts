import { NotFoundError, UserId, UserProfile, type UserRepository } from '@pickupvb/domain';
import {
  AddFriendCommand,
  ChangeHandleCommand,
  RemoveFriendCommand,
  SetProfileHeroImageCommand,
  SetProfileThemeCommand,
  UpdateBusinessInfoCommand,
  UpdateProfileCommand,
} from '../messages';

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

/** Persist the user's cross-device theme preference (ADR 0020). */
export class SetProfileThemeHandler {
  constructor(private readonly repo: UserRepository) {}

  async execute({ userId, theme }: SetProfileThemeCommand): Promise<void> {
    const profile = await this.repo.findById(UserId(userId));
    if (!profile) throw new NotFoundError('profile', userId);
    profile.setTheme(theme);
    await this.repo.save(profile);
  }
}

/** Set or clear the profile hero/banner image URL (ADR 0020). */
export class SetProfileHeroImageHandler {
  constructor(private readonly repo: UserRepository) {}

  async execute({ userId, url }: SetProfileHeroImageCommand): Promise<void> {
    const profile = await this.repo.findById(UserId(userId));
    if (!profile) throw new NotFoundError('profile', userId);
    profile.setHeroImage(url);
    await this.repo.save(profile);
  }
}

/** Update the buyer-side business/receipt fields (ADR 0020). */
export class UpdateBusinessInfoHandler {
  constructor(private readonly repo: UserRepository) {}

  async execute({ userId, info }: UpdateBusinessInfoCommand): Promise<void> {
    const profile = await this.repo.findById(UserId(userId));
    if (!profile) throw new NotFoundError('profile', userId);
    profile.setBusinessInfo(info);
    await this.repo.save(profile);
  }
}

/**
 * Add a directed friend/follow edge (ADR 0020 §5). Uses the aggregate's static
 * invariant guard + a focused edge write — no full aggregate load/save.
 */
export class AddFriendHandler {
  constructor(private readonly repo: UserRepository) {}

  async execute({ viewerId, friendId }: AddFriendCommand): Promise<void> {
    const viewer = UserId(viewerId);
    const friend = UserId(friendId);
    UserProfile.assertCanFriend(viewer, friend);
    await this.repo.addFriendEdge(viewer, friend);
  }
}

/** Remove a directed friend/follow edge (ADR 0020 §5). */
export class RemoveFriendHandler {
  constructor(private readonly repo: UserRepository) {}

  async execute({ viewerId, friendId }: RemoveFriendCommand): Promise<void> {
    await this.repo.removeFriendEdge(UserId(viewerId), UserId(friendId));
  }
}
