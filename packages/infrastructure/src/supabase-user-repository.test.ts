import { describe, it, expect } from 'vitest';
import { isUniqueViolation } from './supabase-user-repository.js';

// `isUniqueViolation` is the guard `SupabaseUserRepository.save` uses to map a
// handle-collision (Postgres `unique_violation`, SQLSTATE 23505) to a typed
// `ConflictError` (ADR 0020). Mis-detecting it would surface a generic 500 on
// the "handle already taken" path instead of a friendly form error.
describe('isUniqueViolation', () => {
  it('is true for a 23505 PostgrestError', () => {
    expect(isUniqueViolation({ code: '23505', message: 'duplicate key' })).toBe(true);
  });

  it('is false for any other error code', () => {
    expect(isUniqueViolation({ code: '23503', message: 'fk violation' })).toBe(false);
    expect(isUniqueViolation({ message: 'no code' })).toBe(false);
  });

  it('is false for null / undefined', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
