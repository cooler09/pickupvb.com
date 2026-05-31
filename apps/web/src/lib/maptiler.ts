import 'server-only';

/**
 * Server-side geocoding via MapTiler — the paid, SLA-backed replacement for the
 * free OpenStreetMap endpoints (Nominatim/Photon) that forbid autocomplete and
 * IP-ban at volume (third-party-integrations audit TPI-1).
 *
 * Keyed by `MAPTILER_API_KEY` (server-only — distinct from the public,
 * domain-restricted `NEXT_PUBLIC_MAPTILER_KEY` used for map tiles, which a
 * referrer-restricted key can't satisfy for serverless requests). When the key
 * is absent the callers fall back to the OSM endpoints — local-dev only, never
 * prod volume.
 *
 * Docs: https://docs.maptiler.com/cloud/api/geocoding/
 */

const GEOCODE_BASE = 'https://api.maptiler.com/geocoding';
// US + populated US territories (ISO 3166-1 alpha-2), matching the OSM path.
const ALLOWED_COUNTRIES = 'us,pr,vi,gu,mp,as';

export type GeoSuggestion = {
  label: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
};

export function isMapTilerConfigured(): boolean {
  return Boolean(process.env['MAPTILER_API_KEY']);
}

type MapTilerContext = { id?: string; text?: string; country_code?: string };
export type MapTilerFeature = {
  geometry?: { coordinates?: [number, number] };
  text?: string;
  place_name?: string;
  /** House number on address-level results (street name is in `text`). */
  address?: string;
  context?: MapTilerContext[];
};

/**
 * Pure parse of a MapTiler geocoding FeatureCollection's features into our
 * suggestion shape. Exported (and side-effect-free) so the mapping — the part
 * most likely to drift against the provider's response — is unit-tested without
 * a network call or an API key.
 */
export function parseMapTilerFeatures(features: MapTilerFeature[]): GeoSuggestion[] {
  const out: GeoSuggestion[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const ctx = f.context ?? [];
    const ctxText = (prefix: string): string =>
      ctx.find((c) => c.id?.startsWith(prefix))?.text ?? '';

    const street = (f.text ?? '').trim();
    const addressLine = (f.address ? `${f.address} ${street}` : street).trim();
    // MapTiler uses `place`/`municipality` for the city level depending on the
    // locality type; fall through the likely ids.
    const city = ctxText('place.') || ctxText('municipality.') || ctxText('municipal_district.');
    const region = ctxText('region.');
    const postalCode = ctxText('postal_code.');
    const country = ctxText('country.');

    if (!addressLine && !city) continue;

    out.push({
      label:
        f.place_name ?? [addressLine, city, region, postalCode, country].filter(Boolean).join(', '),
      addressLine,
      city,
      region,
      postalCode,
      country,
      latitude: lat,
      longitude: lon,
    });
  }
  return out;
}

async function fetchGeocoding(
  q: string,
  limit: number,
  autocomplete: boolean,
): Promise<MapTilerFeature[]> {
  const key = process.env['MAPTILER_API_KEY'];
  if (!key) return [];
  const url =
    `${GEOCODE_BASE}/${encodeURIComponent(q)}.json` +
    `?key=${key}&country=${ALLOWED_COUNTRIES}&limit=${limit}&autocomplete=${autocomplete}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(2500),
    // Cache identical queries — typeahead keystrokes for an hour, a full address
    // geocode for a day (matches the OSM-path cache windows).
    next: { revalidate: autocomplete ? 3600 : 86400 },
  });
  if (!res.ok) throw new Error(`maptiler geocoding ${res.status}`);
  const data = (await res.json()) as { features?: MapTilerFeature[] };
  return data.features ?? [];
}

/** Typeahead suggestions (up to 6). Throws on a MapTiler error; callers degrade. */
export async function maptilerAutocomplete(q: string): Promise<GeoSuggestion[]> {
  return parseMapTilerFeatures(await fetchGeocoding(q, 6, true));
}

/** Single best match for a full address. Returns null when nothing is found. */
export async function maptilerGeocodeOne(
  q: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const first = parseMapTilerFeatures(await fetchGeocoding(q, 1, false))[0];
  return first ? { latitude: first.latitude, longitude: first.longitude } : null;
}
