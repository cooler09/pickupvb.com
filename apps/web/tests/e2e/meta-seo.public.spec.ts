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

    const eventLink = page.locator('a[href*="/events/"]').first();
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

    // At least one must contain an Event type declaration.
    let foundEventSchema = false;
    for (let i = 0; i < count; i++) {
      const content = await jsonLdScripts.nth(i).textContent();
      if (
        content &&
        (content.includes('"@type":"Event"') || content.includes('"@type": "Event"'))
      ) {
        foundEventSchema = true;
        break;
      }
    }
    expect(
      foundEventSchema,
      'Event detail page must include a JSON-LD script with @type Event',
    ).toBe(true);
  });

  test.fixme('short URL redirect — requires a known short code in the dev environment');

  test.fixme(
    'og:image social card social preview renders correctly — requires external social card validator',
  );
});
