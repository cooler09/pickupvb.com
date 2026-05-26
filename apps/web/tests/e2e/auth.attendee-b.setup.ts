import { defineAuthSetup } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

/**
 * Signs attendee-b in. Multi-user tests load this as a second browser
 * context alongside the main user.json. Skipped (rather than failing)
 * when env vars are missing so the rest of the suite keeps running;
 * dependent tests call skipIfMissingAuth(STORAGE_PATHS.attendeeB, ...).
 */
defineAuthSetup({
  role: 'attendee-b',
  email: process.env.TEST_ATTENDEE_B_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
  storagePath: STORAGE_PATHS.attendeeB,
  emailEnvVar: 'TEST_ATTENDEE_B_EMAIL',
  passwordEnvVar: 'TEST_USER_PASSWORD',
  onMissingEnv: 'skip',
});
