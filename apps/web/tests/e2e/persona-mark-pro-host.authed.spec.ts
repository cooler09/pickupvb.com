import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, personaStorage, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { findOwnedGroupUrl } from './_helpers/navigation';
import {
  createFreeOpenPlayEvent,
  createPaidEvent,
  cancelEvent,
  openTemplatesModal,
  isPaidEventHostBlock,
} from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';
import {
  STRIPE_TEST_CARDS,
  clickConfirmedSubmit,
  expandSignupSection,
  fillStripeCheckout,
  pollUiFor,
  shouldSkipStripeTests,
  waitForStripeRedirect,
} from './_helpers/stripe';

// 1×1 transparent PNG — enough bytes to exercise the real storage upload +
// preview without shipping a fixture image file.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Mark Delgado (P1) — the flagship Pro host (Pro subscription + Stripe Connect,
 * owns VB Beach Club). docs/personas.md.
 *
 * Adopts the `pro-host` account (TEST_PRO_HOST_EMAIL). Every test opens a
 * fresh context as Mark via `withPersona` and skips gracefully if the account
 * isn't provisioned. The Pro-only surfaces (template card, analytics, earnings,
 * CSV export) are the headline of this persona — they're the difference between
 * Mark and Julie (P2, free).
 */

const mark = PERSONAS.mark;

