import { z } from 'zod';
import {
  AgeGroup,
  EVENT_POSITIONS,
  EventType,
  Format,
  Gender,
  PriceUnit,
  RegistrationMode,
  SkillBand,
  SkillLevel,
  SkillTier,
  Surface,
  TeamComposition,
  TeamRegistrationMode,
  Visibility,
} from '@pickupvb/domain';

const enumValues = <T extends Record<string, string>>(e: T) =>
  Object.values(e) as [T[keyof T], ...T[keyof T][]];

export const LocationSchema = z.object({
  addressLine: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  region: z.string().max(100),
  postalCode: z.string().max(20),
  country: z.string().min(2).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * Per-ADR-0006 event-level extension fields. All optional — the create
 * handler resolves missing values to safe defaults (e.g. `registrationMode`
 * defaults to `platform`, `isFundraiser` to false).
 */
export const EventExtensionsSchema = z.object({
  venueName: z.string().max(200).optional().nullable(),
  registrationClosesAt: z.coerce.date().optional().nullable(),
  seriesName: z.string().max(120).optional().nullable(),
  seriesPosition: z.number().int().positive().optional().nullable(),
  seriesSize: z.number().int().positive().optional().nullable(),
  isFundraiser: z.boolean().optional(),
  fundraiserBeneficiary: z.string().max(200).optional().nullable(),
  themeTags: z.array(z.string().min(1).max(40)).max(16).optional(),
  sanctioningBody: z.string().max(60).optional().nullable(),
  registrationMode: z.enum(enumValues(RegistrationMode)).optional(),
  externalRegistrationUrl: z.string().url().max(2048).optional().nullable(),
  externalRegistrationInstructions: z.string().max(2000).optional().nullable(),
  paymentInstructions: z.string().max(2000).optional().nullable(),
  /** When true, host collects payment off-platform (no Stripe). */
  paymentsOffPlatform: z.boolean().optional(),
  /**
   * ADR 0007 team paradigm. `null` for individual signup; `ad_hoc` (default
   * for tournaments) for one-off captain-assembled rosters; `roster` for
   * registering a persistent {@link Team}.
   */
  teamRegistrationMode: z.enum(enumValues(TeamRegistrationMode)).optional().nullable(),
});
export type EventExtensionsDto = z.infer<typeof EventExtensionsSchema>;

/**
 * Input shape for one division on create / add. Server assigns the id.
 */
export const DivisionInputSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  label: z.string().min(1).max(60),
  surface: z.enum(enumValues(Surface)),
  format: z.enum(enumValues(Format)),
  gender: z.enum(enumValues(Gender)),
  skillTier: z.enum(enumValues(SkillTier)),
  ageGroup: z.enum(enumValues(AgeGroup)).optional(),
  tierLabel: z.string().max(40).optional().nullable(),
  teamComposition: z.enum(enumValues(TeamComposition)).optional(),
  teamSize: z.number().int().min(1).max(24).optional().nullable(),
  capacity: z
    .union([
      z.object({ kind: z.literal('unlimited') }),
      z.object({ kind: z.literal('fixed'), maxSpots: z.number().int().positive() }),
    ])
    .optional()
    .nullable(),
  priceCents: z.number().int().min(0).max(1_000_000).optional().nullable(),
  priceUnit: z.enum(enumValues(PriceUnit)).optional(),
  prizeText: z.string().max(500).optional().nullable(),
  prizePurseCents: z.number().int().min(0).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
});
export type DivisionInputDto = z.infer<typeof DivisionInputSchema>;

/** Update payload — same shape, all optional, label still bounded when present. */
export const DivisionUpdateSchema = DivisionInputSchema.partial();
export type DivisionUpdateDto = z.infer<typeof DivisionUpdateSchema>;

export const CreateEventSchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().max(4000).default(''),
    rules: z.string().max(4000).default(''),
    surface: z.enum(enumValues(Surface)),
    format: z.enum(enumValues(Format)).optional(),
    gender: z.enum(enumValues(Gender)).optional(),
    skillLevel: z.enum(enumValues(SkillLevel)),
    type: z.enum(enumValues(EventType)),
    visibility: z.enum(enumValues(Visibility)),
    location: LocationSchema,
    /** IANA timezone name resolved from venue coords. */
    timeZone: z.string().max(60).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    capacity: z
      .union([
        z.object({ kind: z.literal('unlimited') }),
        z.object({ kind: z.literal('fixed'), maxSpots: z.number().int().positive() }),
      ])
      .optional(),
    /**
     * Optional positional sign-up roster (open-play only). Map of position
     * → spot count. Total capacity is the sum of values; positions with
     * `0` aren't selectable. When provided, `capacity` is ignored.
     */
    positionRoster: z
      .record(z.enum(EVENT_POSITIONS as readonly [string, ...string[]]), z.number().int().min(0))
      .optional(),
    /** ADR 0006 event-level extension fields. Optional. */
    extensions: EventExtensionsSchema.optional(),
    /**
     * ADR 0006 divisions. When omitted, the handler creates the event
     * without any divisions; the DB will continue to expose the legacy
     * single-row bracket via the backfilled default until the host adds one.
     */
    divisions: z.array(DivisionInputSchema).max(32).optional(),
  })
  .refine((d): boolean => (d.endsAt as Date) > (d.startsAt as Date), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine(
    (d) => {
      if (d.type !== EventType.OpenPlay) return true;
      if (d.positionRoster && Object.values(d.positionRoster).some((n) => n > 0)) return true;
      return d.capacity !== undefined;
    },
    { message: 'Open-play events require a capacity or position roster', path: ['capacity'] },
  )
  .refine(
    (d) => d.type !== EventType.Tournament || (d.format !== undefined && d.gender !== undefined),
    { message: 'Tournaments require format and gender', path: ['format'] },
  );

export type CreateEventDto = z.infer<typeof CreateEventSchema>;

export const SearchEventsSchema = z.object({
  near: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number().positive().max(500),
    })
    .optional(),
  surface: z.enum(enumValues(Surface)).optional(),
  format: z.enum(enumValues(Format)).optional(),
  gender: z.enum(enumValues(Gender)).optional(),
  skillLevel: z.enum(enumValues(SkillLevel)).optional(),
  type: z.enum(enumValues(EventType)).optional(),
  startsAfter: z.coerce.date().optional(),
  startsBefore: z.coerce.date().optional(),
  // ---- Division-level filters (ADR 0006) -----------------------------------
  skillBand: z.enum(enumValues(SkillBand)).optional(),
  ageGroup: z.enum(enumValues(AgeGroup)).optional(),
  teamComposition: z.enum(enumValues(TeamComposition)).optional(),
  seriesName: z.string().trim().min(1).max(120).optional(),
  registrationMode: z.enum(enumValues(RegistrationMode)).optional(),
  isFundraiser: z.coerce.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});
export type SearchEventsDto = z.infer<typeof SearchEventsSchema>;
