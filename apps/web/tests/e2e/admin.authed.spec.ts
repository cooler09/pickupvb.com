import { test } from '@playwright/test';

/**
 * Admin / platform moderation flows (Section 17 of the test plan).
 *
 * All tests require an admin-flagged account. The standard test account
 * (TEST_USER_EMAIL = zacharyjordan82+attendee-a@gmail.com) is a regular user,
 * not an admin, so all tests are marked fixme.
 *
 * To enable these tests:
 *   1. Set the `is_admin` flag on zacharyjordan82+admin@gmail.com in Supabase.
 *   2. TEST_ADMIN_EMAIL is already set in .env.local.
 *   3. Create a second auth setup step that signs in as TEST_ADMIN_EMAIL and
 *      saves a separate storageState (e.g. `.playwright/.auth/admin.json`).
 */

test.describe('admin profile', () => {
  test.fixme('admin badge is visible next to display name on /profile for an admin account', async () => {});
});

test.describe('community listing moderation', () => {
  test.fixme('admin hides a reported listing → listing hidden from /community directory → admin can still see it', async () => {});

  test.fixme('admin unhides the listing → listing restored in /community directory', async () => {});
});

test.describe('listing claim moderation', () => {
  test.fixme('non-owner claims a listing → admin approves the claim → claimant gains edit/delete permissions', async () => {});
});
