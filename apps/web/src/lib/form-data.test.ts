import { describe, it, expect } from 'vitest';
import { bool, field, fieldOrNull, fieldOrUndefined, FIELD_HARD_MAX } from './form-data';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe('field', () => {
  it('reads a bare key', () => {
    expect(field(fd({ email: ' alice@example.com ' }), 'email')).toBe('alice@example.com');
  });

  it('reads a slot-prefixed key (useFormState quirk)', () => {
    expect(field(fd({ '1_email': 'bob@example.com' }), 'email')).toBe('bob@example.com');
  });

  it('returns empty string when missing', () => {
    expect(field(fd({}), 'email')).toBe('');
  });

  it('prefers the bare key over a slot-prefixed match', () => {
    expect(field(fd({ email: 'bare', '1_email': 'slot' }), 'email')).toBe('bare');
  });

  it('does NOT match a non-digit prefix', () => {
    // Only `\d+_<name>` should match — guard against accidental collisions.
    expect(field(fd({ foo_email: 'no' }), 'email')).toBe('');
  });
});

describe('fieldOrUndefined', () => {
  it('returns undefined for empty', () => {
    expect(fieldOrUndefined(fd({ email: '  ' }), 'email')).toBeUndefined();
  });

  it('returns the trimmed value when present', () => {
    expect(fieldOrUndefined(fd({ email: 'a' }), 'email')).toBe('a');
  });
});

describe('fieldOrNull', () => {
  it('returns null for empty', () => {
    expect(fieldOrNull(fd({}), 'x')).toBeNull();
  });

  it('truncates to maxLen', () => {
    expect(fieldOrNull(fd({ x: 'abcdef' }), 'x', 3)).toBe('abc');
  });
});

describe('bool', () => {
  it('true when value present', () => {
    expect(bool(fd({ ok: 'on' }), 'ok')).toBe(true);
  });

  it('false when missing', () => {
    expect(bool(fd({}), 'ok')).toBe(false);
  });

  it('false when value is empty string', () => {
    expect(bool(fd({ ok: '' }), 'ok')).toBe(false);
  });

  it('respects slot-prefixed keys', () => {
    expect(bool(fd({ '1_ok': 'on' }), 'ok')).toBe(true);
  });
});

describe('FIELD_HARD_MAX', () => {
  it('truncates oversized bare keys', () => {
    const huge = 'a'.repeat(FIELD_HARD_MAX + 500);
    expect(field(fd({ x: huge }), 'x')).toHaveLength(FIELD_HARD_MAX);
  });

  it('truncates oversized slot-prefixed keys', () => {
    const huge = 'b'.repeat(FIELD_HARD_MAX * 2);
    expect(field(fd({ '1_x': huge }), 'x')).toHaveLength(FIELD_HARD_MAX);
  });

  it('caps fieldOrNull even when a larger maxLen is passed', () => {
    const huge = 'c'.repeat(FIELD_HARD_MAX + 1000);
    expect(fieldOrNull(fd({ x: huge }), 'x', FIELD_HARD_MAX + 1000)).toHaveLength(FIELD_HARD_MAX);
  });

  it('still honors a smaller per-call maxLen', () => {
    const huge = 'd'.repeat(FIELD_HARD_MAX);
    expect(fieldOrNull(fd({ x: huge }), 'x', 10)).toHaveLength(10);
  });
});
