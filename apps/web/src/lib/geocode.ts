/**
 * Server-side geocoding for the single address geocode on event create/edit.
 *
 * Primary (prod): MapTiler, keyed by `MAPTILER_API_KEY` (TPI-1).
 * Fallback (local dev only, no key): OpenStreetMap Nominatim — free, 1 req/sec,
 * not for production volume.
 */
import { isMapTilerConfigured, maptilerGeocodeOne } from './maptiler';

export type GeocodeInput = {
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'pickupvb.com/1.0 (+https://pickupvb.com)';

// US + populated US territories (ISO 3166-1 alpha-2).
const ALLOWED_COUNTRY_CODES = 'us,pr,vi,gu,mp,as';

export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult> {
  const q = [input.addressLine, input.city, input.region, input.postalCode, input.country]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');

  // Prod path: MapTiler.
  if (isMapTilerConfigured()) {
    const result = await maptilerGeocodeOne(q);
    if (!result) {
      throw new Error(
        'Could not find that address in the US. Double-check the street, city, and ZIP code.',
      );
    }
    return result;
  }

  // Local dev only (no key): OSM Nominatim.
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&countrycodes=${ALLOWED_COUNTRY_CODES}` +
    `&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    // Cache a day per identical address — keeps us under the rate limit.
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status}). Please try again.`);
  }

  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  const first = data[0];
  if (!first) {
    throw new Error(
      'Could not find that address in the US. Double-check the street, city, and ZIP code.',
    );
  }

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Geocoder returned an invalid result. Please try a more specific address.');
  }

  return { latitude, longitude };
}
