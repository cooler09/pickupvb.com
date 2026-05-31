import {
  EventType,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  type EventMembershipStore,
  type EventWriteStore,
} from '@pickupvb/domain';

/**
 * League roster management. The minimal surface today is the
 * forfeit toggle on a rostered team — letting a host mark a team as
 * withdrawn mid-season (and reinstate them if it was a mistake). The
 * column already exists on `event_team_entries` (migration
 * 20260805000000); this handler is the application-layer plumbing for
 * the host-facing UI.
 *
 * Authorization mirrors the league-schedule handlers: explicit host
 * check at the boundary (no co-host port yet) + RLS backstop at the
 * `event_team_entries` write.
 */

export class SetLeagueTeamForfeitedCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    public readonly teamId: string,
    public readonly requesterId: string,
    /** `true` marks forfeited at `new Date()`; `false` clears the flag. */
    public readonly forfeited: boolean,
  ) {}
}

export class SetLeagueTeamForfeitedHandler {
  constructor(private readonly events: EventWriteStore & EventMembershipStore) {}

  async execute(cmd: SetLeagueTeamForfeitedCommand): Promise<void> {
    const evt = await this.events.findById(cmd.eventId);
    if (!evt) throw new NotFoundError('event', cmd.eventId);
    if (String(evt.hostId) !== cmd.requesterId) {
      throw new UnauthorizedError('Only the event host can forfeit a league team.');
    }
    if (evt.type !== EventType.League) {
      throw new ValidationError('Forfeit only applies to league events.', {
        eventType: evt.type,
        eventId: String(evt.id),
      });
    }
    const division = evt.divisions.find((d) => String(d.id) === cmd.divisionId);
    if (!division) throw new NotFoundError('division', cmd.divisionId);

    await this.events.setRosterTeamForfeited(
      cmd.divisionId,
      cmd.teamId,
      cmd.forfeited ? new Date() : null,
    );
  }
}
