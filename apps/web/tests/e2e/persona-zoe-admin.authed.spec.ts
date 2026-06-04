import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Zoe Carter (P18) — the platform admin. docs/personas.md.
 *
 * Zoe adopts the admin account (TEST_ADMIN_EMAIL / admin.json). She's the only
 * persona who sees `/admin/*`. The runnable assertions are the admin badge and
 * admin-surface reachability; the multi-actor claim-approval / moderation /
 * role-escalation flows (which need a city+day-matched listing+event spanning
 * other personas) are owned by admin.authed.spec.ts and stay fixme here.
 */

const zoe = PERSONAS.zoe;

test.describe(`${zoe.name} (${zoe.id}) — platform admin`, () => {
  test('admin badge renders on /profile', async ({ browser }) => {
    await withPersona(browser, 'zoe', async (page) => {
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');
      // AdminBadge: <span aria-label="Platform admin — …">Admin</span>.
      const badge = page.locator('[aria-label*="Platform admin"]').first();
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText('Admin');
    });
  });

  test('an admin-only surface is reachable (not bounced to /login)', async ({ browser }) => {
    await withPersona(browser, 'zoe', async (page) => {
      // The community-import tool is the one first-class /admin page.
      await page.goto('/admin/community-import');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).not.toContain('/login');
      // .first() — a 404 page would also render a <main>, tripping strict mode.
      await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
      // …and it must be the admin tool, not the 404 page.
      await expect(page.locator('body')).not.toContainText(/page not found/i);
    });
  });

  // Multi-actor moderation depth — owned by admin.authed.spec.ts. features.md
  // § 13 + e2e README § "Multi-actor admin / claim-approval".
  test.fixme('approves a community-listing claim', async () => {});
  test.fixme('hides then unhides a reported community listing', async () => {});
  test.fixme('escalates / de-escalates a user role', async () => {});
});
