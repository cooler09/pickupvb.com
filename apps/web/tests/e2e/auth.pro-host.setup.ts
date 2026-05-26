import { defineAuthSetup } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

/**
 * Pro-host: active Pro subscription — event templates, analytics,
 * reduced platform fee, and other Pro features enabled.
 */
defineAuthSetup({
  role: 'pro-host',
  email: process.env.TEST_PRO_HOST_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
  storagePath: STORAGE_PATHS.proHost,
  emailEnvVar: 'TEST_PRO_HOST_EMAIL',
  passwordEnvVar: 'TEST_USER_PASSWORD',
  onMissingEnv: 'skip',
});
