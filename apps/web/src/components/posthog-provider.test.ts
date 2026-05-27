import { describe, it, expect } from 'vitest';
import { shouldInitPostHog } from './posthog-provider';

// The provider's two-condition gate is the audit-relevant invariant.
// If either of these flips silently we'd be shipping the PostHog
// browser SDK to users who declined (or crashing on a missing key).
// Keep this test the same shape as
// [analytics.test.ts](../lib/analytics.test.ts) — pure decision,
// no React render needed.
describe('shouldInitPostHog', () => {
  it('returns true when consent is granted and an apiKey is configured', () => {
    expect(shouldInitPostHog({ allowed: true, apiKey: 'phc_test' })).toBe(true);
  });

  it('returns false when consent is denied even with an apiKey', () => {
    expect(shouldInitPostHog({ allowed: false, apiKey: 'phc_test' })).toBe(false);
  });

  it('returns false when no apiKey is configured even with consent', () => {
    expect(shouldInitPostHog({ allowed: true, apiKey: undefined })).toBe(false);
  });

  it('returns false when an empty-string apiKey is configured', () => {
    expect(shouldInitPostHog({ allowed: true, apiKey: '' })).toBe(false);
  });
});
