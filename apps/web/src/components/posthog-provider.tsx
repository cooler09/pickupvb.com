'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ViewerTraits } from '@/lib/server-distinct-id';

type Props = {
  /** `true` when the server-rendered consent gate allows analytics. */
  allowed: boolean;
  /** Salted-hash distinct id for the signed-in viewer, or `null` for anon. */
  hashedDistinctId: string | null;
  /** PII-free identify traits, or `null` when no user. */
  traits: ViewerTraits | null;
  /** PostHog project API key (write-only; safe in the browser). */
  apiKey: string | undefined;
  /** PostHog ingest host. */
  apiHost: string;
};

/**
 * Pure decision function: should the browser SDK be initialized for
 * this combination of consent + configuration? Extracted so the
 * gating logic can be regression-tested without rendering React. Two
 * conditions, both must hold:
 *
 *  1. `allowed` — the server-rendered consent gate said yes (the
 *     `pickupvb_consent` cookie is `analytics: 'granted'`, or no
 *     cookie + no GPC signal under the US-first opt-out default).
 *  2. `apiKey` is set — without `NEXT_PUBLIC_POSTHOG_KEY` we'd be
 *     calling `posthog.init(undefined, …)`, which is a runtime error.
 *     Local dev / CI without keys must silently no-op.
 */
export function shouldInitPostHog(args: { allowed: boolean; apiKey: string | undefined }): boolean {
  return args.allowed && Boolean(args.apiKey);
}

/**
 * Consent-gated PostHog browser SDK bootstrapper. Mounted unconditionally
 * from the root layout so it can react to `pickupvb:consent-change`
 * events dispatched by the consent banner without a full page reload.
 *
 * Init posture:
 *  - When `allowed` is true _and_ `apiKey` is set, we dynamically import
 *    `posthog-js` (keeps it out of the SSR bundle and out of the entry
 *    chunk for users who decline) and call `posthog.init()` exactly once.
 *  - When the viewer is signed in with a real account we call
 *    `posthog.identify(hashedDistinctId, traits)` so browser autocapture
 *    and server-side `capture()` events land under the same Person.
 *  - When consent is revoked at runtime we call `posthog.opt_out_capturing()`
 *    and `posthog.reset()` to clear the persisted distinct id; granting
 *    again re-initializes.
 *  - Pageviews are captured by the SDK directly (`capture_pageview:
 *    'history_change'`), which is the App-Router-friendly option.
 *
 * Why a `pickupvb:consent-change` window CustomEvent rather than reading
 * the cookie on a `setInterval`: the banner already fires a server action
 * that writes the cookie and revalidates, but `revalidatePath('/')`
 * doesn't remount client components on the current navigation. The
 * CustomEvent gives the provider a synchronous signal to opt-in / -out
 * the moment the user clicks Accept / Decline.
 */
export function PostHogProvider({
  allowed,
  hashedDistinctId,
  traits,
  apiKey,
  apiHost,
}: Props): null {
  const initialized = useRef(false);
  const lastIdentified = useRef<string | null>(null);
  const allowedRef = useRef(allowed);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track the latest allow state for the consent-change listener below.
  useEffect(() => {
    allowedRef.current = allowed;
  }, [allowed]);

  // Initialize / identify when allowed.
  useEffect(() => {
    if (!shouldInitPostHog({ allowed, apiKey })) return;
    let cancelled = false;

    void (async () => {
      const mod = await import('posthog-js');
      if (cancelled) return;
      const posthog = mod.default;

      if (!initialized.current) {
        posthog.init(apiKey as string, {
          api_host: apiHost,
          person_profiles: 'identified_only',
          capture_pageview: 'history_change',
          capture_pageleave: true,
          autocapture: true,
          disable_session_recording: true,
        });
        initialized.current = true;
      } else {
        posthog.opt_in_capturing();
      }

      if (hashedDistinctId && lastIdentified.current !== hashedDistinctId) {
        posthog.identify(hashedDistinctId, traits ?? undefined);
        lastIdentified.current = hashedDistinctId;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allowed, apiKey, apiHost, hashedDistinctId, traits]);

  // Listen for runtime consent flips from the banner.
  useEffect(() => {
    function onConsentChange(ev: Event): void {
      const detail = (ev as CustomEvent<{ analytics?: 'granted' | 'denied' }>).detail;
      if (!detail) return;
      if (detail.analytics === 'denied' && initialized.current) {
        void import('posthog-js').then((mod) => {
          mod.default.opt_out_capturing();
          mod.default.reset();
          lastIdentified.current = null;
        });
      }
      // Granting at runtime is handled by the init effect after the
      // server-rendered `allowed` prop flips on the next render — the
      // banner triggers a `router.refresh()` via `revalidatePath`.
    }
    window.addEventListener('pickupvb:consent-change', onConsentChange);
    return () => {
      window.removeEventListener('pickupvb:consent-change', onConsentChange);
    };
  }, []);

  // Best-effort: explicitly notify PostHog of soft navigations. Belt-and-
  // braces alongside `capture_pageview: 'history_change'`, which already
  // hooks `history.pushState` — useful when an effect runs but the
  // pushState happens earlier than the SDK's listener.
  useEffect(() => {
    if (!initialized.current || !allowedRef.current) return;
    void import('posthog-js').then((mod) => {
      mod.default.capture('$pageview');
    });
    // We want this to fire on any route or query change.
  }, [pathname, searchParams]);

  return null;
}
