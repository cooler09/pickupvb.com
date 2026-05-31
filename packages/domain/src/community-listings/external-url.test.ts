import { describe, expect, it } from 'vitest';
import { ValidationError } from '../shared/result.js';
import { ExternalUrl } from './external-url.js';

// `ExternalUrl` is the validated off-platform link on a community listing
// (untested before — architecture audit P3-4). Rules: absolute URL, https
// only, and never one of our own hosts (listings point off-platform).

describe('ExternalUrl.create', () => {
  it('accepts an absolute https URL on an external host', () => {
    expect(ExternalUrl.create('https://meetup.com/vb').value).toBe('https://meetup.com/vb');
  });

  it('trims surrounding whitespace', () => {
    expect(ExternalUrl.create('  https://meetup.com/vb  ').value).toBe('https://meetup.com/vb');
  });

  it('rejects empty / missing input', () => {
    expect(() => ExternalUrl.create('')).toThrow(ValidationError);
    expect(() => ExternalUrl.create('   ')).toThrow(ValidationError);
  });

  it('rejects a non-absolute or unparseable URL', () => {
    expect(() => ExternalUrl.create('meetup.com/vb')).toThrow(ValidationError);
    expect(() => ExternalUrl.create('not a url')).toThrow(ValidationError);
  });

  it('rejects non-https schemes', () => {
    expect(() => ExternalUrl.create('http://meetup.com/vb')).toThrow(ValidationError);
  });

  it('rejects our own hosts (case-insensitively)', () => {
    expect(() => ExternalUrl.create('https://pickupvb.com/events/1')).toThrow(ValidationError);
    expect(() => ExternalUrl.create('https://WWW.PickupVB.com/x')).toThrow(ValidationError);
    expect(() => ExternalUrl.create('https://localhost/x')).toThrow(ValidationError);
  });

  it('fromPersistence bypasses validation for stored values', () => {
    expect(ExternalUrl.fromPersistence('http://anything').value).toBe('http://anything');
  });
});
