'use client';

import { useState, useTransition } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import { setConsentDecision } from './consent-banner-actions';

/**
 * Cookie consent banner. Mounted from the root layout when the server
 * has not yet seen a `pickupvb_consent` cookie. Two affordances:
 *
 *  - **Accept all** — analytics + (future) marketing both `granted`.
 *  - **Decline** — analytics + marketing both `denied`.
 *
 * Customize (per-category toggles) is intentionally deferred — until
 * we ship a marketing pixel there's only one meaningful axis. When
 * that lands, add a third button that opens a modal with toggles and
 * re-uses `setConsentDecision` directly.
 *
 * The banner hides itself optimistically once a choice is made; the
 * server action's `revalidatePath('/')` then ensures the next full
 * navigation no longer mounts it.
 */
export function ConsentBanner(): React.ReactElement | null {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  function decide(analytics: 'granted' | 'denied'): void {
    setHidden(true);
    if (typeof window !== 'undefined') {
      // Synchronously notify the PostHog provider so it can opt-in /
      // -out without waiting for a router refresh. See
      // [apps/web/src/components/posthog-provider.tsx](./posthog-provider.tsx).
      window.dispatchEvent(new CustomEvent('pickupvb:consent-change', { detail: { analytics } }));
    }
    startTransition(() => {
      void setConsentDecision({ analytics, marketing: 'denied' });
    });
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-neutral-700 dark:text-neutral-200">
          We use first-party analytics and PostHog&apos;s browser SDK to understand how PickupVB is
          used. No third-party ad-tech. See our{' '}
          <a href="/legal/privacy" className="underline underline-offset-2 hover:no-underline">
            Privacy Policy
          </a>{' '}
          for details.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide('denied')}
            disabled={pending}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            disabled={pending}
            className={primaryButtonClass('sm')}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
