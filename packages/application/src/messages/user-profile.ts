import type {
  ProfileBusinessInfo,
  ProfileDetailsEdit,
  StoredThemePreference,
} from '@pickupvb/domain';

// ---- User profile commands (ADR 0020) -----------------------------------
export class UpdateProfileCommand {
  constructor(
    public readonly userId: string,
    /** Already-normalized editable fields (trimming / handle normalization
     * happen at the web boundary). The handler defends invariants. */
    public readonly details: ProfileDetailsEdit,
  ) {}
}

export class ChangeHandleCommand {
  constructor(
    public readonly userId: string,
    /** Already lower-cased / trimmed; the aggregate validates the shape and
     * the DB unique constraint surfaces as `ConflictError` on save. */
    public readonly handle: string,
  ) {}
}

export class SetProfileThemeCommand {
  constructor(
    public readonly userId: string,
    /** `'system'` is a device-only cookie choice and never reaches here. */
    public readonly theme: StoredThemePreference,
  ) {}
}

export class SetProfileHeroImageCommand {
  constructor(
    public readonly userId: string,
    /** Storage URL, or `null` to clear the hero image. */
    public readonly url: string | null,
  ) {}
}

export class SetProfileAvatarCommand {
  constructor(
    public readonly userId: string,
    /** Storage URL, or `null` to clear the avatar (profile picture). */
    public readonly url: string | null,
  ) {}
}

export class UpdateBusinessInfoCommand {
  constructor(
    public readonly userId: string,
    public readonly info: ProfileBusinessInfo,
  ) {}
}

export class AddFriendCommand {
  constructor(
    public readonly viewerId: string,
    public readonly friendId: string,
  ) {}
}

export class RemoveFriendCommand {
  constructor(
    public readonly viewerId: string,
    public readonly friendId: string,
  ) {}
}
