import { describe, expect, it } from 'vitest';
import {
  AgeGroup,
  Capacity,
  ConflictError,
  Division,
  EventStatus,
  EventType,
  Format,
  Gender,
  LeagueMatchStatus,
  LeagueSchedule,
  LeagueScheduleMatch,
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
  type EventWindow,
  type LeagueScheduleMatchId,
  type LeagueScheduleRepository,
  type RecordLeagueMatchResultInput,
  type EntryId,
  type UserId,
} from '@pickupvb/domain';
import {
  AddLeagueScheduleMatchHandler,
  ClearLeagueScheduleHandler,
  GenerateLeagueScheduleHandler,
  RecordLeagueMatchResultHandler,
  RemoveLeagueScheduleMatchHandler,
  UpdateLeagueScheduleMatchHandler,
} from './league-schedule.handler.js';

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
const DIVISION_ID = 'div-league-1' as DivisionId;
const TEAM_A = 'team-a' as EntryId;
const TEAM_B = 'team-b' as EntryId;

const SEASON_START = new Date('2026-09-01T00:00:00Z');
const SEASON_END = new Date('2026-12-15T23:59:59Z');
const WINDOW: EventWindow = { startsAt: SEASON_START, endsAt: SEASON_END };
const MATCH_TIME = new Date('2026-09-08T19:00:00Z');

function leagueDivision(id = DIVISION_ID): Division {
  return Division.create({
    id,
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
    id: 'event-league-1' as EventId,
    hostId: HOST,
    title: 'Tuesday Coed B League',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Intermediate,
    type: EventType.League,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: SEASON_START,
    endsAt: SEASON_END,
    divisions: [leagueDivision()],
  });
}

function makeOpenPlayEvent(): VolleyballEvent {
  return VolleyballEvent.create({
    id: 'event-op-1' as EventId,
    hostId: HOST,
    title: 'Open Play',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Intermediate,
    type: EventType.OpenPlay,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: SEASON_START,
    endsAt: SEASON_END,
    capacity: Capacity.fixed(12),
  });
}

class InMemoryEventRepo implements Pick<EventRepository, 'findById' | 'save'> {
  private store = new Map<string, VolleyballEvent>();

  put(evt: VolleyballEvent) {
    this.store.set(String(evt.id), evt);
  }
  async findById(id: string): Promise<VolleyballEvent | null> {
    return this.store.get(id) ?? null;
  }
  async save(): Promise<void> {
    // unused by these handlers
  }
}

class InMemoryScheduleRepo implements LeagueScheduleRepository {
  private store = new Map<string, LeagueSchedule>();
  saveCount = 0;
  recordCount = 0;
  private nextId = 1;

  putSchedule(schedule: LeagueSchedule) {
    this.store.set(String(schedule.divisionId), schedule);
  }
  nextMatchId(): LeagueScheduleMatchId {
    return `m-${this.nextId++}` as LeagueScheduleMatchId;
  }
  async findByDivisionId(divisionId: DivisionId): Promise<LeagueSchedule | null> {
    return this.store.get(String(divisionId)) ?? null;
  }
  async save(schedule: LeagueSchedule): Promise<void> {
    this.saveCount += 1;
    this.store.set(String(schedule.divisionId), schedule);
  }
  // Stands in for the narrow, RLS-enforced single-row UPDATE. Applies the
  // scores so the score-assertion tests still observe the change, and counts
  // calls so a test can pin that the record path uses THIS method, not the
  // host-only full-replace `save`.
  async recordMatchResult(input: RecordLeagueMatchResultInput): Promise<void> {
    this.recordCount += 1;
    const schedule = this.store.get(String(input.divisionId));
    if (!schedule) throw new NotFoundError('LeagueScheduleMatch', String(input.matchId));
    const existing = schedule.matches.find((m) => String(m.id) === String(input.matchId));
    if (!existing) throw new NotFoundError('LeagueScheduleMatch', String(input.matchId));
    schedule.replaceMatch(
      LeagueScheduleMatch.create({
        id: existing.id,
        weekNumber: existing.weekNumber,
        scheduledAt: existing.scheduledAt,
        courtLabel: existing.courtLabel,
        homeEntryId: existing.homeEntryId,
        awayEntryId: existing.awayEntryId,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        status: input.status,
        notes: existing.notes,
      }),
    );
  }
}

