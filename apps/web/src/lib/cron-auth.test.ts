import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCronAuthorized } from './cron-auth';

/**
 * Security audit P2 #13: cron routes must fail **closed** in production when
 * `CRON_SECRET` is unset, not fall open. These tests pin that — the previous
 * per-route `if (!secret) return true` left every admin-client cron (incl. the
 * destructive account-deletion sweep) world-invokable on a prod misconfig.
 */

const ORIGINAL_SECRET = process.env['CRON_SECRET'];
const ORIGINAL_NODE_ENV = process.env['NODE_ENV'];

function reqWithAuth(value: string | null): Request {
  return new Request('https://example.com/api/notifications/worker', {
    headers: value === null ? {} : { authorization: value },
  });
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  setEnv('CRON_SECRET', ORIGINAL_SECRET);
  setEnv('NODE_ENV', ORIGINAL_NODE_ENV);
});

describe('isCronAuthorized — secret configured', () => {
  beforeEach(() => setEnv('CRON_SECRET', 's3cret-token'));

  it('accepts the exact Bearer token', () => {
    expect(isCronAuthorized(reqWithAuth('Bearer s3cret-token'))).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isCronAuthorized(reqWithAuth('Bearer nope'))).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    expect(isCronAuthorized(reqWithAuth(null))).toBe(false);
  });

  it('rejects a token that is a prefix of the secret (length guard)', () => {
    expect(isCronAuthorized(reqWithAuth('Bearer s3cret'))).toBe(false);
  });
});

describe('isCronAuthorized — secret unset (the fail-open regression)', () => {
  beforeEach(() => setEnv('CRON_SECRET', undefined));

  it('fails CLOSED in production', () => {
    setEnv('NODE_ENV', 'production');
    expect(isCronAuthorized(reqWithAuth(null))).toBe(false);
    expect(isCronAuthorized(reqWithAuth('Bearer anything'))).toBe(false);
  });

  it('allows the local dev fallback outside production', () => {
    setEnv('NODE_ENV', 'development');
    expect(isCronAuthorized(reqWithAuth(null))).toBe(true);
  });
});
