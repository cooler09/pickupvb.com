import { defineAuthSetup } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

/**
 * Signs the test user in once and caches the resulting session to
 * `.playwright/.auth/user.json`. Authed specs reuse this storageState.
 *
 * Required env vars (hard failure — every authed test depends on these):
 *   TEST_USER_EMAIL     — email of a pre-seeded user
 *   TEST_USER_PASSWORD  — that user's password
 *
 * Treat the test user as scoped to dev/preview only — never use a real
 * production account.
 */
defineAuthSetup({
  role: 'attendee-a',
  email: process.env.TEST_USER_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
  storagePath: STORAGE_PATHS.attendeeA,
  emailEnvVar: 'TEST_USER_EMAIL',
  passwordEnvVar: 'TEST_USER_PASSWORD',
  onMissingEnv: 'throw',
});
