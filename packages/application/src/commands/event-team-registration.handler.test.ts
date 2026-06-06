import { describe, it, expect } from 'vitest';
import {
  Division,
  EventType,
  Format,
  Gender,
  InvariantViolation,
  Location,
  NotFoundError,
  PriceUnit,
  RegistrationSource,
  SkillTier,
  Surface,
  TeamComposition,
  TeamRegistrationMode,
  UnauthorizedError,
  Visibility,
  VolleyballEvent,
  type DivisionId,
  type EventId,
  type EventTeamRegistration,
  type EventTeamRegistrationRepository,
  type EventWriteStore,
  type UserId,
} from '@pickupvb/domain';
import { RegisterWalkInTeamHandler } from './event-team-registration.handler.js';
import { RegisterWalkInTeamCommand } from '../messages/index.js';

const HOST = 'host-1' as UserId;
const STRANGER = 'stranger' as UserId;

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

function division(props: {
  id: string;
  teamRegistrationMode: TeamRegistrationMode | null;
  teamComposition: TeamComposition;
  priceUnit: PriceUnit;
}): Division {
  return Division.create({
    id: props.id as DivisionId,
    sortOrder: 0,
    label: 'Open',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillTier: SkillTier.BB,
    teamComposition: props.teamComposition,
    priceCents: 10000,
    priceUnit: props.priceUnit,
    teamRegistrationMode: props.teamRegistrationMode,
  });
}

function makeEvent(type: EventType, divisions: ReadonlyArray<Division>): VolleyballEvent {
  const evt = VolleyballEvent.create({
    id: 'evt-1' as EventId,
    hostId: HOST,
    title: 'Spring League',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    type,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: tomorrow(),
    endsAt: tomorrow(8),
    divisions,
  });
  evt.publish();
  return evt;
}

const rosterDivision = (id = 'div-roster') =>
  division({
    id,
    teamRegistrationMode: TeamRegistrationMode.Roster,
    teamComposition: TeamComposition.Team,
    priceUnit: PriceUnit.PerTeam,
  });

const adHocDivision = (id = 'div-adhoc') =>
  division({
    id,
    teamRegistrationMode: TeamRegistrationMode.AdHoc,
    teamComposition: TeamComposition.Team,
    priceUnit: PriceUnit.PerTeam,
  });

const soloDivision = (id = 'div-solo') =>
  division({
    id,
    teamRegistrationMode: null,
    teamComposition: TeamComposition.Solo,
    priceUnit: PriceUnit.PerPlayer,
  });

class InMemoryEvents implements Pick<EventWriteStore, 'findById'> {
  private store = new Map<string, VolleyballEvent>();
  put(evt: VolleyballEvent) {
    this.store.set(String(evt.id), evt);
  }
  async findById(id: string): Promise<VolleyballEvent | null> {
    return this.store.get(id) ?? null;
  }
}

class CapturingRegistrations implements Pick<EventTeamRegistrationRepository, 'save'> {
  saved: EventTeamRegistration[] = [];
  async save(reg: EventTeamRegistration): Promise<void> {
    this.saved.push(reg);
  }
}

function wire(events: InMemoryEvents, regs: CapturingRegistrations): RegisterWalkInTeamHandler {
  return new RegisterWalkInTeamHandler(
    events as unknown as EventWriteStore,
    regs as unknown as EventTeamRegistrationRepository,
  );
}

const cmd = (divisionId: string, hostId: UserId = HOST) =>
  new RegisterWalkInTeamCommand(
    'evt-1',
    divisionId,
    hostId,
    'Block Party',
    'Jordan P.',
    '757-555-0142',
    [],
  );

describe('RegisterWalkInTeamHandler (ADR 0033 — host-added teams on roster/league divisions)', () => {
  it('lets a league host add an account-less team to a roster division', async () => {
    const events = new InMemoryEvents();
    events.put(makeEvent(EventType.League, [rosterDivision()]));
    const regs = new CapturingRegistrations();

    await wire(events, regs).execute(cmd('div-roster'));

    expect(regs.saved).toHaveLength(1);
    const reg = regs.saved[0]!;
    // Team-less placeholder: walk_in source, no captain account, freeform name.
    expect(reg.source).toBe(RegistrationSource.WalkIn);
    expect(reg.captainId).toBeNull();
    expect(reg.name).toBe('Block Party');
  });

  it('still lets a tournament host add a walk-in team to an ad-hoc division', async () => {
    const events = new InMemoryEvents();
    events.put(makeEvent(EventType.Tournament, [adHocDivision()]));
    const regs = new CapturingRegistrations();

    await wire(events, regs).execute(cmd('div-adhoc'));

    expect(regs.saved).toHaveLength(1);
    expect(regs.saved[0]!.source).toBe(RegistrationSource.WalkIn);
  });

  it('rejects an individual (null-mode) division — nothing to add a team to', async () => {
    const events = new InMemoryEvents();
    events.put(makeEvent(EventType.Tournament, [soloDivision()]));
    const regs = new CapturingRegistrations();

    await expect(wire(events, regs).execute(cmd('div-solo'))).rejects.toBeInstanceOf(
      InvariantViolation,
    );
    expect(regs.saved).toHaveLength(0);
  });

  it('rejects a caller who is not the event host', async () => {
    const events = new InMemoryEvents();
    events.put(makeEvent(EventType.League, [rosterDivision()]));
    const regs = new CapturingRegistrations();

    await expect(wire(events, regs).execute(cmd('div-roster', STRANGER))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(regs.saved).toHaveLength(0);
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const events = new InMemoryEvents();
    const regs = new CapturingRegistrations();
    await expect(wire(events, regs).execute(cmd('div-roster'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
