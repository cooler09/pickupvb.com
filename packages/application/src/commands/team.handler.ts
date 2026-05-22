import { randomUUID } from 'node:crypto';
import {
  NotFoundError,
  Team,
  UnauthorizedError,
  type EventRepository,
  type Format,
  type TeamId,
  type TeamRepository,
  type UserId,
} from '@pickupvb/domain';
import {
  AcceptTeamInviteCommand,
  AddTeamMemberCommand,
  CreateTeamCommand,
  RegisterTeamCommand,
  RemoveTeamMemberCommand,
  SetTeamExtraMembersCommand,
  WithdrawTeamCommand,
} from '../messages';

export class CreateTeamHandler {
  constructor(private readonly repo: TeamRepository) {}

  async execute({ captainId, name, format }: CreateTeamCommand): Promise<{ id: string }> {
    const id = randomUUID() as never as TeamId;
    const team = Team.create({
      id,
      captainId: captainId as UserId,
      name,
      format: format as Format,
    });
    await this.repo.save(team);
    return { id: String(team.id) };
  }
}

export class AddTeamMemberHandler {
  constructor(private readonly repo: TeamRepository) {}

  async execute({ teamId, userId, requesterId, autoAccept }: AddTeamMemberCommand): Promise<void> {
    const team = await this.repo.findById(teamId as TeamId);
    if (!team) throw new NotFoundError('team', teamId);
    if (String(team.captainId) !== requesterId) {
      throw new UnauthorizedError('Only the team captain can manage the roster.');
    }
    team.inviteMember(userId as UserId, autoAccept);
    await this.repo.save(team);
  }
}

/**
 * Invitee accepts a pending invite. Only the invitee themselves can accept
 * (no captain-acts-on-behalf-of); the wrapping server action wires the
 * authenticated viewer's id into `userId` so this is automatic.
 */
export class AcceptTeamInviteHandler {
  constructor(private readonly repo: TeamRepository) {}

  async execute({ teamId, userId }: AcceptTeamInviteCommand): Promise<void> {
    const team = await this.repo.findById(teamId as TeamId);
    if (!team) throw new NotFoundError('team', teamId);
    team.acceptInvite(userId as UserId);
    await this.repo.save(team);
  }
}

export class RemoveTeamMemberHandler {
  constructor(private readonly repo: TeamRepository) {}

  async execute({ teamId, userId, requesterId }: RemoveTeamMemberCommand): Promise<void> {
    const team = await this.repo.findById(teamId as TeamId);
    if (!team) throw new NotFoundError('team', teamId);
    const isCaptain = String(team.captainId) === requesterId;
    const isSelf = userId === requesterId;
    // Captains can remove anyone; players can always remove themselves
    // (covers "leave team" and "decline invite").
    if (!isCaptain && !isSelf) {
      throw new UnauthorizedError('Only the team captain can manage the roster.');
    }
    team.removeMember(userId as UserId);
    await this.repo.save(team);
  }
}

/**
 * Captain updates the count of off-site players (people on the team but not
 * on the site). Counts toward the roster cap.
 */
export class SetTeamExtraMembersHandler {
  constructor(private readonly repo: TeamRepository) {}

  async execute({
    teamId,
    extraMemberCount,
    requesterId,
  }: SetTeamExtraMembersCommand): Promise<void> {
    const team = await this.repo.findById(teamId as TeamId);
    if (!team) throw new NotFoundError('team', teamId);
    if (String(team.captainId) !== requesterId) {
      throw new UnauthorizedError('Only the team captain can manage the roster.');
    }
    team.setExtraMemberCount(extraMemberCount);
    await this.repo.save(team);
  }
}

/**
 * Tournament team registration. Crosses two aggregates:
 *   - the Team must exist and be captained by the requester
 *   - the Team's format must match the Event's format
 *   - the Event aggregate enforces the rest (must be tournament, published, …)
 *
 * Note: we run `event.registerTeam(...)` purely to execute the aggregate's
 * invariants (status / type / start-time / duplicate guards) but we do
 * **not** call `events.save(event)`. The aggregate's `_teams` set carries
 * only team ids and has no slot for the captain-chosen `divisionId`, which
 * is NOT NULL on `event_teams`. We persist the join row via the dedicated
 * `attachTeamToDivision` port instead. The aggregate's in-memory mutation
 * is discarded; the next `findById` rehydrates `_teams` from the DB.
 */
export class RegisterTeamHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly teams: TeamRepository,
  ) {}

  async execute({ eventId, teamId, requesterId, divisionId }: RegisterTeamCommand): Promise<void> {
    const team = await this.teams.findById(teamId as TeamId);
    if (!team) throw new NotFoundError('team', teamId);
    if (String(team.captainId) !== requesterId) {
      throw new UnauthorizedError('Only the team captain can register the team.');
    }
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    if (event.format && event.format !== team.format) {
      throw new UnauthorizedError(
        `Team format (${team.format}) doesn't match event format (${event.format}).`,
      );
    }
    const division = event.divisions.find((d) => String(d.id) === divisionId);
    if (!division) throw new NotFoundError('division', divisionId);
    if (division.format && division.format !== team.format) {
      throw new UnauthorizedError(
        `Team format (${team.format}) doesn't match division format (${division.format}).`,
      );
    }
    // Run aggregate invariants (status / start-time / duplicate guard).
    event.registerTeam(team.id);
    event.pullEvents();
    await this.events.attachTeamToDivision(eventId, String(team.id), divisionId);
  }
}

export class WithdrawTeamHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly teams: TeamRepository,
  ) {}

  async execute({ eventId, teamId, requesterId }: WithdrawTeamCommand): Promise<void> {
    const team = await this.teams.findById(teamId as TeamId);
    if (!team) throw new NotFoundError('team', teamId);
    if (String(team.captainId) !== requesterId) {
      throw new UnauthorizedError('Only the team captain can withdraw the team.');
    }
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.withdrawTeam(team.id);
    await this.events.save(event);
  }
}
