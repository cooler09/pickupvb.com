import { randomUUID } from 'node:crypto';
import {
  EventTeamRegistration,
  EventType,
  ConflictError,
  NotFoundError,
  RegistrationMember,
  RegistrationSource,
  TeamRegistrationMode,
  UnauthorizedError,
  InvariantViolation,
  type DivisionId,
  type EventRepository,
  type EventTeamRegistrationId,
  type EventTeamRegistrationMemberId,
  type EventTeamRegistrationRepository,
  type UserId,
} from '@pickupvb/domain';
import {
  AddAdHocTeamMemberCommand,
  MarkWalkInPaidCashCommand,
  RegisterAdHocTeamCommand,
  RegisterWalkInTeamCommand,
  RemoveAdHocTeamMemberCommand,
  RenameAdHocTeamRegistrationCommand,
  WithdrawAdHocTeamRegistrationCommand,
  type AdHocRegistrationMemberInput,
} from '../messages';

/**
 * Application handlers for ad-hoc team registrations (ADR 0007).
 *
 * Captain-only auth lives here. Cross-aggregate validation (event must be a
 * published tournament in ad-hoc mode, division must exist on the event)
 * happens at register-time only — subsequent edits trust the registration.
 */

function memberFromInput(
  input: AdHocRegistrationMemberInput,
  sortOrder: number,
): RegistrationMember {
  return RegistrationMember.create({
    id: randomUUID() as never as EventTeamRegistrationMemberId,
    userId: (input.userId ?? null) as UserId | null,
    displayName: input.displayName ?? null,
    email: input.email ?? null,
    sortOrder,
  });
}

export class RegisterAdHocTeamHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly registrations: EventTeamRegistrationRepository,
  ) {}

  async execute({
    eventId,
    divisionId,
    captainId,
    name,
    members,
    actingAsHost,
  }: RegisterAdHocTeamCommand): Promise<{ id: string }> {
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    if (event.type !== EventType.Tournament) {
      throw new InvariantViolation('Ad-hoc team registration is only available on tournaments.');
    }
    const division = event.divisions.find((d) => String(d.id) === divisionId);
    if (!division) throw new NotFoundError('division', divisionId);
    if (division.teamRegistrationMode !== TeamRegistrationMode.AdHoc) {
      throw new InvariantViolation('This division is not configured for ad-hoc team registration.');
    }

    // Host walk-in escape hatch: when the host is creating a walk-in
    // team for the bracket, they're a proxy captain rather than a
    // self-signup, so the "one team per captain per division" rule
    // doesn't apply. Verify they're actually the host before honoring
    // the flag.
    const isHostProxy = actingAsHost === true && String(event.hostId) === String(captainId);
    if (actingAsHost === true && !isHostProxy) {
      throw new UnauthorizedError('Only the event host can add a walk-in team.');
    }

    if (!isHostProxy) {
      // One team per division per captain. Withdrawing the prior
      // registration first is the intended escape hatch.
      const dup = await this.registrations.existsForCaptainInDivision(
        eventId,
        String(captainId),
        String(division.id),
      );
      if (dup) {
        throw new ConflictError(
          'You already have a team registered in this division. Withdraw it first if you need to start over.',
        );
      }
    }

    const registration = EventTeamRegistration.create({
      id: randomUUID() as never as EventTeamRegistrationId,
      eventId,
      divisionId: division.id as never as DivisionId,
      captainId: captainId as UserId,
      name,
      members: members.map((m, i) => memberFromInput(m, i)),
      source: isHostProxy ? RegistrationSource.Host : RegistrationSource.Captain,
    });
    await this.registrations.save(registration);
    return { id: String(registration.id) };
  }
}

async function loadOwned(
  repo: EventTeamRegistrationRepository,
  registrationId: string,
  requesterId: string,
): Promise<EventTeamRegistration> {
  const reg = await repo.findById(registrationId as never as EventTeamRegistrationId);
  if (!reg) throw new NotFoundError('event_team_registration', registrationId);
  if (String(reg.captainId) !== requesterId) {
    throw new UnauthorizedError('Only the team captain can manage this registration.');
  }
  return reg;
}

export class RenameAdHocTeamRegistrationHandler {
  constructor(private readonly repo: EventTeamRegistrationRepository) {}

  async execute({
    registrationId,
    requesterId,
    name,
  }: RenameAdHocTeamRegistrationCommand): Promise<void> {
    const reg = await loadOwned(this.repo, registrationId, requesterId);
    reg.rename(name);
    await this.repo.save(reg);
  }
}

export class AddAdHocTeamMemberHandler {
  constructor(private readonly repo: EventTeamRegistrationRepository) {}

