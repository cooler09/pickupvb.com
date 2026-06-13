import { describe, it, expect } from 'vitest';
import { externalLinkHref, isTrustedExternalUrl } from './external-link';

describe('isTrustedExternalUrl / externalLinkHref', () => {
  it('trusts our own host + curated volleyball platforms and their subdomains', () => {
    for (const u of [
      'https://pickupvb.com/community',
      'https://volleyballlife.com/event/123',
      'https://usav.volleyballlife.com/event/9', // affiliate subdomain
      'https://www.volosports.com/boston/volleyball',
      'https://cbva.com/tournaments/4642',
      'https://avp.com/avp-grass/schedule/',
      'https://www.sandbarslc.com/tournaments/',
    ]) {
      expect(isTrustedExternalUrl(u)).toBe(true);
      // Trusted → linked directly, no /leaving interstitial.
      expect(externalLinkHref(u)).toBe(u);
    }
  });

  it('routes unknown hosts through /leaving and refuses non-http schemes', () => {
    const evil = 'https://evil.example.com/x';
    expect(isTrustedExternalUrl(evil)).toBe(false);
    expect(externalLinkHref(evil)).toBe(`/leaving?url=${encodeURIComponent(evil)}`);
    expect(isTrustedExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('matches on the dot boundary — not a lookalike suffix', () => {
    expect(isTrustedExternalUrl('https://cbva.com.evil.com')).toBe(false);
    expect(isTrustedExternalUrl('https://notcbva.com')).toBe(false);
  });
});
