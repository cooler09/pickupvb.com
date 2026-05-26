import { defineAuthSetup } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

/**
 * Admin: must have the `is_admin` flag in Supabase (via `platform_admins`
 * or equivalent). Can hide/unhide community listings, approve claims,
 * and moderate content.
 */
defineAuthSetup({
  role: 'admin',
  email: process.env.TEST_ADMIN_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
  storagePath: STORAGE_PATHS.admin,
  emailEnvVar: 'TEST_ADMIN_EMAIL',
  passwordEnvVar: 'TEST_USER_PASSWORD',
  onMissingEnv: 'skip',
});
