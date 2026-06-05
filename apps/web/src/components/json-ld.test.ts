import { describe, it, expect } from 'vitest';
import { jsonLdString } from './json-ld';

// Regression guard for the community-listings audit CL-3 (stored XSS via
// JSON-LD). `JSON.stringify` leaves `<` raw, so a user-controlled string value
// embedded in an inline `<script type="application/ld+json">` could close the
// tag early with `</script>` and inject markup. These tests fail if anyone
// reverts the escaping in `jsonLdString`.
describe('jsonLdString', () => {
  it('escapes </script> so a malicious title cannot break out of the inline script', () => {
    const out = jsonLdString({
      name: 'Beach night </script><script>alert(document.cookie)</script>',
    });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c/script');
  });

  it('escapes the U+2028 / U+2029 line terminators that break inline scripts', () => {
    const out = jsonLdString({ a: '\u2028', b: '\u2029' });
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('stays valid JSON that round-trips back to the original value', () => {
    const data = { name: 'Erie <doubles> </script>', n: 2, sep: '\u2028' };
    expect(JSON.parse(jsonLdString(data))).toEqual(data);
  });
});
