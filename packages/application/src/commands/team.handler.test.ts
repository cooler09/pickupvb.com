import { describe, it, expect } from 'vitest';
import {
  AgeGroup,
  Capacity,
  Division,
  EventType,
  Format,
  Gender,
  Location,
  PriceUnit,
  SkillTier,
  Surface,
  TeamComposition,
  TeamRegistrationMode,
  Team,
  UnauthorizedError,
  NotFoundError,
  Visibility,
  VolleyballEvent,
  type DivisionId,
  type EventId,
  type EventRepository,
  type TeamId,
  type TeamRepository,
  type UserId,
} from '@pickupvb/domain';
import { RegisterTeamHandler } from './team.handler.js';

const LOCATION = Location.create({
  addressLine: '1 Main',
  city: 'LB',
  region: 'CA',
  postalCode: '90802',
  country: 'US',
  latitude: 33.77,
  longitude: -118.19,
});

function tomorrow(h = 0): Date {
  return new Date(Date.now() + (24 + h) * 60 * 60 * 1000);
}

function makeDivision(format: Format, id = 'div-1'): Division {
  return Division.create({
    id: id as DivisionId,
    sortOrder: 0,
    label: 'A',
    surface: Surface.Indoor,
    format,
    gender: Gender.Coed,
    skillTier: SkillTier.Intermediate,
    ageGroup: AgeGroup.Adult,
    teamComposition: TeamComposition.Team,
    teamSize: 6,
    capacity: Capacity.fixed(8),
    priceUnit: PriceUnit.PerTeam,
    // ADR 0016: tournament divisions with team composition need an explicit
    // team registration mode now that the setting lives per-division.
    teamRegistrationMode: TeamRegistrationMode.Roster,
  });
}

function makeTournament(opts: { divisions: Division[] }): VolleyballEvent {
  const evt = VolleyballEvent.create({
    id: 'event-1' as EventId,
    hostId: 'host' as UserId,
    title: 'Tourney',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    type: EventType.Tournament,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: tomorrow(),
    endsAt: tomorrow(2),
    capacity: Capacity.fixed(8),
    divisions: opts.divisions,
  });
  evt.publish();
  return evt;
}

class InMemoryTeamRepo implements TeamRepository {
  private store = new Map<string, Team>();
  saved: Team[] = [];

  put(t: Team) {
    this.store.set(String(t.id), t);
  }
  async findById(id: TeamId): Promise<Team | null> {
    return this.store.get(String(id)) ?? null;
  }
  async save(t: Team): Promise<void> {
    this.saved.push(t);
    this.store.set(String(t.id), t);
  }
}

class InMemoryEventRepo implements Pick<EventRepository, 'findById' | 'save'> {
  private store = new Map<string, VolleyballEvent>();
  saved: VolleyballEvent[] = [];

  put(evt: VolleyballEvent) {
    this.store.set(String(evt.id), evt);
  }
  async findById(id: string): Promise<VolleyballEvent | null> {
    return this.store.get(id) ?? null;
  }
  async save(evt: VolleyballEvent): Promise<void> {
    this.saved.push(evt);
    this.store.set(String(evt.id), evt);
  }
}

function makeTeam(opts: { id?: string; captainId?: string } = {}): Team {
  return Team.create({
    id: (opts.id ?? 'team-1') as TeamId,
    captainId: (opts.captainId ?? 'captain') as UserId,
    name: 'Bumpsetters',
  });
}

describe('RegisterTeamHandler', () => {
  it('registers the team into the chosen division and saves the aggregate', async () => {
    const team = makeTeam();
    const division = makeDivision(Format.Sixes);
    const event = makeTournament({ divisions: [division] });

    const teams = new InMemoryTeamRepo();
    teams.put(team);
    const events = new InMemoryEventRepo();
    events.put(event);

    const handler = new RegisterTeamHandler(events as unknown as EventRepository, teams);

    await handler.execute({
      eventId: 'event-1',
      teamId: 'team-1',
      requesterId: 'captain',
      divisionId: 'div-1',
    });

    // ADR 0019: the aggregate carries the team↔division join and is persisted
    // in one write path — no attach side-channel.
    expect(events.saved).toHaveLength(1);
    expect(events.saved[0]!.teamEntries).toContainEqual(['team-1', 'div-1']);
  });

  it('throws NotFoundError when the team does not exist', async () => {
    const events = new InMemoryEventRepo();
    const teams = new InMemoryTeamRepo();
    const handler = new RegisterTeamHandler(events as unknown as EventRepository, teams);

    await expect(
      handler.execute({
        eventId: 'event-1',
        teamId: 'missing',
        requesterId: 'captain',
        divisionId: 'div-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws UnauthorizedError when the requester is not the captain', async () => {
    const team = makeTeam({ captainId: 'captain' });
    const teams = new InMemoryTeamRepo();
    teams.put(team);
    const events = new InMemoryEventRepo();
    const handler = new RegisterTeamHandler(events as unknown as EventRepository, teams);

    await expect(
      handler.execute({
        eventId: 'event-1',
        teamId: 'team-1',
        requesterId: 'someone-else',
        divisionId: 'div-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const team = makeTeam();
    const teams = new InMemoryTeamRepo();
    teams.put(team);
    const events = new InMemoryEventRepo();
    const handler = new RegisterTeamHandler(events as unknown as EventRepository, teams);

    await expect(
      handler.execute({
        eventId: 'event-1',
        teamId: 'team-1',
        requesterId: 'captain',
        divisionId: 'div-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the chosen divisionId is not on the event', async () => {
    const team = makeTeam();
    const division = makeDivision(Format.Sixes);
    const event = makeTournament({ divisions: [division] });

    const teams = new InMemoryTeamRepo();
    teams.put(team);
    const events = new InMemoryEventRepo();
    events.put(event);

    const handler = new RegisterTeamHandler(events as unknown as EventRepository, teams);

    await expect(
      handler.execute({
        eventId: 'event-1',
        teamId: 'team-1',
        requesterId: 'captain',
        divisionId: 'div-missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  // ADR 0013: a team is just a roster of people and carries no format, so it
  // can register for a division of any format regardless of its size. This
  // path previously threw ValidationError on a format mismatch; with format
  // gone from the team there is nothing to mismatch — it must register cleanly.
  it('registers a team into a division of any format (teams carry no format)', async () => {
    const team = makeTeam();
    const division = makeDivision(Format.Quads);
    const event = makeTournament({
      divisions: [division, makeDivision(Format.Sixes, 'div-2')],
    });

    const teams = new InMemoryTeamRepo();
    teams.put(team);
    const events = new InMemoryEventRepo();
    events.put(event);

    const handler = new RegisterTeamHandler(events as unknown as EventRepository, teams);

    await handler.execute({
      eventId: 'event-1',
      teamId: 'team-1',
      requesterId: 'captain',
      divisionId: 'div-1', // the Quads division
    });

    expect(events.saved).toHaveLength(1);
    expect(events.saved[0]!.teamEntries).toContainEqual(['team-1', 'div-1']);
  });
});
