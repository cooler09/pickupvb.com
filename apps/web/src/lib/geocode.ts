/**
 * Server-side geocoding via OpenStreetMap Nominatim.
 * Free, no API key. Usage policy: max 1 req/sec, must set User-Agent.
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * For higher volume, swap to Mapbox / Google Geocoding by replacing this module.
 */

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

export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult> {
    const q = [input.addressLine, input.city, input.region, input.postalCode, input.country]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', ');

    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(q)}`;

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
            'Could not find that address. Double-check the street, city, and postal code.',
        );
    }

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error('Geocoder returned an invalid result. Please try a more specific address.');
    }

    return { latitude, longitude };
}
