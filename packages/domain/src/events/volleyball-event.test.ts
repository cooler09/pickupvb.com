import { describe, it, expect, beforeEach } from 'vitest';
import { VolleyballEvent, type EventId, type UserId, type TeamId } from './volleyball-event.js';
import { Capacity } from './capacity.js';
import { Location } from './location.js';
import { Division, type DivisionId } from './division.js';
import {
  EventPosition,
  EventStatus,
  EventType,
  Format,
  Gender,
  PriceUnit,
  SkillLevel,
  SkillTier,
  Surface,
  TeamComposition,
  TeamRegistrationMode,
  Visibility,
} from './enums.js';
import {
  CapacityExceededError,
  ConflictError,
  InvariantViolation,
  NotFoundError,
} from '../shared/result.js';

const HOST = 'host-1' as UserId;
const ALICE = 'alice' as UserId;
const BOB = 'bob' as UserId;
const CAROL = 'carol' as UserId;
const TEAM_A = 'team-a' as TeamId;

const LOCATION = Location.create({
  addressLine: '1 Main St',
  city: 'Long Beach',
  region: 'CA',
  postalCode: '90802',
  country: 'US',
  latitude: 33.77,
  longitude: -118.19,
});

function tomorrow(offsetHours = 0): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000 + offsetHours * 60 * 60 * 1000);
}

function makeOpenPlay(
  overrides: Partial<{
    id: EventId;
    capacity: Capacity;
    positionRoster: ReadonlyMap<EventPosition, number>;
    startsAt: Date;
  }> = {},
): VolleyballEvent {
  return VolleyballEvent.create({
    id: (overrides.id ?? 'event-1') as EventId,
    hostId: HOST,
    title: 'Tuesday Night Open Play',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Intermediate,
    type: EventType.OpenPlay,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: overrides.startsAt ?? tomorrow(),
    endsAt: overrides.startsAt
      ? new Date(overrides.startsAt.getTime() + 2 * 60 * 60 * 1000)
      : tomorrow(2),
    ...(overrides.capacity ? { capacity: overrides.capacity } : { capacity: Capacity.fixed(2) }),
    ...(overrides.positionRoster ? { positionRoster: overrides.positionRoster } : {}),
  });
}

function makeTournament(): VolleyballEvent {
  return VolleyballEvent.create({
    id: 'tourney-1' as EventId,
    hostId: HOST,
    title: 'Beach Quads Tournament',
    description: '',
    rules: '',
    surface: Surface.Sand,
    format: Format.Quads,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Advanced,
    type: EventType.Tournament,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: tomorrow(),
    endsAt: tomorrow(8),
  });
}

