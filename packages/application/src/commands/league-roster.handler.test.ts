import { describe, expect, it, vi } from 'vitest';
import {
  AgeGroup,
  Capacity,
  Division,
  EventType,
  Format,
  Gender,
  Location,
  NotFoundError,
  PriceUnit,
  SkillLevel,
  SkillTier,
  Surface,
  TeamComposition,
  TeamRegistrationMode,
  UnauthorizedError,
  ValidationError,
  Visibility,
  VolleyballEvent,
  type DivisionId,
  type EventId,
  type EventRepository,
  type UserId,
} from '@pickupvb/domain';
import {
  SetLeagueTeamForfeitedCommand,
  SetLeagueTeamForfeitedHandler,
} from './league-roster.handler.js';

const LOCATION = Location.create({
  addressLine: '1 Main',
  city: 'LB',
  region: 'CA',
  postalCode: '90802',
  country: 'US',
  latitude: 33.77,
  longitude: -118.19,
});

const HOST = 'host' as UserId;
const DIVISION_ID = 'div-1' as DivisionId;

function leagueDivision(): Division {
  return Division.create({
    id: DIVISION_ID,
    sortOrder: 0,
    label: 'Coed B',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillTier: SkillTier.B,
    ageGroup: AgeGroup.Adult,
    teamComposition: TeamComposition.Team,
    teamSize: 6,
    capacity: Capacity.fixed(12),
    priceCents: 0,
    priceUnit: PriceUnit.PerTeam,
    teamRegistrationMode: TeamRegistrationMode.Roster,
  });
}

function makeLeagueEvent(): VolleyballEvent {
  return VolleyballEvent.create({
    id: 'event-1' as EventId,
    hostId: HOST,
    title: 'League',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Intermediate,
    type: EventType.League,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: new Date('2026-09-01T00:00:00Z'),
    endsAt: new Date('2026-12-15T23:59:59Z'),
    divisions: [leagueDivision()],
  });
}

function makeOpenPlay(): VolleyballEvent {
  return VolleyballEvent.create({
    id: 'event-op' as EventId,
    hostId: HOST,
    title: 'OP',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Intermediate,
    type: EventType.OpenPlay,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: new Date('2026-09-01T00:00:00Z'),
    endsAt: new Date('2026-09-01T03:00:00Z'),
    capacity: Capacity.fixed(12),
  });
}

function makeRepo(evt: VolleyballEvent) {
  const setLeagueEntryForfeited = vi.fn().mockResolvedValue(undefined);
  const repo = {
    findById: vi.fn(async (id: string) => (String(evt.id) === id ? evt : null)),
    setLeagueEntryForfeited,
  } as unknown as EventRepository;
  return { repo, setLeagueEntryForfeited };
}

describe('SetLeagueTeamForfeitedHandler', () => {
  it('marks a roster team forfeited with a fresh timestamp', async () => {
    const evt = makeLeagueEvent();
    const { repo, setLeagueEntryForfeited } = makeRepo(evt);
    const handler = new SetLeagueTeamForfeitedHandler(repo);

    await handler.execute(
      new SetLeagueTeamForfeitedCommand(
        'event-1',
        String(DIVISION_ID),
        'team-x',
        String(HOST),
        true,
      ),
    );

    expect(setLeagueEntryForfeited).toHaveBeenCalledTimes(1);
    const [entryId, forfeitedAt] = setLeagueEntryForfeited.mock.calls[0]!;
    expect(entryId).toBe('team-x');
    expect(forfeitedAt).toBeInstanceOf(Date);
  });

  it('clears the flag when forfeited=false', async () => {
    const evt = makeLeagueEvent();
    const { repo, setLeagueEntryForfeited } = makeRepo(evt);
    const handler = new SetLeagueTeamForfeitedHandler(repo);

    await handler.execute(
      new SetLeagueTeamForfeitedCommand(
        'event-1',
        String(DIVISION_ID),
        'team-x',
        String(HOST),
        false,
      ),
    );

    expect(setLeagueEntryForfeited.mock.calls[0]![1]).toBeNull();
  });

  it('rejects non-host requesters', async () => {
    const { repo } = makeRepo(makeLeagueEvent());
    const handler = new SetLeagueTeamForfeitedHandler(repo);
    await expect(
      handler.execute(
        new SetLeagueTeamForfeitedCommand(
          'event-1',
          String(DIVISION_ID),
          'team-x',
          'stranger',
          true,
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFoundError when the event is missing', async () => {
    const { repo } = makeRepo(makeLeagueEvent());
    const handler = new SetLeagueTeamForfeitedHandler(repo);
    await expect(
      handler.execute(
        new SetLeagueTeamForfeitedCommand(
          'missing',
          String(DIVISION_ID),
          'team-x',
          String(HOST),
          true,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects non-league events', async () => {
    const { repo } = makeRepo(makeOpenPlay());
    const handler = new SetLeagueTeamForfeitedHandler(repo);
    await expect(
      handler.execute(
        new SetLeagueTeamForfeitedCommand(
          'event-op',
          String(DIVISION_ID),
          'team-x',
          String(HOST),
          true,
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError when the division is not on the event', async () => {
    const { repo } = makeRepo(makeLeagueEvent());
    const handler = new SetLeagueTeamForfeitedHandler(repo);
    await expect(
      handler.execute(
        new SetLeagueTeamForfeitedCommand('event-1', 'div-nope', 'team-x', String(HOST), true),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
