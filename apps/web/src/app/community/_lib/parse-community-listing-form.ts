import { ZodError } from 'zod';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { geocodeAddress } from '@/lib/geocode';
import { timeZoneForCoords } from '@/lib/timezone';

/** Error/success state both community-listing form actions return to the client. */
export type CommunityListingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type ParseCommunityListingResult<T> =
  | { ok: true; dto: T }
  | { ok: false; state: CommunityListingFormState };

const SURFACE_VALUES = ['indoor', 'grass', 'sand'] as const;
const FORMAT_VALUES = ['sixes', 'quads', 'triples', 'doubles'] as const;
const SKILL_VALUES = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;

function pickOrNull<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Shared `FormData` → DTO parser for the community-listing **submit** and
 * **edit** actions (audit CU-5). Both built the identical pipeline inline:
 * assemble the optional location (geocoding it when present), build the raw
 * field bag, and `schema.parse` it. Extracted here so the two actions stay thin
 * and can't drift. Never throws — every failure path returns a typed
 * `{ ok: false, state }` the caller can `return` straight back to `useFormState`.
 *
 * The `schema` is passed in (Create adds an `endsAt > startsAt` refinement;
 * Update is `.partial()`), so this stays generic over the parsed DTO type.
 */
export async function parseCommunityListingForm<T>(
  formData: FormData,
  schema: { parse(input: unknown): T },
): Promise<ParseCommunityListingResult<T>> {
  // Location is optional. If any address bits are provided, we require enough to
  // geocode (city + country at minimum). If none are provided, location is null.
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
        ok: false,
        state: {
          error: 'Please include at least a city and country, or clear the address fields.',
          fieldErrors: {
            'location.city': !city ? 'City required' : '',
            'location.country': !country ? 'Country required' : '',
          },
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
      return {
        ok: false,
        state: { error: message, fieldErrors: { 'location.addressLine': message } },
      };
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
    timeZone: location ? timeZoneForCoords(location.latitude, location.longitude) : null,
    surface: pickOrNull(fieldOrUndefined(formData, 'surface'), SURFACE_VALUES),
    format: pickOrNull(fieldOrUndefined(formData, 'format'), FORMAT_VALUES),
    skillLevel: pickOrNull(fieldOrUndefined(formData, 'skillLevel'), SKILL_VALUES),
  };

  try {
    return { ok: true, dto: schema.parse(raw) };
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      return { ok: false, state: { error: 'Please fix the highlighted fields.', fieldErrors } };
    }
    return { ok: false, state: { error: 'Could not parse form input.' } };
  }
}
