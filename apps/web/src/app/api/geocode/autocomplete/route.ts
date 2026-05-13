import { NextRequest, NextResponse } from 'next/server';

/**
 * Address autocomplete proxy.
 * Uses Photon (https://photon.komoot.io) — free, no API key, OSM-based,
 * designed for typeahead. We proxy server-side to keep our User-Agent
 * polite and to make it easy to swap providers later.
 */

export const dynamic = 'force-dynamic';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const USER_AGENT = 'pickupvb.com/1.0 (+https://pickupvb.com)';

// US + populated US territories (ISO 3166-1 alpha-2, lowercase to match Photon).
const ALLOWED_COUNTRY_CODES = new Set(['us', 'pr', 'vi', 'gu', 'mp', 'as']);

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

    const label = [p.name && p.name !== street ? p.name : null, addressLine, city, region, postalCode, country]
        .filter(Boolean)
        .join(', ');

    return { label, addressLine, city, region, postalCode, country, latitude: lat, longitude: lon };
}

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length < 3) return NextResponse.json({ suggestions: [] });

    const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=6&lang=en`;

    let res: Response;
    try {
        res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            next: { revalidate: 3600 },
        });
    } catch {
        return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    if (!res.ok) return NextResponse.json({ suggestions: [] }, { status: 200 });

    const data = (await res.json()) as { features?: PhotonFeature[] };
    const suggestions = (data.features ?? [])
        .filter((f) => {
            const cc = f.properties.countrycode?.toLowerCase();
            return cc !== undefined && ALLOWED_COUNTRY_CODES.has(cc);
        })
        .map(toSuggestion)
        .filter((s): s is AutocompleteSuggestion => s !== null);

    return NextResponse.json({ suggestions });
}
