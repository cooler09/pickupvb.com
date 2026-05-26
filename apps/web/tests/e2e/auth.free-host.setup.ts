import { defineAuthSetup } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

/**
 * Free-host: can create and manage free events but has no Stripe Connect.
 */
defineAuthSetup({
  role: 'free-host',
  email: process.env.TEST_FREE_HOST_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
  storagePath: STORAGE_PATHS.freeHost,
  emailEnvVar: 'TEST_FREE_HOST_EMAIL',
  passwordEnvVar: 'TEST_USER_PASSWORD',
  onMissingEnv: 'skip',
});