describe('VolleyballEvent.create', () => {
  it('starts as Draft and raises EventCreated', () => {
    const evt = makeOpenPlay();
    expect(evt.status).toBe(EventStatus.Draft);
  });

  it('rejects when end is before start', () => {
    expect(() =>
      VolleyballEvent.create({
        id: 'bad' as EventId,
        hostId: HOST,
        title: 'bad',
        description: '',
        rules: '',
        surface: Surface.Indoor,
        format: Format.Sixes,
        gender: Gender.Coed,
        skillLevel: SkillLevel.Intermediate,
        type: EventType.OpenPlay,
        visibility: Visibility.Public,
        location: LOCATION,
        startsAt: tomorrow(2),
        endsAt: tomorrow(1),
        capacity: Capacity.fixed(8),
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects empty title', () => {
    expect(() =>
      VolleyballEvent.create({
        id: 'bad' as EventId,
        hostId: HOST,
        title: '   ',
        description: '',
        rules: '',
        surface: Surface.Indoor,
        format: Format.Sixes,
        gender: Gender.Coed,
        skillLevel: SkillLevel.Intermediate,
        type: EventType.OpenPlay,
        visibility: Visibility.Public,
        location: LOCATION,
        startsAt: tomorrow(),
        endsAt: tomorrow(2),
        capacity: Capacity.fixed(8),
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects open-play without capacity or roster', () => {
    expect(() =>
      VolleyballEvent.create({
        id: 'bad' as EventId,
        hostId: HOST,
        title: 'No cap',
        description: '',
        rules: '',
        surface: Surface.Indoor,
        format: Format.Sixes,
        gender: Gender.Coed,
        skillLevel: SkillLevel.Intermediate,
        type: EventType.OpenPlay,
        visibility: Visibility.Public,
        location: LOCATION,
        startsAt: tomorrow(),
        endsAt: tomorrow(2),
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects invalid surface ↔ format combo (indoor doubles)', () => {
    expect(() =>
      VolleyballEvent.create({
        id: 'bad' as EventId,
        hostId: HOST,
        title: 'No',
        description: '',
        rules: '',
        surface: Surface.Indoor,
        format: Format.Doubles,
        gender: Gender.Coed,
        skillLevel: SkillLevel.Intermediate,
        type: EventType.OpenPlay,
        visibility: Visibility.Public,
        location: LOCATION,
        startsAt: tomorrow(),
        endsAt: tomorrow(2),
        capacity: Capacity.fixed(8),
      }),
    ).toThrow(InvariantViolation);
  });
});

describe('publish / cancel state machine', () => {
  it('publish moves Draft → Published', () => {
    const evt = makeOpenPlay();
    evt.publish();
    expect(evt.status).toBe(EventStatus.Published);
  });

  it('publish twice throws InvariantViolation', () => {
    const evt = makeOpenPlay();
    evt.publish();
    expect(() => evt.publish()).toThrow(InvariantViolation);
  });

  it('cancel from Draft sets Cancelled', () => {
    const evt = makeOpenPlay();
    evt.cancel('weather');
    expect(evt.status).toBe(EventStatus.Cancelled);
  });

  it('cancel after Cancelled throws InvariantViolation', () => {
    const evt = makeOpenPlay();
    evt.cancel('reason');
    expect(() => evt.cancel('again')).toThrow(InvariantViolation);
  });
});

describe('joinAsPlayer (open play, no positions)', () => {
  let evt: VolleyballEvent;
  beforeEach(() => {
    evt = makeOpenPlay({ capacity: Capacity.fixed(2) });
    evt.publish();
  });

  it('adds an attendee', () => {
    evt.joinAsPlayer(ALICE);
    expect(evt.attendees.has(ALICE)).toBe(true);
    expect(evt.spotsRemaining).toBe(1);
  });

  it('rejects duplicate signup with ConflictError', () => {
    evt.joinAsPlayer(ALICE);
    expect(() => evt.joinAsPlayer(ALICE)).toThrow(ConflictError);
  });

  it('throws CapacityExceededError when full', () => {
    evt.joinAsPlayer(ALICE);
    evt.joinAsPlayer(BOB);
    expect(evt.spotsRemaining).toBe(0);
    expect(() => evt.joinAsPlayer(CAROL)).toThrow(CapacityExceededError);
  });

  it('rejects join while still Draft', () => {
    const draft = makeOpenPlay();
    expect(() => draft.joinAsPlayer(ALICE)).toThrow(InvariantViolation);
  });

  it('rejects join after the event has started', () => {
    const past = makeOpenPlay({ startsAt: new Date(Date.now() - 60 * 60 * 1000) });
    past.publish();
    expect(() => past.joinAsPlayer(ALICE)).toThrow(InvariantViolation);
  });

  it('rejects joinAsPlayer on a positional event', () => {
    const positional = makeOpenPlay({
      positionRoster: new Map([[EventPosition.Setter, 2]]),
    });
    positional.publish();
    expect(() => positional.joinAsPlayer(ALICE)).toThrow(InvariantViolation);
  });
});

describe('joinAsPlayerWithPosition', () => {
  it('fills positions and frees room', () => {
    const evt = makeOpenPlay({
      positionRoster: new Map([
        [EventPosition.Setter, 1],
        [EventPosition.Outside, 2],
      ]),
    });
    evt.publish();
    evt.joinAsPlayerWithPosition(ALICE, EventPosition.Setter);
    expect(evt.attendeesAtPosition(EventPosition.Setter)).toBe(1);
    expect(evt.spotsRemaining).toBe(2);
  });

  it('over-fill (waitlist) does NOT throw, but flags waitlist on the event', () => {
    const evt = makeOpenPlay({
      positionRoster: new Map([[EventPosition.Setter, 1]]),
    });
    evt.publish();
    evt.joinAsPlayerWithPosition(ALICE, EventPosition.Setter);
    // Second setter — over-fill is allowed per the aggregate's waitlist semantics.
    expect(() => evt.joinAsPlayerWithPosition(BOB, EventPosition.Setter)).not.toThrow();
    expect(evt.attendeesAtPosition(EventPosition.Setter)).toBe(2);
  });

  it('rejects an unknown position with InvariantViolation', () => {
    const evt = makeOpenPlay({
      positionRoster: new Map([[EventPosition.Setter, 1]]),
    });
    evt.publish();
    expect(() => evt.joinAsPlayerWithPosition(ALICE, EventPosition.Libero)).toThrow(
      InvariantViolation,
    );
  });
});

describe('leave', () => {
  it('removes an attendee', () => {
    const evt = makeOpenPlay({ capacity: Capacity.fixed(4) });
    evt.publish();
    evt.joinAsPlayer(ALICE);
    evt.leave(ALICE);
    expect(evt.attendees.has(ALICE)).toBe(false);
  });

  it('throws NotFoundError when leaving while not signed up', () => {
    const evt = makeOpenPlay();
    evt.publish();
    expect(() => evt.leave(ALICE)).toThrow(NotFoundError);
  });
});

describe('tournament signup', () => {
  it('registerTeam adds the team', () => {
    const t = makeTournament();
    t.publish();
    t.registerTeam(TEAM_A);
    expect(t.teams.has(TEAM_A)).toBe(true);
  });

  it('registerTeam rejects duplicates with ConflictError', () => {
    const t = makeTournament();
    t.publish();
    t.registerTeam(TEAM_A);
    expect(() => t.registerTeam(TEAM_A)).toThrow(ConflictError);
  });

  it('withdrawTeam throws NotFoundError when team not registered', () => {
    const t = makeTournament();
    t.publish();
    expect(() => t.withdrawTeam(TEAM_A)).toThrow(NotFoundError);
  });

  it('rejects registerTeam on an open-play event', () => {
    const open = makeOpenPlay();
    open.publish();
    expect(() => open.registerTeam(TEAM_A)).toThrow(InvariantViolation);
  });

  it('rejects joinAsPlayer on a tournament', () => {
    const t = makeTournament();
    t.publish();
    expect(() => t.joinAsPlayer(ALICE)).toThrow(InvariantViolation);
  });
});

describe('free agent (tournament only)', () => {
  const FA_DIV = 'div-fa' as DivisionId;
  function tournamentWithFADivision(allowFreeAgents = true): VolleyballEvent {
    const t = makeTournament();
    t.addDivision(
      Division.create({
        id: FA_DIV,
        sortOrder: 0,
        label: 'Open',
        surface: Surface.Sand,
        format: Format.Quads,
        gender: Gender.Coed,
        skillTier: SkillTier.BB,
        teamComposition: TeamComposition.Team,
        priceCents: null,
        priceUnit: PriceUnit.PerTeam,
        allowFreeAgents,
      }),
    );
    return t;
  }

  it('joinAsFreeAgent records the user', () => {
    const t = tournamentWithFADivision();
    t.publish();
    t.joinAsFreeAgent(ALICE, FA_DIV, 'OH/RS, can bring own ball');
    expect(t.freeAgents.has(ALICE)).toBe(true);
  });

  it('rejects duplicate free-agent signup', () => {
    const t = tournamentWithFADivision();
    t.publish();
    t.joinAsFreeAgent(ALICE, FA_DIV, null);
    expect(() => t.joinAsFreeAgent(ALICE, FA_DIV, null)).toThrow(ConflictError);
  });

  it('rejects free-agent signup on an open-play event', () => {
    const open = makeOpenPlay();
    open.publish();
    expect(() => open.joinAsFreeAgent(ALICE, FA_DIV, null)).toThrow(InvariantViolation);
  });

  it('rejects free-agent signup when the division opts out', () => {
    const t = tournamentWithFADivision(false);
    t.publish();
    expect(() => t.joinAsFreeAgent(ALICE, FA_DIV, null)).toThrow(InvariantViolation);
  });

  it('rejects free-agent signup for an unknown division', () => {
    const t = tournamentWithFADivision();
    t.publish();
    expect(() => t.joinAsFreeAgent(ALICE, 'nope' as DivisionId, null)).toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// ADR 0012 — canonical registration-config matrix
// (event type × team_registration_mode × team_composition × price_unit)
// ---------------------------------------------------------------------------

function pricedDivision(props: {
  id?: string;
  priceCents: number | null;
  priceUnit: PriceUnit;
  sortOrder?: number;
  teamComposition?: TeamComposition;
}): Division {
  return Division.create({
    id: (props.id ?? 'div-1') as DivisionId,
    sortOrder: props.sortOrder ?? 0,
    label: 'Open',
    surface: Surface.Sand,
    format: Format.Quads,
    gender: Gender.Coed,
    skillTier: SkillTier.BB,
    teamComposition: props.teamComposition ?? TeamComposition.Team,
    priceCents: props.priceCents,
    priceUnit: props.priceUnit,
  });
}

function makeTournamentWith(opts: {
  divisions: ReadonlyArray<Division>;
  teamRegistrationMode?: TeamRegistrationMode | null;
  paymentsOffPlatform?: boolean;
}): VolleyballEvent {
  return VolleyballEvent.create({
    id: 'tourney-pc' as EventId,
    hostId: HOST,
    title: 'Tournament',
    description: '',
    rules: '',
    surface: Surface.Sand,
    format: Format.Quads,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Advanced,
    type: EventType.Tournament,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: tomorrow(),
    endsAt: tomorrow(8),
    divisions: opts.divisions,
    extensions: {
      ...(opts.teamRegistrationMode !== undefined
        ? { teamRegistrationMode: opts.teamRegistrationMode }
        : {}),
      ...(opts.paymentsOffPlatform !== undefined
        ? { paymentsOffPlatform: opts.paymentsOffPlatform }
        : {}),
    },
  });
}

describe('VolleyballEvent registration-config invariant (ADR 0012)', () => {
  it('defaults tournaments to ad-hoc team registration', () => {
    const evt = makeTournament();
    expect(evt.teamRegistrationMode).toBe(TeamRegistrationMode.AdHoc);
  });

  // Rule 2 — team-led events require team composition + per-team pricing
  it('rejects ad-hoc team event with per-player priced division', () => {
    expect(() =>
      makeTournamentWith({
        divisions: [pricedDivision({ priceCents: 2500, priceUnit: PriceUnit.PerPlayer })],
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects ad-hoc team event with per-player priced division even when paymentsOffPlatform (no escape hatch)', () => {
    expect(() =>
      makeTournamentWith({
        divisions: [pricedDivision({ priceCents: 2500, priceUnit: PriceUnit.PerPlayer })],
        paymentsOffPlatform: true,
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects ad-hoc team event with a free (price 0) per-player division', () => {
    expect(() =>
      makeTournamentWith({
        divisions: [pricedDivision({ priceCents: 0, priceUnit: PriceUnit.PerPlayer })],
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects ad-hoc team event with a solo-composition division', () => {
    expect(() =>
      makeTournamentWith({
        divisions: [
          pricedDivision({
            priceCents: 10000,
            priceUnit: PriceUnit.PerTeam,
            teamComposition: TeamComposition.Solo,
          }),
        ],
      }),
    ).toThrow(InvariantViolation);
  });

  it('accepts ad-hoc team event with per-team priced team-composition division', () => {
    const evt = makeTournamentWith({
      divisions: [pricedDivision({ priceCents: 10000, priceUnit: PriceUnit.PerTeam })],
    });
    expect(evt.teamRegistrationMode).toBe(TeamRegistrationMode.AdHoc);
  });

  // Rule 3 — individual-signup events require solo + per-player
  it('rejects individual-signup tournament with per-team priced division', () => {
    expect(() =>
      makeTournamentWith({
        teamRegistrationMode: null,
        divisions: [
          pricedDivision({
            priceCents: 10000,
            priceUnit: PriceUnit.PerTeam,
            teamComposition: TeamComposition.Solo,
          }),
        ],
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects individual-signup tournament with a non-solo composition division', () => {
    expect(() =>
      makeTournamentWith({
        teamRegistrationMode: null,
        divisions: [pricedDivision({ priceCents: 2500, priceUnit: PriceUnit.PerPlayer })],
      }),
    ).toThrow(InvariantViolation);
  });

  it('accepts individual-signup tournament with solo + per-player division', () => {
    const evt = makeTournamentWith({
      teamRegistrationMode: null,
      divisions: [
        pricedDivision({
          priceCents: 2500,
          priceUnit: PriceUnit.PerPlayer,
          teamComposition: TeamComposition.Solo,
        }),
      ],
    });
    expect(evt.teamRegistrationMode).toBeNull();
  });

  // Rule 1 — open-play is individual-only
  it('open-play events default to individual signup (null mode)', () => {
    const open = makeOpenPlay();
    expect(open.teamRegistrationMode).toBeNull();
  });

  // Defence-in-depth — addDivision re-runs invariants
  it('addDivision rejects a division that creates an invalid combo', () => {
    const evt = makeTournamentWith({
      divisions: [pricedDivision({ priceCents: 10000, priceUnit: PriceUnit.PerTeam })],
    });
    const bad = pricedDivision({
      id: 'div-bad',
      sortOrder: 1,
      priceCents: 2500,
      priceUnit: PriceUnit.PerPlayer,
    });
    expect(() => evt.addDivision(bad)).toThrow(InvariantViolation);
  });
});
