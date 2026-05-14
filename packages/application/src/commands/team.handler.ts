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
    AddTeamMemberCommand,
    CreateTeamCommand,
    RegisterTeamCommand,
    RemoveTeamMemberCommand,
    WithdrawTeamCommand,
} from '../messages';

export class CreateTeamHandler {
    constructor(private readonly repo: TeamRepository) { }

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
    constructor(private readonly repo: TeamRepository) { }

    async execute({ teamId, userId, requesterId }: AddTeamMemberCommand): Promise<void> {
        const team = await this.repo.findById(teamId as TeamId);
        if (!team) throw new NotFoundError('team', teamId);
        if (String(team.captainId) !== requesterId) {
            throw new UnauthorizedError('Only the team captain can manage the roster.');
        }
        team.addMember(userId as UserId);
        await this.repo.save(team);
    }
}

export class RemoveTeamMemberHandler {
    constructor(private readonly repo: TeamRepository) { }

    async execute({ teamId, userId, requesterId }: RemoveTeamMemberCommand): Promise<void> {
        const team = await this.repo.findById(teamId as TeamId);
        if (!team) throw new NotFoundError('team', teamId);
        if (String(team.captainId) !== requesterId) {
            throw new UnauthorizedError('Only the team captain can manage the roster.');
        }
        team.removeMember(userId as UserId);
        await this.repo.save(team);
    }
}

/**
 * Tournament team registration. Crosses two aggregates:
 *   - the Team must exist and be captained by the requester
 *   - the Team's format must match the Event's format
 *   - the Event aggregate enforces the rest (must be tournament, published, …)
 */
export class RegisterTeamHandler {
    constructor(
        private readonly events: EventRepository,
        private readonly teams: TeamRepository,
    ) { }

    async execute({ eventId, teamId, requesterId }: RegisterTeamCommand): Promise<void> {
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
        event.registerTeam(team.id);
        await this.events.save(event);
    }
}

export class WithdrawTeamHandler {
    constructor(
        private readonly events: EventRepository,
        private readonly teams: TeamRepository,
    ) { }

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
