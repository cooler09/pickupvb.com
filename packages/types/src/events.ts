import { z } from 'zod';
import {
  EVENT_POSITIONS,
  EventType,
  Format,
  Gender,
  SkillLevel,
  Surface,
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
  limit: z.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});
export type SearchEventsDto = z.infer<typeof SearchEventsSchema>;
