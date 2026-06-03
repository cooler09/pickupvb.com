import path from 'node:path';

/**
 * Centralized storage-state paths for all authed e2e roles.
 *
 * Single source of truth so the relative `..` math doesn't drift across
 * 10+ spec files. If we move `.playwright/.auth/` (e.g. per-worker
 * storage state for the Supabase refresh-token fix), this is the only
 * file that needs to change.
 */
export const AUTH_DIR = path.join(__dirname, '..', '..', '..', '.playwright', '.auth');

export const STORAGE_PATHS = {
  attendeeA: path.join(AUTH_DIR, 'user.json'),
  attendeeB: path.join(AUTH_DIR, 'attendee-b.json'),
  freeHost: path.join(AUTH_DIR, 'free-host.json'),
  proHost: path.join(AUTH_DIR, 'pro-host.json'),
  stripeHost: path.join(AUTH_DIR, 'stripe-host.json'),
  admin: path.join(AUTH_DIR, 'admin.json'),

  // Persona accounts (docs/personas.md). Six of the personas adopt the six
  // accounts above — Amy→attendeeA, Adam→attendeeB, Julie→freeHost,
  // Mark→proHost, Carlos→stripeHost, Zoe→admin — and reuse those storage
  // files rather than signing in twice. The rest get their own storage state,
  // produced by `auth.personas.setup.ts` and registered in `_helpers/personas.ts`.
  steve: path.join(AUTH_DIR, 'persona-steve.json'),
  diana: path.join(AUTH_DIR, 'persona-diana.json'),
  sofia: path.join(AUTH_DIR, 'persona-sofia.json'),
  nina: path.join(AUTH_DIR, 'persona-nina.json'),
  bianca: path.join(AUTH_DIR, 'persona-bianca.json'),
  tyler: path.join(AUTH_DIR, 'persona-tyler.json'),
  priya: path.join(AUTH_DIR, 'persona-priya.json'),
  marcus: path.join(AUTH_DIR, 'persona-marcus.json'),
  hannah: path.join(AUTH_DIR, 'persona-hannah.json'),
  olivia: path.join(AUTH_DIR, 'persona-olivia.json'),
  rachel: path.join(AUTH_DIR, 'persona-rachel.json'),
} as const;

export type AuthRole = keyof typeof STORAGE_PATHS;
