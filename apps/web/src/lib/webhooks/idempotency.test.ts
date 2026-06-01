import { describe, it, expect } from 'vitest';

import { decideWebhookProcessing } from './idempotency';

/**
 * Pins the orphan-recovery semantics (TPI-6): a claimed-but-never-processed row
 * (`processed_at IS NULL`) must be re-driven, not deduped — otherwise a crash
 * between claim and handler permanently loses the event.
 */
describe('decideWebhookProcessing', () => {
  it('processes a first-sight delivery (new row inserted)', () => {
    expect(decideWebhookProcessing(true, null)).toBe('process');
  });

  it('dedupes a redelivery of an already-processed event', () => {
    expect(decideWebhookProcessing(false, '2026-05-31T00:00:00.000Z')).toBe('deduped');
  });

  it('re-drives an orphaned claim (row exists but processed_at is null)', () => {
    // This is the regression guard: the old "dedupe on row existence" returned
    // deduped here and lost the event.
    expect(decideWebhookProcessing(false, null)).toBe('process');
  });
});
