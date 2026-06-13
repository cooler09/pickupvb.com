import { describe, expect, it } from 'vitest';
import { decodeEwkbHexPoint, parsePointFromGeo } from './supabase-community-listing-repository.js';

// Real EWKB-hex payloads as PostgREST returns them for the `geo` geography
// column (captured from the dev DB). Before this decode path the community map
// + listing JSON-LD silently dropped every coordinate because the helper only
// understood GeoJSON / WKT — see the EWKB-hex decode fix.
const ELDERTON_PA = '0101000020E6100000F0236D99C2D553C0574A8567F8584440';
const PITTSBURGH_PA = '0101000020E61000007EA59828670054C04600811832384440';

describe('decodeEwkbHexPoint', () => {
  it('decodes a little-endian EWKB point with an SRID flag', () => {
    const p = decodeEwkbHexPoint(ELDERTON_PA);
    expect(p).not.toBeNull();
    expect(p?.latitude).toBeCloseTo(40.6950807, 5);
    expect(p?.longitude).toBeCloseTo(-79.3400024, 5);
  });

  it('decodes a second point (longitude/latitude order is not swapped)', () => {
    const p = decodeEwkbHexPoint(PITTSBURGH_PA);
    expect(p?.latitude).toBeCloseTo(40.4390288, 5);
    expect(p?.longitude).toBeCloseTo(-80.0062963, 5);
  });

  it('returns null for non-hex, too-short, or non-point payloads', () => {
    expect(decodeEwkbHexPoint('not-hex')).toBeNull();
    expect(decodeEwkbHexPoint('0101')).toBeNull();
    expect(decodeEwkbHexPoint('')).toBeNull();
    // Odd-length hex.
    expect(decodeEwkbHexPoint('0101000020E6100000F')).toBeNull();
  });
});

describe('parsePointFromGeo', () => {
  it('decodes the EWKB-hex string PostgREST actually returns', () => {
    const p = parsePointFromGeo(ELDERTON_PA);
    expect(p?.latitude).toBeCloseTo(40.6950807, 5);
    expect(p?.longitude).toBeCloseTo(-79.3400024, 5);
  });

  it('still accepts GeoJSON point objects', () => {
    const p = parsePointFromGeo({ type: 'Point', coordinates: [-79.34, 40.695] });
    expect(p).toEqual({ latitude: 40.695, longitude: -79.34 });
  });

  it('still accepts WKT text with an SRID prefix', () => {
    const p = parsePointFromGeo('SRID=4326;POINT(-79.34 40.695)');
    expect(p?.latitude).toBeCloseTo(40.695, 5);
    expect(p?.longitude).toBeCloseTo(-79.34, 5);
  });

  it('returns null when there is no point', () => {
    expect(parsePointFromGeo(null)).toBeNull();
    expect(parsePointFromGeo(undefined)).toBeNull();
    expect(parsePointFromGeo('garbage')).toBeNull();
  });
});
