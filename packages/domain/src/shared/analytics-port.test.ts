import { describe, it, expectTypeOf } from 'vitest';
import type { AnalyticsTraits } from './analytics-port';

/**
 * Type-level guardrail for the analytics `identify` surface.
 *
 * Background: docs/audits/analytics.md P1 #4 — the `AnalyticsTraits`
 * interface is the only way actor-scoped metadata reaches the vendor
 * (PostHog). Slipping a PII field in here would route email / display
 * name / phone into a third-party in violation of the privacy posture
 * documented at the top of analytics-port.ts.
 *
 * The two tests below pin the surface in both directions:
 *  - exhaustiveness: `keyof AnalyticsTraits` must equal the allowlist,
 *    so removing or adding a key forces a deliberate code review here.
 *  - negative cases: common PII field names must NOT be assignable.
 *    Each `@ts-expect-error` would fail compilation if the rejection
 *    silently went away (e.g. someone changed the interface to an
 *    index signature like `[k: string]: unknown`).
 */
describe('AnalyticsTraits', () => {
  it('only allows the allowlisted, non-PII keys', () => {
    type AllowedKeys =
      | 'metroId'
      | 'skillTier'
      | 'accountAgeDays'
      | 'isAnonymous'
      | 'utmSource'
      | 'utmMedium'
      | 'utmCampaign';
    // Mutually exhaustive: if any new key is added, this fails.
    expectTypeOf<keyof AnalyticsTraits>().toEqualTypeOf<AllowedKeys>();
  });

  it('rejects common PII field names at the type level', () => {
    // @ts-expect-error - email is PII; never add it to traits.
    const _t1: AnalyticsTraits = { email: 'x@y.z' };
    // @ts-expect-error - displayName is PII.
    const _t2: AnalyticsTraits = { displayName: 'A' };
    // @ts-expect-error - phone is PII.
    const _t3: AnalyticsTraits = { phone: '555-0100' };
    // @ts-expect-error - fullName is PII.
    const _t4: AnalyticsTraits = { fullName: 'Jane Doe' };
    // @ts-expect-error - ipAddress is PII.
    const _t5: AnalyticsTraits = { ipAddress: '127.0.0.1' };
    // @ts-expect-error - address is PII.
    const _t6: AnalyticsTraits = { address: '1 Main St' };
    void _t1;
    void _t2;
    void _t3;
    void _t4;
    void _t5;
    void _t6;
  });
});
