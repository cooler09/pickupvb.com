import { NextRequest, NextResponse } from 'next/server';
import { isMapTilerConfigured, maptilerAutocomplete } from '@/lib/maptiler';
import { log } from '@/lib/log';

/**
 * Address autocomplete proxy.
 *
 * Primary (prod): MapTiler geocoding — paid, SLA-backed, autocomplete-allowed
 * (third-party-integrations audit TPI-1). Used whenever `MAPTILER_API_KEY` is
 * set.
 *
 * Fallback (local dev only, no key): Photon (https://photon.komoot.io) then
 * Nominatim (https://nominatim.openstreetmap.org) — the free OSM endpoints. These
 * forbid autocomplete + IP-ban at volume, so they must NOT carry production
 * traffic; they exist only so address entry works in dev without a key.
 *
 * All providers are proxied server-side so the key never reaches the browser and
 * provider swaps stay isolated here.
 */

export const dynamic = 'force-dynamic';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'pickupvb.com/1.0 (+https://pickupvb.com)';

// US + populated US territories (ISO 3166-1 alpha-2, lowercase to match Photon).
const ALLOWED_COUNTRY_CODES = new Set(['us', 'pr', 'vi', 'gu', 'mp', 'as']);
const NOMINATIM_COUNTRY_CODES = 'us,pr,vi,gu,mp,as';

export type AutocompleteSuggestion = {
  label: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
};

type PhotonProperties = {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
  type?: string;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: PhotonProperties;
};

function toSuggestion(f: PhotonFeature): AutocompleteSuggestion | null {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const street = [p.housenumber, p.street].filter(Boolean).join(' ').trim();
  const addressLine = street || p.name || '';
  const city = p.city ?? '';
  const region = p.state ?? '';
  const postalCode = p.postcode ?? '';
  const country = p.country ?? '';

  if (!addressLine && !city) return null;

  const label = [
    p.name && p.name !== street ? p.name : null,
    addressLine,
    city,
    region,
    postalCode,
    country,
  ]
    .filter(Boolean)
    .join(', ');

  return { label, addressLine, city, region, postalCode, country, latitude: lat, longitude: lon };
}

async function fetchPhoton(q: string): Promise<AutocompleteSuggestion[] | null> {
  const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=6&lang=en`;
  try {
    // 1.5s upstream timeout — autocomplete keystrokes are latency-critical
    // and the Nominatim fallback handles the slow-Photon case cleanly.
    // See performance audit P2 #10. AbortSignal.timeout throws a
    // `TimeoutError` (DOMException) which the surrounding catch swallows
    // to null, triggering the Nominatim fallback.
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return (data.features ?? [])
      .filter((f) => {
        const cc = f.properties.countrycode?.toLowerCase();
        return cc !== undefined && ALLOWED_COUNTRY_CODES.has(cc);
      })
      .map(toSuggestion)
      .filter((s): s is AutocompleteSuggestion => s !== null);
  } catch {
    return null;
  }
}

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    amenity?: string;
    building?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

function fromNominatim(r: NominatimResult): AutocompleteSuggestion | null {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const a = r.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(' ').trim();
  const addressLine = street || a.amenity || a.building || '';
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? '';
  const region = a.state ?? '';
  const postalCode = a.postcode ?? '';
  const country = a.country ?? '';
  if (!addressLine && !city) return null;
  return {
    label: r.display_name,
    addressLine,
    city,
    region,
    postalCode,
    country,
    latitude: lat,
    longitude: lon,
  };
}

async function fetchNominatim(q: string): Promise<AutocompleteSuggestion[]> {
  const url =
    `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&limit=6` +
    `&countrycodes=${NOMINATIM_COUNTRY_CODES}&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimResult[];
    return data.map(fromNominatim).filter((s): s is AutocompleteSuggestion => s !== null);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  // Prod path: MapTiler. On a MapTiler outage we degrade to empty suggestions
  // (the address fields stay manually editable) rather than falling back to the
  // OSM endpoints — they must never carry production typeahead volume.
  if (isMapTilerConfigured()) {
    try {
      const suggestions = await maptilerAutocomplete(q);
      return NextResponse.json({ suggestions });
    } catch (err) {
      log.warn('[geocode/autocomplete] maptiler failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ suggestions: [] });
    }
  }

  // Local dev only (no key): OSM Photon → Nominatim.
  const fromPhoton = await fetchPhoton(q);
  if (fromPhoton && fromPhoton.length > 0) {
    return NextResponse.json({ suggestions: fromPhoton });
  }
  // Photon errored or returned nothing useful — fall back to Nominatim.
  const fromNominatimResults = await fetchNominatim(q);
  return NextResponse.json({ suggestions: fromNominatimResults });
}