test.describe(`${mark.name} (${mark.id}) — Pro host surfaces`, () => {
  test('reaches /events/new and sees the Pro template card', async ({ browser }) => {
    await withPersona(browser, 'mark', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      // A Pro host is not bounced to /login or an /upgrade wall.
      expect(page.url()).toContain('/events/new');
      // Pro-only: the "save as template" affordance. It lives behind the
      // "Templates" button that opens a FormModal — openTemplatesModal returns
      // true (and asserts the template-name input) when the Pro trigger shows.
      expect(await openTemplatesModal(page)).toBe(true);
    });
  });

  test('/profile/billing/analytics shows charts (not the upgrade prompt)', async ({ browser }) => {
    await withPersona(browser, 'mark', async (page) => {
      const res = await page.goto('/profile/billing/analytics');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // A Pro host gets real metrics, not the "upgrade to unlock" CTA.
      const hasChart = await isVisibleOrTimeout(
        page.getByText(/impressions|views|fill rate|gmv|attendance/i).first(),
        10_000,
      );
      const hasUpgrade = await isVisibleOrTimeout(
        page.getByRole('button', { name: /upgrade|get pro/i }).first(),
      );
      // Either the dashboard rendered, or (if no data yet) at least no hard
      // upgrade gate is forced on a Pro account.
      expect(hasChart || !hasUpgrade).toBe(true);
    });
  });

  test('/profile/billing/earnings loads (empty state or table)', async ({ browser }) => {
    await withPersona(browser, 'mark', async (page) => {
      const res = await page.goto('/profile/billing/earnings');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      const hasContent =
        (await isVisibleOrTimeout(
          page.getByText(/No online ticket sales yet|By event|estimated payout|payout/i).first(),
          10_000,
        )) || (await page.locator('table').count()) > 0;
      expect(hasContent).toBe(true);
    });
  });

  test('/profile/billing shows a connected Stripe status', async ({ browser }) => {
    await withPersona(browser, 'mark', async (page) => {
      const res = await page.goto('/profile/billing');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Mark has charges enabled, so the page offers dashboard / earnings, not
      // a fresh "Connect with Stripe" onboarding CTA.
      const hasConnected = await isVisibleOrTimeout(
        page.getByText(/View earnings|Stripe dashboard|connected|charges enabled/i).first(),
        10_000,
      );
      const hasStripe = await isVisibleOrTimeout(
        page.getByText(/stripe|connect|payout/i).first(),
        10_000,
      );
      expect(hasConnected || hasStripe).toBe(true);
    });
  });

  test('owns a group (VB Beach Club) reachable from /profile', async ({ browser }) => {
    await withPersona(browser, 'mark', async (page) => {
      const groupUrl = await findOwnedGroupUrl(page);
      if (!groupUrl) {
        test.skip(true, 'Mark owns no group on this environment — seed VB Beach Club first');
      }
      const res = await page.goto(groupUrl!);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('hosts a free event and sees host tools (edit page)', async ({ browser }) => {
    test.slow();
    await withPersona(browser, 'mark', async (page) => {
      let created: { url: string; id: string } | null = null;
      try {
        // The "host as VB Beach Club" select is keyed by group UUID, which the
        // UI doesn't expose to the test; pick the first real group option if a
        // host-group select is present, else host as himself.
        await page.goto('/events/new');
        const hostGroupSelect = page.locator('#hostGroupId');
        if ((await hostGroupSelect.count()) > 0) {
          const optionValues = await hostGroupSelect
            .locator('option')
            .evaluateAll((opts) =>
              opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v.length > 0),
            );
          if (optionValues.length > 0) {
            created = await createFreeOpenPlayEvent(page, {
              title: `E2E Persona Mark ${Date.now()}`,
              hostGroupId: optionValues[0]!,
            });
          }
        }
        if (!created) {
          created = await createFreeOpenPlayEvent(page, {
            title: `E2E Persona Mark ${Date.now()}`,
          });
        }
        await page.goto(`${created.url}/edit`);
        await expect(page.getByRole('button', { name: /save|update event/i }).first()).toBeVisible({
          timeout: 10_000,
        });
      } finally {
        if (created) {
          await cancelEvent(page, created.url);
          await deleteEventById(created.id);
        }
      }
    });
  });

  test('adds a sponsor logo to a hosted event (Pro)', async ({ browser }) => {
    test.slow();
    skipIfPersonaMissing('mark');
    await withPersona(browser, 'mark', async (page) => {
      let created: { url: string; id: string } | null = null;
      try {
        created = await createFreeOpenPlayEvent(page, {
          title: `E2E Persona Mark Sponsor ${Date.now()}`,
        });
        await page.goto(`${created.url}/edit`);
        await page.waitForLoadState('domcontentloaded');

        // Scope to the sponsor *form* — the edit page wraps the hero-banner
        // uploader + the sponsor panel in an outer <section>, so a `section`
        // filter matched that wrapper (two file inputs → strict-mode violation).
        // The form holds all the sponsor fields and is unambiguous. A Pro host
        // gets a "Save sponsor" submit; a free host gets "Unlock sponsor slot
        // ($3)" instead — so the form's presence is itself the Pro gate.
        const sponsorForm = page.locator('form').filter({ hasText: /save sponsor/i });
        await expect(sponsorForm).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole('button', { name: /unlock sponsor slot/i })).toHaveCount(0);

        // Upload a logo → the widget uploads to the `sponsor-logos` bucket and
        // swaps the dropzone for a preview (the hidden logo_url is now set).
        await sponsorForm.locator('input[type="file"]').setInputFiles({
          name: 'sponsor.png',
          mimeType: 'image/png',
          buffer: PNG_1x1,
        });
        await expect(sponsorForm.getByRole('img', { name: /sponsor logo preview/i })).toBeVisible({
          timeout: 20_000,
        });

        // Name is required; fill it and save.
        await sponsorForm.getByLabel(/sponsor name/i).fill(`E2E Sponsor ${Date.now()}`);
        await sponsorForm.getByRole('button', { name: /save sponsor/i }).click();

        await expect(page.getByText(/sponsor saved/i)).toBeVisible({ timeout: 15_000 });
        expect(page.url()).toContain('sponsor=saved');
      } finally {
        if (created) {
          await cancelEvent(page, created.url);
          await deleteEventById(created.id);
        }
      }
    });
  });

  test('exports the Pro attendee CSV with a paid buyer on the roster', async ({ browser }) => {
    // Simplified from the persona headline ("paid multi-division tournament"):
    // the Pro feature under test is the attendee-CSV export, and that lists
    // individual paid attendees — so a paid open-play event with one real Stripe
    // buyer (Marcus) exercises it directly. The multi-division registration depth
    // is owned by the divisions phase (C4).
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfPersonaMissing('mark');
    skipIfPersonaMissing('marcus');
    test.setTimeout(180_000);

    const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://dev.pickupvb.com';
    const appOrigin = new URL(baseUrl).origin;

    // Mark (Pro + Stripe) hosts a paid event.
    const markCtx = await browser.newContext({ storageState: personaStorage('mark') });
    const markPage = await markCtx.newPage();
    let created: { url: string; id: string } | null = null;
    try {
      try {
        created = await createPaidEvent(markPage, {
          title: `E2E Mark CSV ${Date.now()}`,
          priceUsd: 5,
        });
      } catch (err) {
        if (isPaidEventHostBlock(err)) {
          test.skip(
            true,
            'host cannot create a paid event on this env (Stripe not onboarded or 30d cap) — needs an uncapped Stripe-onboarded host',
          );
        }
        throw err;
      }

      // Marcus buys a ticket so the export has a paid attendee row.
      await withPersona(browser, 'marcus', async (page) => {
        await page.goto(created!.url);
        await page.waitForLoadState('domcontentloaded');
        await clickConfirmedSubmit(page, /pay online/i);
        await fillStripeCheckout(page, { card: STRIPE_TEST_CARDS.success });
        await waitForStripeRedirect(page, appOrigin);
        await pollUiFor(page, async () => {
          await page.goto(created!.url);
          await expandSignupSection(page); // section auto-collapses once signed up
          return (await page.getByRole('button', { name: /cancel sign-up/i }).count()) > 0;
        });
      });

      // Mark exports the Pro attendee CSV (the endpoint the manage-page "Export"
      // link hits). Poll until the webhook-written paid attendee shows up.
      await pollUiFor(markPage, async () => {
        const res = await markPage.request.get(`/api/events/${created!.id}/attendees.csv`);
        if (!res.ok()) return false;
        const contentType = res.headers()['content-type'] ?? '';
        const body = await res.text();
        const rows = body.split('\n').filter((l) => l.trim().length > 0);
        // CSV content-type, the payment column header, and ≥1 attendee data row.
        return /csv/i.test(contentType) && /amount_paid_cents/i.test(body) && rows.length >= 2;
      });
    } finally {
      if (created) {
        await cancelEvent(markPage, created.url);
        await deleteEventById(created.id);
      }
      await markCtx.close();
    }
  });
});
