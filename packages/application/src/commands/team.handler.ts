import { randomUUID } from 'node:crypto';
import {
  DivisionId,
  NotFoundError,
  Team,
  TeamId,
  UnauthorizedError,
  type AnalyticsPort,
  type EventWriteStore,
  type TeamRepository,
  type UserId,
} from '@pickupvb/domain';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import {
  AcceptTeamInviteCommand,
  AddTeamMemberCommand,
  CreateTeamCommand,
  RegisterTeamCommand,
  RemoveTeamMemberCommand,
  SetTeamExtraMembersCommand,
  WithdrawTeamCommand,
} from '../messages/index';

export class CreateTeamHandler {
  constructor(private readonly repo: TeamRepository) {}

  async execute({ captainId, name }: CreateTeamCommand): Promise<{ id: string }> {
    const id = TeamId(randomUUID());
    const team = Team.create({
      id,
      captainId: captainId as UserId,
      name,
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
 * Tournament / league team registration. Crosses two aggregates:
 *   - the Team must exist and be captained by the requester
 *   - the chosen Division must exist on the event
 *   - the Event aggregate enforces the rest (must be tournament/league,
 *     published, not started, no duplicate)
 *
 * Teams are just a roster of people (ADR 0013) — they carry no format at all,
 * so a team can enter a division of any format regardless of its size. There is
 * deliberately no team-format vs. division-format check; format lives on the
 * division, not the roster.
 *
 * The aggregate owns the team↔division registration (ADR 0019):
 * `registerTeam(teamId, divisionId)` records which division the team joined
 * and re-checks that the division exists, so `events.save(event)` persists
 * the join in a single write path — no aggregate-sidestepping port.
 */
export class RegisterTeamHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly teams: TeamRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, teamId, requesterId, divisionId }: RegisterTeamCommand): Promise<void> {
    const team = await this.teams.findById(teamId as TeamId);
    if (!team) throw new NotFoundError('team', teamId);
    if (String(team.captainId) !== requesterId) {
      throw new UnauthorizedError('Only the team captain can register the team.');
    }
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    const division = event.divisions.find((d) => String(d.id) === divisionId);
    if (!division) throw new NotFoundError('division', divisionId);
    // No team-format vs. division-format check (ADR 0013): any roster may
    // enter any division regardless of format or size.
    // Aggregate invariants (status / start-time / division-exists / duplicate)
    // run inside registerTeam; save() persists the team↔division join.
    event.registerTeam(team.id, DivisionId(divisionId));
    await this.events.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}

export class WithdrawTeamHandler {
  constructor(
    private readonly events: EventWriteStore,
    private readonly teams: TeamRepository,
    private readonly analytics?: AnalyticsPort,
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
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}
