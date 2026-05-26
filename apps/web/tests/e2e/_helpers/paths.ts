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
} as const;

export type AuthRole = keyof typeof STORAGE_PATHS;
