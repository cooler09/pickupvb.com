import { describe, expect, it } from 'vitest';
import { clampVisibilityForHost, isGatedVisibility } from './visibility';

describe('clampVisibilityForHost', () => {
  it('returns public when no value is submitted', () => {
    expect(clampVisibilityForHost(undefined, true)).toBe('public');
    expect(clampVisibilityForHost(null, true)).toBe('public');
    expect(clampVisibilityForHost('', true)).toBe('public');
  });

  it('returns public for unknown values', () => {
    expect(clampVisibilityForHost('secret', true)).toBe('public');
    expect(clampVisibilityForHost('PRIVATE', true)).toBe('public');
  });

  it('passes public through regardless of Pro status', () => {
    expect(clampVisibilityForHost('public', false)).toBe('public');
    expect(clampVisibilityForHost('public', true)).toBe('public');
  });

  it('clamps gated values to public for non-Pro hosts', () => {
    expect(clampVisibilityForHost('invite_only', false)).toBe('public');
    expect(clampVisibilityForHost('friends_of_host', false)).toBe('public');
    expect(clampVisibilityForHost('friends_of_attendees', false)).toBe('public');
  });

  it('passes gated values through for Pro hosts', () => {
    expect(clampVisibilityForHost('invite_only', true)).toBe('invite_only');
    expect(clampVisibilityForHost('friends_of_host', true)).toBe('friends_of_host');
    expect(clampVisibilityForHost('friends_of_attendees', true)).toBe('friends_of_attendees');
  });
});

describe('isGatedVisibility', () => {
  it('flags non-public modes', () => {
    expect(isGatedVisibility('public')).toBe(false);
    expect(isGatedVisibility('invite_only')).toBe(true);
    expect(isGatedVisibility('friends_of_host')).toBe(true);
    expect(isGatedVisibility('friends_of_attendees')).toBe(true);
  });
});
