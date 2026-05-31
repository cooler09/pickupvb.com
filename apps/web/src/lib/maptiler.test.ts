import { describe, it, expect } from 'vitest';

import { parseMapTilerFeatures, type MapTilerFeature } from './maptiler';

/**
 * Pins the MapTiler geocoding response → suggestion mapping (TPI-1). This is the
 * part most likely to silently drift against the provider's shape (context-id
 * prefixes, [lon,lat] order, house-number-in-`address`), so it's unit-tested
 * with sample payloads rather than trusted blind.
 */
const ADDRESS_FEATURE: MapTilerFeature = {
  geometry: { coordinates: [-76.2859, 36.8508] }, // [lon, lat]
  text: 'Granby Street',
  address: '420',
  place_name: '420 Granby Street, Norfolk, Virginia 23510, United States',
  context: [
    { id: 'postal_code.23510', text: '23510' },
    { id: 'place.123', text: 'Norfolk' },
    { id: 'region.456', text: 'Virginia' },
    { id: 'country.us', text: 'United States', country_code: 'us' },
  ],
};

describe('parseMapTilerFeatures', () => {
  it('maps an address feature to the suggestion shape with [lon,lat] flipped', () => {
    const [s] = parseMapTilerFeatures([ADDRESS_FEATURE]);
    expect(s).toEqual({
      label: '420 Granby Street, Norfolk, Virginia 23510, United States',
      addressLine: '420 Granby Street',
      city: 'Norfolk',
      region: 'Virginia',
      postalCode: '23510',
      country: 'United States',
      latitude: 36.8508,
      longitude: -76.2859,
    });
  });

  it('falls back to municipality for the city level when no place.* context', () => {
    const [s] = parseMapTilerFeatures([
      {
        ...ADDRESS_FEATURE,
        context: [
          { id: 'municipality.9', text: 'Virginia Beach' },
          { id: 'region.456', text: 'Virginia' },
        ],
      },
    ]);
    expect(s!.city).toBe('Virginia Beach');
  });

  it('handles a city-level feature (no house number) without dropping it', () => {
    const [s] = parseMapTilerFeatures([
      {
        geometry: { coordinates: [-76.0, 36.0] },
        text: 'Norfolk',
        place_name: 'Norfolk, Virginia, United States',
        context: [{ id: 'region.1', text: 'Virginia' }],
      },
    ]);
    expect(s!.addressLine).toBe('Norfolk');
    expect(s!.latitude).toBe(36.0);
  });

  it('drops features with missing or non-finite coordinates', () => {
    expect(parseMapTilerFeatures([{ text: 'No geometry' }])).toHaveLength(0);
    expect(
      parseMapTilerFeatures([{ geometry: { coordinates: [Number.NaN, 1] }, text: 'Bad' }]),
    ).toHaveLength(0);
  });

  it('drops features with neither an address line nor a city', () => {
    expect(
      parseMapTilerFeatures([{ geometry: { coordinates: [-76, 36] }, context: [] }]),
    ).toHaveLength(0);
  });
});
