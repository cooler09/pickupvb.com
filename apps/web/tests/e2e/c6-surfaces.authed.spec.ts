import { test, expect } from './_helpers/fixtures';

/**
 * C6 (e2e coverage audit) — authed half: the financial CSV exports return a real
 * CSV for a signed-in user (the public spec covers the unauthenticated 401).
 * Uses the per-worker authed `page.request`, so the session cookies authenticate
 * the download. An attendee with no receipts / earnings still gets a 200,
 * header-only CSV — the route is RLS-scoped, not gated on having any rows.
 */

const YEAR = new Date().getFullYear();

test.describe('C6 surfaces — authed CSV exports', () => {
  test('receipts statement.csv returns a CSV for the signed-in user', async ({ page }) => {
    const res = await page.request.get(`/api/receipts/${YEAR}/statement.csv`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toMatch(/text\/csv/i);
    expect(res.headers()['content-disposition'] ?? '').toMatch(/attachment/i);
  });

  test('earnings statement.csv returns a CSV for the signed-in user', async ({ page }) => {
    const res = await page.request.get(`/api/earnings/${YEAR}/statement.csv`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toMatch(/text\/csv/i);
  });
});
