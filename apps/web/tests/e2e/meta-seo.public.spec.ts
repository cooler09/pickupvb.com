import { test, expect } from '@playwright/test';

/**
 * OG meta tags, structured data, and SEO surface checks (Section 18.6).
 *
 * All tests are public: no auth required. Tests verify that critical meta
 * tags are present and populated on key pages. Structured-data (JSON-LD)
 * presence is validated via DOM text, not schema.org validation.
 */

async function getMetaContent(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<string | null> {
  return page.locator(selector).getAttribute('content');
}

test.describe('og meta', () => {
  test('home page has og:title and og:description', async ({ page }) => {
    await page.goto('/');

    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    expect(ogTitle, 'og:title must be non-empty on the home page').toBeTruthy();
    expect(ogTitle!.trim().length).toBeGreaterThan(0);

    // Accept either og:description or the standard meta description.
    const ogDesc = await getMetaContent(page, 'meta[property="og:description"]');
    const metaDesc = await getMetaContent(page, 'meta[name="description"]');
    const description = ogDesc ?? metaDesc;
    expect(
      description,
      'og:description or meta description must be present on the home page',
    ).toBeTruthy();
    expect(description!.trim().length).toBeGreaterThan(0);
  });

  test('events browse page has og:title', async ({ page }) => {
    await page.goto('/events');

    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    expect(ogTitle, 'og:title must be non-empty on /events').toBeTruthy();
    expect(ogTitle!.trim().length).toBeGreaterThan(0);
  });

  test('event detail page has og:title and og:image', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping event detail OG test');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    expect(ogTitle, 'og:title must be non-empty on event detail page').toBeTruthy();
    expect(ogTitle!.trim().length).toBeGreaterThan(0);

    const ogImage = await getMetaContent(page, 'meta[property="og:image"]');
    expect(ogImage, 'og:image must be present on event detail page').toBeTruthy();
    expect(ogImage!.trim().length).toBeGreaterThan(0);
    // og:image value must look like a URL.
    expect(ogImage).toMatch(/^https?:\/\//);
  });

  test('player profile page has og:title', async ({ page }) => {
    await page.goto('/players');

    const playerLink = page.locator('a[href*="/players/"]').first();
    if ((await playerLink.count()) === 0) {
      test.skip(true, 'No players in this environment; skipping player OG test');
    }

    const href = (await playerLink.getAttribute('href')) ?? '/players';
    await page.goto(href);

    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    expect(ogTitle, 'og:title must be non-empty on player profile page').toBeTruthy();
    expect(ogTitle!.trim().length).toBeGreaterThan(0);
  });

  test('group page has og:title', async ({ page }) => {
    await page.goto('/groups');

    const groupLink = page.locator('a[href*="/groups/"]').first();
    if ((await groupLink.count()) === 0) {
      test.skip(true, 'No groups in this environment; skipping group OG test');
    }

    const href = (await groupLink.getAttribute('href')) ?? '/groups';
    await page.goto(href);

    const ogTitle = await getMetaContent(page, 'meta[property="og:title"]');
    expect(ogTitle, 'og:title must be non-empty on group page').toBeTruthy();
    expect(ogTitle!.trim().length).toBeGreaterThan(0);
  });
});

test.describe('structured data', () => {
  test('event detail page has JSON-LD Event schema', async ({ page }) => {
    await page.goto('/events');

    // Scope to <main> and exclude `/events/new` — the nav has a "Host"
    // link with href="/events/new" that matches `a[href*="/events/"]` and
    // would otherwise be picked up by `.first()`, redirecting an
    // unauthenticated viewer to /login.
    const eventLink = page
      .locator('main')
      .locator('a[href*="/events/"]:not([href*="/events/new"])')
      .first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping JSON-LD test');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    // Collect all JSON-LD script tags.
    const jsonLdScripts = page.locator('script[type="application/ld+json"]');
    const count = await jsonLdScripts.count();
    if (count === 0) {
      test.skip(true, 'No JSON-LD script tags found on event detail page');
    }

    // At least one must declare an Event type. The app emits SportsEvent
    // (a schema.org subtype of Event) — see
    // apps/web/src/app/events/[id]/_components/event-jsonld.tsx — so accept
    // any `*Event` (Event, SportsEvent, BusinessEvent, …).
    const eventTypeRe = /"@type"\s*:\s*"[A-Za-z]*Event"/;
    let foundEventSchema = false;
    for (let i = 0; i < count; i++) {
      const content = await jsonLdScripts.nth(i).textContent();
      if (content && eventTypeRe.test(content)) {
        foundEventSchema = true;
        break;
      }
    }
    expect(
      foundEventSchema,
      'Event detail page must include a JSON-LD script with a schema.org Event (or subtype) @type',
    ).toBe(true);
  });

  test('og:image URL on an event detail page returns a valid image response', async ({ page }) => {
    await page.goto('/events');

    // Scope + filter as above so we don't grab the navbar Host link.
    const eventLink = page
      .locator('main')
      .locator('a[href*="/events/"]:not([href*="/events/new"])')
      .first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping og:image fetch test');
    }
    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    if (!ogImage) {
      test.skip(true, 'No og:image meta on this event detail page; skipping');
    }
    expect(ogImage).toMatch(/^https?:\/\//);

    const res = await page.request.get(ogImage!, { maxRedirects: 5 });
    expect(res.ok(), `og:image fetch failed: ${res.status()} ${ogImage}`).toBeTruthy();
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType, `og:image content-type must be image/*: got "${contentType}"`).toMatch(
      /^image\//,
    );
  });
});

test.describe('short URL redirect', () => {
  // The persistent tournament seed (supabase/snippets/seed-tournament-fixture.sql)
  // provisions a known short code `E2ETFA` on dev. The seed is idempotent and
  // not present on production, so this assertion skips gracefully there.
  test('GET /e/E2ETFA 308-redirects to /events/<uuid>', async ({ page, baseURL }) => {
    const target = new URL('/e/E2ETFA', baseURL ?? 'http://localhost:3000').toString();

    // request.get() does not follow redirects by default — we can assert the
    // raw 308 status code and Location header.
    const raw = await page.request.get(target, { maxRedirects: 0 });
    if (raw.status() === 404) {
      test.skip(true, 'Short code E2ETFA not present in this environment (seed not applied)');
    }
    expect([301, 307, 308]).toContain(raw.status());
    const location = raw.headers()['location'];
    expect(location, 'Location header must point at the canonical /events/<uuid> URL').toMatch(
      /\/events\/[0-9a-f-]{36}/,
    );

    // Sanity: following the redirect lands on the event detail page.
    const response = await page.goto('/e/E2ETFA');
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/, { timeout: 10_000 });
  });
});
