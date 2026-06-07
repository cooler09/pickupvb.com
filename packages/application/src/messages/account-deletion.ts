// ─── Account deletion (ADR 0029) ─────────────────────────────────────────

export class RequestAccountDeletionCommand {
  constructor(
    public readonly userId: string,
    /** Optional free-text reason the user gives for leaving. */
    public readonly reason: string | null = null,
  ) {}
}

export class CancelAccountDeletionCommand {
  constructor(public readonly userId: string) {}
}
