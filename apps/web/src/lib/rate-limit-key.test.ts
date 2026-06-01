import { describe, it, expect } from 'vitest';
import { rateLimitKey } from './rate-limit-key';

// Privacy audit P3 #10: `rate_limits.key` must never persist a raw email / IP.
// These pin the two properties the fix depends on — the raw actor is gone from
// the key, and the hash is still deterministic so the fixed-window lookup hits
// the same row across requests.
describe('rateLimitKey', () => {
  it('never embeds the raw email or IP', () => {
    const emailKey = rateLimitKey('guest-signup', 'email', 'Alice@Example.com');
    expect(emailKey).not.toContain('Alice');
    expect(emailKey).not.toContain('example.com');
    expect(emailKey.startsWith('guest-signup:email:')).toBe(true);

    const ipKey = rateLimitKey('claim', 'ip', '203.0.113.7');
    expect(ipKey).not.toContain('203.0.113.7');
    expect(ipKey.startsWith('claim:ip:')).toBe(true);
  });

  it('is deterministic so the fixed-window lookup still resolves', () => {
    expect(rateLimitKey('claim', 'email', 'a@b.com')).toBe(
      rateLimitKey('claim', 'email', 'a@b.com'),
    );
  });

  it('treats case + surrounding whitespace as the same email actor', () => {
    expect(rateLimitKey('x', 'email', '  Bob@B.com ')).toBe(
      rateLimitKey('x', 'email', 'bob@b.com'),
    );
  });

  it('separates distinct actors, dimensions, and scopes', () => {
    expect(rateLimitKey('x', 'email', 'a@b.com')).not.toBe(rateLimitKey('x', 'email', 'c@d.com'));
    expect(rateLimitKey('x', 'ip', 'a@b.com')).not.toBe(rateLimitKey('x', 'email', 'a@b.com'));
    expect(rateLimitKey('x', 'email', 'a@b.com')).not.toBe(rateLimitKey('y', 'email', 'a@b.com'));
  });
});
