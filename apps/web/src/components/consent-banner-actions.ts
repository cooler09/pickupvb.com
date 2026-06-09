'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE_S,
  CONSENT_COOKIE_VERSION,
  type ConsentDecision,
} from '@/lib/consent';

type DecisionInput = {
  analytics: ConsentDecision;
  marketing: ConsentDecision;
};

/**
 * Persist the user's consent banner choice. Sets the
 * `pickupvb_consent` cookie (not HttpOnly so the client can hide the
 * banner without a round-trip) and revalidates the current path so
 * the server component tree picks up the change on the next render.
 *
 * Wrapped in narrow validation: the cookie is consumer-trusted, so we
 * normalize each field to the granted/denied enum before writing.
 */
export async function setConsentDecision(input: DecisionInput): Promise<void> {
  const payload = {
    v: CONSENT_COOKIE_VERSION,
    analytics: input.analytics === 'granted' ? 'granted' : 'denied',
    marketing: input.marketing === 'granted' ? 'granted' : 'denied',
    ts: new Date().toISOString(),
  };
  const cookieStore = await cookies();
  cookieStore.set({
    name: CONSENT_COOKIE,
    value: JSON.stringify(payload),
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: CONSENT_COOKIE_MAX_AGE_S,
  });
  revalidatePath('/');
}

/**
 * Re-open the consent banner. Clears the `pickupvb_consent` cookie so the
 * root layout (which mounts the banner only when no decision is recorded)
 * shows it again on the next render, letting the user revisit their choice
 * without clearing all site cookies (which would also sign them out).
 * Wired to the "Cookie preferences" control in the site footer.
 */
export async function reopenConsent(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: CONSENT_COOKIE, path: '/' });
  revalidatePath('/');
}