  async execute({
    registrationId,
    requesterId,
    member,
  }: AddAdHocTeamMemberCommand): Promise<{ id: string }> {
    const reg = await loadOwned(this.repo, registrationId, requesterId);
    const slot = memberFromInput(member, reg.rosterSize);
    reg.addMember(slot);
    await this.repo.save(reg);
    return { id: String(slot.id) };
  }
}

export class RemoveAdHocTeamMemberHandler {
  constructor(private readonly repo: EventTeamRegistrationRepository) {}

  async execute({
    registrationId,
    requesterId,
    memberId,
  }: RemoveAdHocTeamMemberCommand): Promise<void> {
    const reg = await loadOwned(this.repo, registrationId, requesterId);
    reg.removeMember(memberId as never as EventTeamRegistrationMemberId);
    await this.repo.save(reg);
  }
}

export class WithdrawAdHocTeamRegistrationHandler {
  constructor(private readonly repo: EventTeamRegistrationRepository) {}

  async execute({
    registrationId,
    requesterId,
  }: WithdrawAdHocTeamRegistrationCommand): Promise<void> {
    const reg = await loadOwned(this.repo, registrationId, requesterId);
    // Captain-driven withdraw. If the registration is already paid, the
    // host needs to refund through Stripe first — surfaced as an
    // InvariantViolation at the boundary, but for now we only block the
    // ad-hoc path before checkout starts to keep this handler simple.
    if (reg.paymentStatus !== 'none') {
      throw new InvariantViolation(
        'Cannot withdraw a registration after checkout has started. Refund first.',
      );
    }
    await this.repo.delete(reg.id);
  }
}

/**
 * Host registers a walk-in team for the bracket (ADR 0017). The acting
 * caller must be the event host on a published tournament with an
 * ad-hoc division. The resulting row has `source = 'walk_in'`,
 * `captain_id = null`, and stores the captain's name + phone as
 * freeform text. Payment starts at `'none'`; the host marks it paid
 * later via {@link MarkWalkInPaidCashHandler}.
 */
export class RegisterWalkInTeamHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly registrations: EventTeamRegistrationRepository,
  ) {}

  async execute({
    eventId,
    divisionId,
    hostId,
    name,
    captainDisplayName,
    captainPhone,
    members,
  }: RegisterWalkInTeamCommand): Promise<{ id: string }> {
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    if (event.type !== EventType.Tournament) {
      throw new InvariantViolation('Walk-in registration is only available on tournaments.');
    }
    if (String(event.hostId) !== String(hostId)) {
      throw new UnauthorizedError('Only the event host can add a walk-in team.');
    }
    const division = event.divisions.find((d) => String(d.id) === divisionId);
    if (!division) throw new NotFoundError('division', divisionId);
    if (division.teamRegistrationMode !== TeamRegistrationMode.AdHoc) {
      throw new InvariantViolation('Walk-ins are only allowed in ad-hoc divisions.');
    }

    const registration = EventTeamRegistration.create({
      id: randomUUID() as never as EventTeamRegistrationId,
      eventId,
      divisionId: division.id as never as DivisionId,
      captainId: null,
      name,
      members: members.map((m, i) => memberFromInput(m, i)),
      source: RegistrationSource.WalkIn,
      captainDisplayName,
      captainPhone,
    });
    await this.registrations.save(registration);
    return { id: String(registration.id) };
  }
}

/**
 * Host marks a walk-in registration paid in cash (ADR 0017). Refuses to
 * touch captain / host-proxy rows (they have a real captain account and
 * already have either a Stripe path or the existing
 * `hostMarkTeamRegistrationPaid` flow). The price recorded is the
 * division's per-team price at the time of marking — the same source
 * the existing host action uses.
 */
export class MarkWalkInPaidCashHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly registrations: EventTeamRegistrationRepository,
  ) {}

  async execute({ registrationId, requesterId, note }: MarkWalkInPaidCashCommand): Promise<void> {
    const reg = await this.registrations.findById(
      registrationId as never as EventTeamRegistrationId,
    );
    if (!reg) throw new NotFoundError('event_team_registration', registrationId);
    const event = await this.events.findById(reg.eventId);
    if (!event) throw new NotFoundError('event', reg.eventId);
    if (String(event.hostId) !== String(requesterId)) {
      throw new UnauthorizedError('Only the event host can mark walk-in payments.');
    }
    const division = event.divisions.find((d) => String(d.id) === String(reg.divisionId));
    const amountCents = division?.priceCents ?? 0;
    // The aggregate enforces source = 'walk_in' and the payment-status
    // transition — wrap so any cross-aggregate state surfaces cleanly.
    reg.markPaidCash({ amountCents, paidAt: new Date(), note });
    await this.registrations.save(reg);
  }
}
