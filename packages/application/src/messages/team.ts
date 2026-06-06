// ---- Team commands -------------------------------------------------------
export class CreateTeamCommand {
  constructor(
    public readonly captainId: string,
    public readonly name: string,
  ) {}
}

export class AddTeamMemberCommand {
  constructor(
    public readonly teamId: string,
    public readonly userId: string,
    public readonly requesterId: string,
    /**
     * When true the new member is added as `active` immediately
     * (the invitee opted into auto-accept on their profile). When false
     * the slot is created as `pending` and the invitee must accept.
     */
    public readonly autoAccept: boolean,
  ) {}
}

export class AcceptTeamInviteCommand {
  constructor(
    public readonly teamId: string,
    /** Must equal the authenticated viewer; the handler enforces this. */
    public readonly userId: string,
  ) {}
}

export class RemoveTeamMemberCommand {
  constructor(
    public readonly teamId: string,
    public readonly userId: string,
    public readonly requesterId: string,
  ) {}
}

export class SetTeamExtraMembersCommand {
  constructor(
    public readonly teamId: string,
    /** Off-site player count. Must be a non-negative integer. */
    public readonly extraMemberCount: number,
    public readonly requesterId: string,
  ) {}
}

export class RegisterTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly teamId: string,
    public readonly requesterId: string,
    /**
     * Division the captain is registering the team into. Required because
     * `event_teams.division_id` is NOT NULL and multi-division events need
     * the captain's choice (the `fill_default_division_id` trigger only
     * covers single-division events).
     */
    public readonly divisionId: string,
  ) {}
}

export class WithdrawTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly teamId: string,
    public readonly requesterId: string,
  ) {}
}

// ---- Ad-hoc team registration (ADR 0007) --------------------------------
/** Input for a single roster slot when (un)registering an ad-hoc team. */
export interface AdHocRegistrationMemberInput {
  /** Linked account, when the player exists on-platform. */
  userId?: string | null;
  /** Free-text display name, used when the player has no account. */
  displayName?: string | null;
  /** Optional contact email for off-platform players. */
  email?: string | null;
}

export class RegisterAdHocTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    /** Caller; becomes the registration's captain. */
    public readonly captainId: string,
    public readonly name: string,
    public readonly members: ReadonlyArray<AdHocRegistrationMemberInput>,
    /**
     * When true, treat the caller as the event host acting on behalf of
     * a walk-in team and bypass the "one team per captain per division"
     * uniqueness check. The handler still verifies the caller actually
     * is the host before honoring the flag — clients can't bypass the
     * check by lying.
     */
    public readonly actingAsHost: boolean = false,
  ) {}
}

export class RenameAdHocTeamRegistrationCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly name: string,
  ) {}
}

export class AddAdHocTeamMemberCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly member: AdHocRegistrationMemberInput,
  ) {}
}

export class RemoveAdHocTeamMemberCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly memberId: string,
  ) {}
}

export class WithdrawAdHocTeamRegistrationCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
  ) {}
}

// ---- Walk-in team registration (ADR 0017) -------------------------------
/**
 * Host adds an account-less team for someone without a captain account.
 * Allowed on ad-hoc (tournament) or roster (league) divisions — ADR 0033.
 * No `captain_id` is recorded; the captain's identity lives in the freeform
 * `captainDisplayName` / `captainPhone` fields.
 */
export class RegisterWalkInTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    /**
     * The event's host (validated against `events.host_id`). The viewer's
     * permission to act is authorized at the action boundary via `canManage`,
     * so a co-host passes this as the event's host id rather than their own
     * (ADR 0033).
     */
    public readonly hostId: string,
    public readonly name: string,
    public readonly captainDisplayName: string,
    public readonly captainPhone: string | null,
    public readonly members: ReadonlyArray<AdHocRegistrationMemberInput>,
  ) {}
}

/**
 * Host marks a walk-in registration paid in cash / Venmo / off-platform.
 * Refuses to touch captain or host-proxy rows (they have a real captain
 * account and a Stripe path or the existing `hostMarkTeamRegistrationPaid`
 * flow). Optional `note` captures reconciliation context.
 */
export class MarkWalkInPaidCashCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly note: string | null,
  ) {}
}
