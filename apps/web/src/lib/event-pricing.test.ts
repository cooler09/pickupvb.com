import { describe, it, expect, vi } from 'vitest';

// `event-pricing.ts` pulls server-only sibling modules at import time
// (`./supabase` → @supabase/ssr cookies; `./pro` & `./admin` → `./handlers`,
// which constructs repositories). We're exercising the pure `tipPlatformFeeCents`
// helper, so stub those siblings the same way `analytics.test.ts` isolates its
// unit under test — otherwise the import graph tries to stand up a real
// Supabase/handlers stack.
vi.mock('./supabase', () => ({ getServerSupabase: vi.fn() }));
vi.mock('./stripe', () => ({
  platformFeeCents: (c: number) => Math.round(c * 0.05),
  processingFeeCents: (c: number) => Math.ceil(c * 0.029) + 30,
}));
vi.mock('./pro', () => ({ PRO_PLATFORM_FEE_BPS: 250 }));
vi.mock('./admin', () => ({ hasProBenefits: vi.fn() }));

import { tipPlatformFeeCents } from './event-pricing';

describe('tipPlatformFeeCents — PickupVB takes no platform fee on tips (ADR 0014 amendment)', () => {
  it('returns 0 for any tip amount, on every tier', () => {
    // Tier-independent on purpose: tips are fee-free for Free and Pro hosts
    // alike, so the helper takes no host id and never consults Pro status.
    for (const cents of [0, 100, 500, 2_000, 50_000]) {
      expect(tipPlatformFeeCents(cents)).toBe(0);
    }
  });
});
