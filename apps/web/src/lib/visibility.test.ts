import { describe, expect, it } from 'vitest';
import { normalizeVisibility } from './visibility';

describe('normalizeVisibility', () => {
  it('returns public when no value is submitted', () => {
    expect(normalizeVisibility(undefined)).toBe('public');
    expect(normalizeVisibility(null)).toBe('public');
    expect(normalizeVisibility('')).toBe('public');
  });

  it('returns public for unknown values', () => {
    expect(normalizeVisibility('secret')).toBe('public');
    expect(normalizeVisibility('PRIVATE')).toBe('public');
  });

  it('passes every recognized visibility through — no Pro gate', () => {
    expect(normalizeVisibility('public')).toBe('public');
    expect(normalizeVisibility('invite_only')).toBe('invite_only');
    expect(normalizeVisibility('friends_of_host')).toBe('friends_of_host');
    expect(normalizeVisibility('friends_of_attendees')).toBe('friends_of_attendees');
  });
});
