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

/**
 * Geocode an arbitrary query string to a single lat/lng. Returns null when
 * nothing matches (or the geocoder returns an unusable result). Throws only on
 * a transport-level failure. Shared by the structured address geocode and the
 * free-text place lookup below.
 */
async function geocodeQuery(q: string): Promise<GeocodeResult | null> {
  // Prod path: MapTiler.
  if (isMapTilerConfigured()) {
    return maptilerGeocodeOne(q);
  }

  // Local dev only (no key): OSM Nominatim.
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&countrycodes=${ALLOWED_COUNTRY_CODES}` +
    `&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    // Cache a day per identical query — keeps us under the rate limit.
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status}). Please try again.`);
  }

  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  const first = data[0];
  if (!first) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult> {
  const q = [input.addressLine, input.city, input.region, input.postalCode, input.country]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');

  const result = await geocodeQuery(q);
  if (!result) {
    throw new Error(
      'Could not find that address in the US. Double-check the street, city, and ZIP code.',
    );
  }
  return result;
}

/**
 * Free-text place lookup (city or ZIP) for the events-list location filter.
 * Returns null when the query is empty or nothing matches — the caller (a
 * search box, not a required form field) degrades gracefully instead of
 * erroring like {@link geocodeAddress}.
 */
export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;
  return geocodeQuery(q);
}
