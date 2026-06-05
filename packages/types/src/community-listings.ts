import { z } from 'zod';
import { Format, SkillLevel, Surface } from '@pickupvb/domain';

const enumValues = <T extends Record<string, string>>(e: T) =>
  Object.values(e) as [T[keyof T], ...T[keyof T][]];

export const ListingLocationSchema = z.object({
  addressLine: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(100),
  region: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().min(2).max(100),
  // Coordinates are optional: present when the address geocoded, null when it
  // didn't (the listing keeps its text address but has no map point).
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

const CommunityListingFields = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(4000).default(''),
  externalUrl: z.string().url(),
  externalHostName: z.string().max(120).optional().nullable(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  location: ListingLocationSchema.optional().nullable(),
  /** IANA timezone name resolved from venue coords. */
  timeZone: z.string().max(60).optional().nullable(),
  surface: z.enum(enumValues(Surface)).optional().nullable(),
  format: z.enum(enumValues(Format)).optional().nullable(),
  skillLevel: z.enum(enumValues(SkillLevel)).optional().nullable(),
});

export const CreateCommunityListingSchema = CommunityListingFields.refine(
  (d): boolean => d.endsAt == null || (d.endsAt as Date) > (d.startsAt as Date),
  { message: 'endsAt must be after startsAt', path: ['endsAt'] },
);
export type CreateCommunityListingDto = z.infer<typeof CreateCommunityListingSchema>;

export const UpdateCommunityListingSchema = CommunityListingFields.partial();
export type UpdateCommunityListingDto = z.infer<typeof UpdateCommunityListingSchema>;

export const SearchCommunityListingsSchema = z.object({
  near: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number().positive().max(500),
    })
    .optional(),
  surface: z.enum(enumValues(Surface)).optional(),
  format: z.enum(enumValues(Format)).optional(),
  skillLevel: z.enum(enumValues(SkillLevel)).optional(),
  startsAfter: z.coerce.date().optional(),
  startsBefore: z.coerce.date().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});
export type SearchCommunityListingsDto = z.infer<typeof SearchCommunityListingsSchema>;
