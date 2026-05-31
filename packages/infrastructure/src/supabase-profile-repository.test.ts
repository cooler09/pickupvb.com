import { describe, it, expect } from 'vitest';
import { escapeLike } from './supabase-profile-repository.js';

// `escapeLike` is the shared guard behind `searchCards` / `searchDirectory`
// (architecture audit P2-1). It must neutralise LIKE/ILIKE metacharacters so
// raw user search text is matched literally — without it, a user typing `%`
// would match everything and `_` would match any single char.
describe('escapeLike', () => {
  it('escapes % so it is matched literally', () => {
    expect(escapeLike('50%')).toBe('50\\%');
  });

  it('escapes _ so it is matched literally', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('escapes every occurrence', () => {
    expect(escapeLike('%_%')).toBe('\\%\\_\\%');
  });

  it('leaves text without wildcards unchanged', () => {
    expect(escapeLike('Jordan')).toBe('Jordan');
    expect(escapeLike('')).toBe('');
  });
});
