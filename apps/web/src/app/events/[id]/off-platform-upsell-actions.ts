'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { OFF_PLATFORM_UPSELL_COOKIE } from '@/lib/off-platform-upsell';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Dismiss the off-platform-payments upsell banner for the current browser.
 * See `apps/web/src/lib/off-platform-upsell.ts` for the cookie semantics.
 */
export async function dismissOffPlatformUpsell(returnPath: string): Promise<void> {
  (await cookies()).set(OFF_PLATFORM_UPSELL_COOKIE, '1', {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
  });
  revalidatePath(returnPath);
}
