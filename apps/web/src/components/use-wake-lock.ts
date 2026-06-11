'use client';

import { useEffect } from 'react';

/**
 * Hold a screen wake lock while the component is mounted, so a kiosk /
 * scoreboard / live-display tab doesn't dim or sleep mid-event. No-op on
 * browsers without the Screen Wake Lock API (older Safari, etc.) and when the
 * request is denied — both fail silently.
 *
 * Generalizes the inline effect that the standalone scoreboard
 * ([tools/scoreboard]) has used since ADR 0023, so the bracket display (slice A
 * of the tournament-displays bundle) and future court-board / dashboard
 * displays share one implementation. Adds visibility re-acquisition: the
 * platform auto-releases the lock when the tab is hidden, so we re-request it
 * on `visibilitychange` — important for a kiosk left running for hours.
 */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    type WakeLockSentinel = { release: () => Promise<void> };
    type WakeLockNavigator = {
      wakeLock?: { request: (kind: 'screen') => Promise<WakeLockSentinel> };
    };
    const nav = navigator as unknown as WakeLockNavigator;
    const wakeLock = nav.wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = () => {
      wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) {
            void s.release();
          } else {
            sentinel = s;
          }
        })
        .catch(() => {
          // wake lock denied (e.g. tab not visible) — silently continue
        });
    };
    acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) void sentinel.release();
    };
  }, [enabled]);
}
