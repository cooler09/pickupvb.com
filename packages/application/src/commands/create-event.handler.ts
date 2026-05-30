import { randomUUID } from 'node:crypto';
import {
  AgeGroup,
  Capacity,
  Division,
  DivisionId,
  EventId,
  EventType,
  Format,
  Gender,
  Location,
  PriceUnit,
  TeamComposition,
  UserId,
  VolleyballEvent,
  isEventPosition,
  skillTierFromLegacy,
  type AnalyticsPort,
  type EventPosition,
  type EventWriteStore,
  type EventExtensionsInput,
} from '@pickupvb/domain';
import type { DivisionInputDto, EventExtensionsDto } from '@pickupvb/types';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import { CreateEventCommand } from '../messages';

function buildExtensions(input: EventExtensionsDto | undefined): Partial<EventExtensionsInput> {
  if (!input) return {};
  // Map DTO `null`s to `null` and `undefined`s through so the aggregate's
  // `resolveExtensions` applies its own defaults.
  return {
    ...(input.venueName !== undefined ? { venueName: input.venueName } : {}),
    ...(input.registrationClosesAt !== undefined
      ? { registrationClosesAt: input.registrationClosesAt }
      : {}),
    ...(input.seriesName !== undefined ? { seriesName: input.seriesName } : {}),
    ...(input.seriesPosition !== undefined ? { seriesPosition: input.seriesPosition } : {}),
    ...(input.seriesSize !== undefined ? { seriesSize: input.seriesSize } : {}),
    ...(input.isFundraiser !== undefined ? { isFundraiser: input.isFundraiser } : {}),
    ...(input.fundraiserBeneficiary !== undefined
      ? { fundraiserBeneficiary: input.fundraiserBeneficiary }
      : {}),
    ...(input.themeTags !== undefined ? { themeTags: input.themeTags } : {}),
    ...(input.sanctioningBody !== undefined ? { sanctioningBody: input.sanctioningBody } : {}),
    ...(input.registrationMode !== undefined ? { registrationMode: input.registrationMode } : {}),
    ...(input.externalRegistrationUrl !== undefined
      ? { externalRegistrationUrl: input.externalRegistrationUrl }
      : {}),
    ...(input.externalRegistrationInstructions !== undefined
      ? { externalRegistrationInstructions: input.externalRegistrationInstructions }
      : {}),
    ...(input.paymentInstructions !== undefined
      ? { paymentInstructions: input.paymentInstructions }
      : {}),
    ...(input.paymentsOffPlatform !== undefined
      ? { paymentsOffPlatform: input.paymentsOffPlatform }
      : {}),
  };
}

export function divisionFromDto(input: DivisionInputDto, sortOrder: number): Division {
  const cap = input.capacity ?? null;
  return Division.create({
    id: DivisionId(randomUUID()),
    sortOrder: input.sortOrder ?? sortOrder,
    label: input.label,
    surface: input.surface,
    format: input.format,
    gender: input.gender,
    skillTier: input.skillTier,
    ageGroup: input.ageGroup ?? AgeGroup.Adult,
    tierLabel: input.tierLabel ?? null,
    teamComposition: input.teamComposition ?? TeamComposition.Solo,
    teamSize: input.teamSize ?? null,
    capacity: cap
      ? cap.kind === 'unlimited'
        ? Capacity.unlimited()
        : Capacity.fixed(cap.maxSpots)
      : null,
    priceCents: input.priceCents ?? null,
    priceUnit: input.priceUnit ?? PriceUnit.PerPlayer,
    prizeText: input.prizeText ?? null,
    prizePurseCents: input.prizePurseCents ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    allowFreeAgents: input.allowFreeAgents ?? true,
    teamRegistrationMode: input.teamRegistrationMode ?? null,
  });
}

/**
 * Pure handler — takes a port (EventWriteStore), returns a result.
 * No DI framework, no decorators, no HTTP coupling.
 */
export class CreateEventHandler {
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ hostId, dto }: CreateEventCommand): Promise<{ id: string }> {
    const id = EventId(randomUUID());

    let positionRoster: Map<EventPosition, number> | null = null;
    if (
      dto.type === EventType.OpenPlay &&
      dto.positionRoster &&
      Object.values(dto.positionRoster).some((n) => (n ?? 0) > 0)
    ) {
      positionRoster = new Map();
      for (const [pos, count] of Object.entries(dto.positionRoster)) {
        if (!isEventPosition(pos)) continue;
        if (typeof count === 'number' && count > 0) positionRoster.set(pos, count);
      }
    }

    let capacity: Capacity | undefined;
    if (dto.type === EventType.OpenPlay && !positionRoster && dto.capacity) {
      capacity =
        dto.capacity.kind === 'unlimited'
          ? Capacity.unlimited()
          : Capacity.fixed(dto.capacity.maxSpots);
    }

    const divisions = (dto.divisions ?? []).map((d, i) => divisionFromDto(d, i));

    // ADR 0006 Phase 9d: divisions are now the authority for skill/format/
    // gender/capacity. When the caller doesn't supply any, synthesize a
    // default one from the legacy top-level fields so the event is fully
    // formed without relying on a DB trigger.
    if (divisions.length === 0) {
      divisions.push(
        Division.create({
          id: DivisionId(randomUUID()),
          sortOrder: 0,
          label: 'All',
          surface: dto.surface,
          format: dto.format ?? Format.Sixes,
          gender: dto.gender ?? Gender.Coed,
          skillTier: skillTierFromLegacy(dto.skillLevel),
          ageGroup: AgeGroup.Adult,
          tierLabel: null,
          teamComposition:
            dto.type === EventType.OpenPlay ? TeamComposition.Solo : TeamComposition.Team,
          teamSize: null,
          capacity: capacity ?? null,
          priceCents: null,
          priceUnit: PriceUnit.PerPlayer,
          prizeText: null,
          prizePurseCents: null,
          startsAt: null,
          endsAt: null,
          // P2 #5 — open-play events have no free-agent pool by design
          // (every RSVP is individual). Force it off here so the
          // aggregate invariant doesn't reject the default division.
          ...(dto.type === EventType.OpenPlay ? { allowFreeAgents: false } : {}),
        }),
      );
    }

    const event = VolleyballEvent.create({
      id,
      hostId: UserId(hostId),
      title: dto.title,
      description: dto.description,
      rules: dto.rules,
      surface: dto.surface,
      type: dto.type,
      visibility: dto.visibility,
      location: Location.create(dto.location),
      ...(dto.timeZone ? { timeZone: dto.timeZone } : {}),
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      ...(capacity ? { capacity } : {}),
      ...(positionRoster ? { positionRoster } : {}),
      extensions: buildExtensions(dto.extensions),
      ...(divisions.length > 0 ? { divisions } : {}),
    });
    event.publish();

    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
    return { id: String(event.id) };
  }
}
