import {
  AgeGroup,
  Capacity,
  Division,
  DivisionId,
  NotFoundError,
  PriceUnit,
  TeamComposition,
  type AnalyticsPort,
  type EventWriteStore,
} from '@pickupvb/domain';
import { divisionFromDto } from './create-event.handler';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import {
  AddEventDivisionCommand,
  RemoveEventDivisionCommand,
  UpdateEventDivisionCommand,
} from '../messages/index';

/**
 * Authorization is enforced at the server-action boundary
 * (`assertCanManage` in division-actions.ts), NOT here: the shared
 * `SupabaseEventRepository.save()` these handlers call runs on the
 * service-role admin client (the `save_event` RPC is INVOKER but the
 * production adapter calls it as service role), so the `event_divisions` RLS
 * policies never fire (AGENTS.md pitfall #8). Do not re-delegate authorization
 * to RLS from this layer. (Security audit P1 #12.)
 *
 * `requesterId` is reserved for future audit columns.
 */
export class AddEventDivisionHandler {
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, input }: AddEventDivisionCommand): Promise<{ id: string }> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    const sortOrder =
      input.sortOrder ??
      (event.divisions.length === 0 ? 0 : Math.max(...event.divisions.map((d) => d.sortOrder)) + 1);
    const division = divisionFromDto(input, sortOrder);
    event.addDivision(division);
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
    return { id: String(division.id) };
  }
}

export class UpdateEventDivisionHandler {
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, divisionId, updates }: UpdateEventDivisionCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    const current = event.divisions.find((d) => String(d.id) === divisionId);
    if (!current) throw new NotFoundError('division', divisionId);

    // Merge: any field omitted from `updates` falls back to the current
    // value. Explicit `null` clears nullable fields.
    const cap =
      updates.capacity === undefined
        ? current.capacity
        : updates.capacity === null
          ? null
          : updates.capacity.kind === 'unlimited'
            ? Capacity.unlimited()
            : Capacity.fixed(updates.capacity.maxSpots);

    const next = Division.create({
      id: current.id,
      sortOrder: updates.sortOrder ?? current.sortOrder,
      label: updates.label ?? current.label,
      surface: updates.surface ?? current.surface,
      format: updates.format ?? current.format,
      gender: updates.gender ?? current.gender,
      skillTier: updates.skillTier ?? current.skillTier,
      ageGroup: updates.ageGroup ?? current.ageGroup ?? AgeGroup.Adult,
      tierLabel: updates.tierLabel === undefined ? current.tierLabel : updates.tierLabel,
      teamComposition: updates.teamComposition ?? current.teamComposition ?? TeamComposition.Solo,
      teamSize: updates.teamSize === undefined ? current.teamSize : updates.teamSize,
      capacity: cap,
      priceCents: updates.priceCents === undefined ? current.priceCents : updates.priceCents,
      priceUnit: updates.priceUnit ?? current.priceUnit ?? PriceUnit.PerPlayer,
      prizeText: updates.prizeText === undefined ? current.prizeText : updates.prizeText,
      prizePurseCents:
        updates.prizePurseCents === undefined ? current.prizePurseCents : updates.prizePurseCents,
      startsAt: updates.startsAt === undefined ? current.startsAt : updates.startsAt,
      endsAt: updates.endsAt === undefined ? current.endsAt : updates.endsAt,
      allowFreeAgents:
        updates.allowFreeAgents === undefined ? current.allowFreeAgents : updates.allowFreeAgents,
      teamRegistrationMode:
        updates.teamRegistrationMode === undefined
          ? current.teamRegistrationMode
          : updates.teamRegistrationMode,
    });
    event.updateDivision(next);
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}

export class RemoveEventDivisionHandler {
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, divisionId }: RemoveEventDivisionCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.removeDivision(DivisionId(divisionId));
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}
