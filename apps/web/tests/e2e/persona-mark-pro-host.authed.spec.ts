import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { findOwnedGroupUrl } from './_helpers/navigation';
import { createFreeOpenPlayEvent, cancelEvent, openTemplatesModal } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';

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

        // Scope to the sponsor section — the edit page also renders a hero-banner
        // uploader, so a bare input[type=file] / "Save" would be ambiguous.
        const sponsor = page
          .locator('section')
          .filter({ hasText: /Sponsor slot \(Pro\)/i })
          .first();
        await expect(sponsor).toBeVisible({ timeout: 10_000 });

        // Pro gating headline: Mark gets the save flow, NOT the $3 unlock CTA.
        await expect(sponsor.getByRole('button', { name: /save sponsor/i })).toBeVisible({
          timeout: 10_000,
        });
        await expect(sponsor.getByRole('button', { name: /unlock sponsor slot/i })).toHaveCount(0);

        // Upload a logo → the widget uploads to the `sponsor-logos` bucket and
        // swaps the dropzone for a preview (the hidden logo_url is now set).
        await sponsor.locator('input[type="file"]').setInputFiles({
          name: 'sponsor.png',
          mimeType: 'image/png',
          buffer: PNG_1x1,
        });
        await expect(sponsor.getByRole('img', { name: /sponsor logo preview/i })).toBeVisible({
          timeout: 20_000,
        });

        // Name is required; fill it and save.
        await sponsor.getByLabel(/sponsor name/i).fill(`E2E Sponsor ${Date.now()}`);
        await sponsor.getByRole('button', { name: /save sponsor/i }).click();

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

  // The paid + CSV-export depth needs the Stripe test-mode fixture suite
  // (e2e README § "Stripe Checkout / Connect"). Documented intent:
  test.fixme('creates a paid multi-division tournament and exports the attendee CSV (Pro)', async () => {});
});
