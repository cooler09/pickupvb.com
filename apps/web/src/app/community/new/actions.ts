'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { CreateCommunityListingSchema } from '@pickupvb/types';
import { CreateCommunityListingCommand } from '@pickupvb/application';
import { RateLimitError, ValidationError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { requireRealUser } from '@/lib/server-auth';
import { geocodeAddress } from '@/lib/geocode';

export type CreateCommunityListingState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const SURFACE_VALUES = ['indoor', 'grass', 'sand'] as const;
const FORMAT_VALUES = ['sixes', 'quads', 'triples', 'doubles'] as const;
const SKILL_VALUES = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;

function pickOrNull<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export async function createCommunityListingAction(
  _prev: CreateCommunityListingState,
  formData: FormData,
): Promise<CreateCommunityListingState> {
  const viewer = await requireRealUser('/community/new');

  // Location is optional. If any address bits are provided, we require enough
  // to geocode (city + country at minimum). If none are provided, location is null.
  const addressLine = fieldOrUndefined(formData, 'addressLine');
  const city = fieldOrUndefined(formData, 'city');
  const region = fieldOrUndefined(formData, 'region');
  const postalCode = fieldOrUndefined(formData, 'postalCode');
  const country = fieldOrUndefined(formData, 'country');
  const hasAnyAddress = Boolean(addressLine || city || region || postalCode || country);

  let location: {
    addressLine: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
    latitude: number;
    longitude: number;
  } | null = null;

  if (hasAnyAddress) {
    if (!city || !country) {
      return {
        error: 'Please include at least a city and country, or clear the address fields.',
        fieldErrors: {
          'location.city': !city ? 'City required' : '',
          'location.country': !country ? 'Country required' : '',
        },
      };
    }
    let coords: { latitude: number; longitude: number };
    try {
      coords = await geocodeAddress({
        addressLine: addressLine ?? '',
        city,
        region: region ?? '',
        postalCode: postalCode ?? '',
        country,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not geocode address.';
      return { error: message, fieldErrors: { 'location.addressLine': message } };
    }
    location = {
      addressLine: addressLine ?? null,
      city,
      region: region ?? null,
      postalCode: postalCode ?? null,
      country,
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
  }

  const raw = {
    title: field(formData, 'title'),
    description: field(formData, 'description'),
    externalUrl: field(formData, 'externalUrl'),
    externalHostName: fieldOrUndefined(formData, 'externalHostName') ?? null,
    startsAt: field(formData, 'startsAt'),
    endsAt: fieldOrUndefined(formData, 'endsAt') ?? null,
    location,
    surface: pickOrNull(fieldOrUndefined(formData, 'surface'), SURFACE_VALUES),
    format: pickOrNull(fieldOrUndefined(formData, 'format'), FORMAT_VALUES),
    skillLevel: pickOrNull(fieldOrUndefined(formData, 'skillLevel'), SKILL_VALUES),
  };

  let dto;
  try {
    dto = CreateCommunityListingSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      return { error: 'Please fix the highlighted fields.', fieldErrors };
    }
    return { error: 'Could not parse form input.' };
  }

  let result: { id: string; slug: string };
  try {
    result = await handlers.createCommunityListing.execute(
      new CreateCommunityListingCommand(viewer.user.id, dto),
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        error: "You've reached the daily submission limit. Try again tomorrow.",
      };
    }
    if (err instanceof ValidationError) {
      return { error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Failed to submit listing.';
    return { error: message };
  }

  revalidatePath('/community');
  redirect(`/community/${result.slug}?notice=submitted`);
}
