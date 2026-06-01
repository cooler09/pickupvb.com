import { describe, it, expect } from 'vitest';
import { parseRawPattern } from 'obscenity';
import { ContentModeration, contentModeration } from './content-moderation.js';
import { ValidationError } from '../shared/result.js';

// A benign sentinel so the *mechanism* tests don't hardcode real slurs — the
// default Tier-B list is exercised separately, with a single representative
// term. `parseRawPattern` (not the `pattern` tag) builds a pattern from a
// dynamic string; the tag treats `${…}` as pattern-AST nodes, not text.
// No doubled letters: the recommended transformers collapse duplicate chars in
// the input, so a `zz` pattern wouldn't match input collapsed to `z`.
const SENTINEL = 'sentinelblok';
const sentinelModeration = new ContentModeration({ extremePatterns: [parseRawPattern(SENTINEL)] });

describe('ContentModeration — mask policy (public surfaces)', () => {
  it('leaves clean text untouched', () => {
    const r = contentModeration.screen('great match today, nice serve', 'mask');
    expect(r.cleaned).toBe('great match today, nice serve');
    expect(r.hadProfanity).toBe(false);
  });

  it('masks Tier-A profanity and flags it, preserving surrounding text', () => {
    const r = contentModeration.screen('this is fuck you', 'mask');
    expect(r.hadProfanity).toBe(true);
    expect(r.cleaned).not.toContain('fuck');
    expect(r.cleaned).toContain('this is');
    expect(r.cleaned).toContain('you');
    expect(r.cleaned).toContain('*');
  });

  it('defeats leetspeak obfuscation', () => {
    const r = contentModeration.screen('what the sh1t', 'mask');
    expect(r.hadProfanity).toBe(true);
    expect(r.cleaned).not.toContain('sh1t');
  });

  it('does not mask an allowlisted place name (Scunthorpe problem)', () => {
    const r = contentModeration.screen('I play in Scunthorpe', 'mask');
    expect(r.cleaned).toBe('I play in Scunthorpe');
    expect(r.hadProfanity).toBe(false);
  });
});

describe('ContentModeration — block-extreme policy (private DMs)', () => {
  it('allows Tier-A profanity unchanged but reports it', () => {
    const r = contentModeration.screen('what the fuck', 'block-extreme');
    expect(r.cleaned).toBe('what the fuck');
    expect(r.hadProfanity).toBe(true);
  });

  it('leaves clean text untouched', () => {
    const r = contentModeration.screen('see you at the court', 'block-extreme');
    expect(r.cleaned).toBe('see you at the court');
    expect(r.hadProfanity).toBe(false);
  });

  it('blocks Tier-B extreme content with a ValidationError', () => {
    expect(() => sentinelModeration.screen(`go away ${SENTINEL}`, 'block-extreme')).toThrow(
      ValidationError,
    );
  });
});

describe('ContentModeration — Tier-B blocks on every surface', () => {
  it('blocks extreme content even under the mask policy (not merely censored)', () => {
    // The whole point: extreme content must never leak onto a public page as a
    // masked string — it throws before masking runs.
    expect(() => sentinelModeration.screen(`public ${SENTINEL} post`, 'mask')).toThrow(
      ValidationError,
    );
  });

  it('the default Tier-B list is wired (blocks a known slur)', () => {
    // One real, representative slur to prove DEFAULT_EXTREME_PATTERNS is live.
    expect(() => contentModeration.screen('you are a retard', 'block-extreme')).toThrow(
      ValidationError,
    );
  });

  it('the ValidationError carries the VALIDATION code and an extreme reason', () => {
    try {
      sentinelModeration.screen(SENTINEL, 'block-extreme');
      expect.unreachable('expected screen() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).code).toBe('VALIDATION');
      expect((e as ValidationError).details?.reason).toBe('extreme');
    }
  });
});
