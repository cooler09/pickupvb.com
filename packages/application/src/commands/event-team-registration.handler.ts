import { randomUUID } from 'node:crypto';
import {
  EventTeamRegistration,
  EventType,
  ConflictError,
  NotFoundError,
  RegistrationMember,
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
  RegisterAdHocTeamCommand,
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
  }: RegisterAdHocTeamCommand): Promise<{ id: string }> {
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    if (event.type !== EventType.Tournament) {
      throw new InvariantViolation('Ad-hoc team registration is only available on tournaments.');
    }
    if (event.teamRegistrationMode !== TeamRegistrationMode.AdHoc) {
      throw new InvariantViolation('This event is not configured for ad-hoc team registration.');
    }
    const division = event.divisions.find((d) => String(d.id) === divisionId);
    if (!division) throw new NotFoundError('division', divisionId);

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

    const registration = EventTeamRegistration.create({
      id: randomUUID() as never as EventTeamRegistrationId,
      eventId,
      divisionId: division.id as never as DivisionId,
      captainId: captainId as UserId,
      name,
      members: members.map((m, i) => memberFromInput(m, i)),
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