function emptySchedule(): LeagueSchedule {
  return LeagueSchedule.create({ divisionId: DIVISION_ID, eventWindow: WINDOW });
}

function scheduleWithMatch(): { schedule: LeagueSchedule; matchId: LeagueScheduleMatchId } {
  const matchId = 'm-existing' as LeagueScheduleMatchId;
  const schedule = LeagueSchedule.create({
    divisionId: DIVISION_ID,
    eventWindow: WINDOW,
    matches: [
      LeagueScheduleMatch.create({
        id: matchId,
        weekNumber: 1,
        scheduledAt: MATCH_TIME,
        courtLabel: 'Court 1',
        homeEntryId: TEAM_A,
        awayEntryId: TEAM_B,
        homeScore: null,
        awayScore: null,
        status: LeagueMatchStatus.Scheduled,
        notes: null,
      }),
    ],
  });
  return { schedule, matchId };
}

function makeRepos(): {
  events: InMemoryEventRepo;
  schedules: InMemoryScheduleRepo;
} {
  const events = new InMemoryEventRepo();
  events.put(makeLeagueEvent());
  const schedules = new InMemoryScheduleRepo();
  schedules.putSchedule(emptySchedule());
  return { events, schedules };
}

describe('AddLeagueScheduleMatchHandler', () => {
  it('appends a match and saves the schedule', async () => {
    const { events, schedules } = makeRepos();
    const handler = new AddLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    const result = await handler.execute({
      eventId: 'event-league-1',
      divisionId: String(DIVISION_ID),
      requesterId: String(HOST),
      match: {
        weekNumber: 1,
        scheduledAt: MATCH_TIME,
        homeEntryId: String(TEAM_A),
        awayEntryId: String(TEAM_B),
        courtLabel: 'Court 1',
      },
    });

    expect(result.matchId).toBe('m-1');
    expect(schedules.saveCount).toBe(1);
    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches).toHaveLength(1);
    expect(saved?.matches[0]?.homeEntryId).toBe(TEAM_A);
  });

  it('rejects non-host requesters', async () => {
    const { events, schedules } = makeRepos();
    const handler = new AddLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        requesterId: 'someone-else',
        match: { weekNumber: 1, scheduledAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects non-league events', async () => {
    const events = new InMemoryEventRepo();
    events.put(makeOpenPlayEvent());
    const schedules = new InMemoryScheduleRepo();
    const handler = new AddLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-op-1',
        divisionId: 'whatever',
        requesterId: String(HOST),
        match: { weekNumber: 1, scheduledAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError when the event is missing', async () => {
    const events = new InMemoryEventRepo();
    const schedules = new InMemoryScheduleRepo();
    const handler = new AddLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'missing',
        divisionId: String(DIVISION_ID),
        requesterId: String(HOST),
        match: { weekNumber: 1, scheduledAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the division is not on the event', async () => {
    const { events, schedules } = makeRepos();
    const handler = new AddLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: 'div-missing',
        requesterId: String(HOST),
        match: { weekNumber: 1, scheduledAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GenerateLeagueScheduleHandler', () => {
  const FOUR_TEAMS = ['team-a', 'team-b', 'team-c', 'team-d'];

  it('generates a round-robin into an empty slate and saves once', async () => {
    const { events, schedules } = makeRepos();
    const handler = new GenerateLeagueScheduleHandler(
      events as unknown as EventRepository,
      schedules,
    );

    const result = await handler.execute({
      eventId: 'event-league-1',
      divisionId: String(DIVISION_ID),
      requesterId: String(HOST),
      entryIds: FOUR_TEAMS,
      options: { firstMatchAt: MATCH_TIME, intervalDays: 7 },
    });

    expect(result.created).toBe(6); // 4 teams single round-robin = 6 matches
    expect(schedules.saveCount).toBe(1);
    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches).toHaveLength(6);
    expect(Math.max(...(saved?.matches ?? []).map((m) => m.weekNumber))).toBe(3);
  });

  it('refuses to overwrite a non-empty slate', async () => {
    const { events, schedules } = makeRepos();
    const { schedule } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new GenerateLeagueScheduleHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        requesterId: String(HOST),
        entryIds: FOUR_TEAMS,
        options: { firstMatchAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects non-host requesters', async () => {
    const { events, schedules } = makeRepos();
    const handler = new GenerateLeagueScheduleHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        requesterId: 'someone-else',
        entryIds: FOUR_TEAMS,
        options: { firstMatchAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('ClearLeagueScheduleHandler', () => {
  it('wipes the slate and reports the removed count', async () => {
    const { events, schedules } = makeRepos();
    const { schedule } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new ClearLeagueScheduleHandler(events as unknown as EventRepository, schedules);

    const result = await handler.execute({
      eventId: 'event-league-1',
      divisionId: String(DIVISION_ID),
      requesterId: String(HOST),
    });

    expect(result.removed).toBe(1);
    expect(schedules.saveCount).toBe(1);
    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches).toHaveLength(0);
  });

  it('rejects non-host requesters', async () => {
    const { events, schedules } = makeRepos();
    const { schedule } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new ClearLeagueScheduleHandler(events as unknown as EventRepository, schedules);

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        requesterId: 'someone-else',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('UpdateLeagueScheduleMatchHandler', () => {
  it('replaces metadata while preserving existing scores', async () => {
    const { events, schedules } = makeRepos();
    const { schedule, matchId } = scheduleWithMatch();
    // Pre-set scores to confirm they survive a metadata-only update.
    const withScores = LeagueSchedule.fromPersistence(
      DIVISION_ID,
      WINDOW,
      schedule.matches.map((m) =>
        LeagueScheduleMatch.create({
          id: m.id,
          weekNumber: m.weekNumber,
          scheduledAt: m.scheduledAt,
          courtLabel: m.courtLabel,
          homeEntryId: m.homeEntryId,
          awayEntryId: m.awayEntryId,
          homeScore: 21,
          awayScore: 18,
          status: LeagueMatchStatus.Completed,
          notes: m.notes,
        }),
      ),
    );
    schedules.putSchedule(withScores);
    const handler = new UpdateLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await handler.execute({
      eventId: 'event-league-1',
      divisionId: String(DIVISION_ID),
      matchId: String(matchId),
      requesterId: String(HOST),
      match: {
        weekNumber: 2,
        scheduledAt: new Date('2026-09-15T19:00:00Z'),
        courtLabel: 'Court 2',
        homeEntryId: String(TEAM_A),
        awayEntryId: String(TEAM_B),
        status: LeagueMatchStatus.Completed,
      },
    });

    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches).toHaveLength(1);
    expect(saved?.matches[0]?.weekNumber).toBe(2);
    expect(saved?.matches[0]?.courtLabel).toBe('Court 2');
    expect(saved?.matches[0]?.homeScore).toBe(21);
    expect(saved?.matches[0]?.awayScore).toBe(18);
  });

  it('overwrites scores when the command supplies them', async () => {
    const { events, schedules } = makeRepos();
    const { schedule, matchId } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new UpdateLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await handler.execute({
      eventId: 'event-league-1',
      divisionId: String(DIVISION_ID),
      matchId: String(matchId),
      requesterId: String(HOST),
      match: {
        weekNumber: 1,
        scheduledAt: MATCH_TIME,
        homeEntryId: String(TEAM_A),
        awayEntryId: String(TEAM_B),
        homeScore: 25,
        awayScore: 22,
        status: LeagueMatchStatus.Completed,
      },
    });

    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches[0]?.homeScore).toBe(25);
    expect(saved?.matches[0]?.status).toBe(LeagueMatchStatus.Completed);
  });

  it('rejects non-host requesters', async () => {
    const { events, schedules } = makeRepos();
    const { schedule, matchId } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new UpdateLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        matchId: String(matchId),
        requesterId: 'someone-else',
        match: { weekNumber: 1, scheduledAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFoundError for an unknown match id', async () => {
    const { events, schedules } = makeRepos();
    const { schedule } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new UpdateLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        matchId: 'm-missing',
        requesterId: String(HOST),
        match: { weekNumber: 1, scheduledAt: MATCH_TIME },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('RemoveLeagueScheduleMatchHandler', () => {
  it('removes the match and saves the schedule', async () => {
    const { events, schedules } = makeRepos();
    const { schedule, matchId } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new RemoveLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await handler.execute({
      eventId: 'event-league-1',
      divisionId: String(DIVISION_ID),
      matchId: String(matchId),
      requesterId: String(HOST),
    });

    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches).toHaveLength(0);
  });

  it('rejects non-host requesters', async () => {
    const { events, schedules } = makeRepos();
    const { schedule, matchId } = scheduleWithMatch();
    schedules.putSchedule(schedule);
    const handler = new RemoveLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        matchId: String(matchId),
        requesterId: 'someone-else',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFoundError for unknown match ids', async () => {
    const { events, schedules } = makeRepos();
    schedules.putSchedule(emptySchedule());
    const handler = new RemoveLeagueScheduleMatchHandler(
      events as unknown as EventRepository,
      schedules,
    );

    await expect(
      handler.execute({
        eventId: 'event-league-1',
        divisionId: String(DIVISION_ID),
        matchId: 'm-missing',
        requesterId: String(HOST),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('RecordLeagueMatchResultHandler', () => {
  it('writes scores and defaults status to completed', async () => {
    const { schedule, matchId } = scheduleWithMatch();
    const schedules = new InMemoryScheduleRepo();
    schedules.putSchedule(schedule);
    const handler = new RecordLeagueMatchResultHandler(schedules);

    await handler.execute({
      divisionId: String(DIVISION_ID),
      matchId: String(matchId),
      requesterId: 'captain',
      homeScore: 25,
      awayScore: 17,
    });

    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches[0]?.homeScore).toBe(25);
    expect(saved?.matches[0]?.awayScore).toBe(17);
    expect(saved?.matches[0]?.status).toBe(LeagueMatchStatus.Completed);
  });

  it('accepts a forfeit status', async () => {
    const { schedule, matchId } = scheduleWithMatch();
    const schedules = new InMemoryScheduleRepo();
    schedules.putSchedule(schedule);
    const handler = new RecordLeagueMatchResultHandler(schedules);

    await handler.execute({
      divisionId: String(DIVISION_ID),
      matchId: String(matchId),
      requesterId: 'captain',
      homeScore: 25,
      awayScore: 0,
      status: LeagueMatchStatus.Forfeit,
    });

    const saved = await schedules.findByDivisionId(DIVISION_ID);
    expect(saved?.matches[0]?.status).toBe(LeagueMatchStatus.Forfeit);
  });

  it('persists via the narrow RLS-enforced recordMatchResult, never the full-replace save', async () => {
    // Regression guard for the captain-RLS fix: the host-only `save`
    // full-replace runs through the admin client and bypasses the
    // `league_schedule_matches_update` policy. Score entry MUST use the
    // single-row `recordMatchResult` path so RLS (host or either captain)
    // is the authorization gate. If this flips back to `save`, the auth
    // gap re-opens. See docs/audits/event-data-model.md.
    const { schedule, matchId } = scheduleWithMatch();
    const schedules = new InMemoryScheduleRepo();
    schedules.putSchedule(schedule);
    const handler = new RecordLeagueMatchResultHandler(schedules);

    await handler.execute({
      divisionId: String(DIVISION_ID),
      matchId: String(matchId),
      requesterId: 'captain',
      homeScore: 25,
      awayScore: 17,
    });

    expect(schedules.recordCount).toBe(1);
    expect(schedules.saveCount).toBe(0);
  });

  it('rejects status values that are not completed or forfeit', async () => {
    const { schedule, matchId } = scheduleWithMatch();
    const schedules = new InMemoryScheduleRepo();
    schedules.putSchedule(schedule);
    const handler = new RecordLeagueMatchResultHandler(schedules);

    await expect(
      handler.execute({
        divisionId: String(DIVISION_ID),
        matchId: String(matchId),
        requesterId: 'captain',
        homeScore: 25,
        awayScore: 17,
        status: LeagueMatchStatus.Scheduled,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for unknown match ids', async () => {
    const schedules = new InMemoryScheduleRepo();
    schedules.putSchedule(emptySchedule());
    const handler = new RecordLeagueMatchResultHandler(schedules);

    await expect(
      handler.execute({
        divisionId: String(DIVISION_ID),
        matchId: 'm-missing',
        requesterId: 'captain',
        homeScore: 25,
        awayScore: 17,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// Silence "unused import" warnings for things only used for typing edge cases.
void EventStatus;
