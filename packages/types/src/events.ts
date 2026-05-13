import { z } from 'zod';
import {
    EventType,
    Format,
    Gender,
    SkillLevel,
    Surface,
    Visibility,
} from '@pickupvb/domain/events';

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
        format: z.enum(enumValues(Format)),
        gender: z.enum(enumValues(Gender)),
        skillLevel: z.enum(enumValues(SkillLevel)),
        type: z.enum(enumValues(EventType)),
        visibility: z.enum(enumValues(Visibility)),
        location: LocationSchema,
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        capacity: z
            .union([
                z.object({ kind: z.literal('unlimited') }),
                z.object({ kind: z.literal('fixed'), maxSpots: z.number().int().positive() }),
            ])
            .optional(),
    })
    .refine((d) => d.endsAt > d.startsAt, {
        message: 'endsAt must be after startsAt',
        path: ['endsAt'],
    })
    .refine(
        (d) => d.type !== EventType.OpenPlay || d.capacity !== undefined,
        { message: 'Open-play events require a capacity', path: ['capacity'] },
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
