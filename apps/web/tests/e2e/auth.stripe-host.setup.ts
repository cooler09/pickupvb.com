import { defineAuthSetup } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

/**
 * Stripe-host: completed Stripe Connect onboarding (charges_enabled = true).
 * Can create paid events, receive payouts, and access the earnings page.
 */
defineAuthSetup({
  role: 'stripe-host',
  email: process.env.TEST_STRIPE_HOST_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
  storagePath: STORAGE_PATHS.stripeHost,
  emailEnvVar: 'TEST_STRIPE_HOST_EMAIL',
  passwordEnvVar: 'TEST_USER_PASSWORD',
  onMissingEnv: 'skip',
});
