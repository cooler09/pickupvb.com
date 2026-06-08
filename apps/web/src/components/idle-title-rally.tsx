'use client';

import { useEffect } from 'react';

/**
 * Delight #3 (see docs/delight-backlog.md): while the tab is backgrounded, bob a
 * little volleyball through the page title so a parked tab reads as "still in
 * play". Restores the exact original title the moment you come back.
 *
 * Kept deliberately calm and non-naggy:
 * - **Only runs while hidden.** The interval starts on `visibilitychange → hidden`
 *   and is cleared on return; a focused tab is never touched.
 * - **No guilt-trip copy.** It's a moving ball, not "Come back! 🥺".
 * - **Slow + cheap.** One ~900ms interval that swaps a short prefix string.
 * - **Reduced-motion safe.** Under `prefers-reduced-motion: reduce` it sets a
 *   single static `🏐` prefix instead of animating.
 * - **Lossless restore.** Snapshots `document.title` at hide-time and writes it
 *   back verbatim on return (navigation can't happen while hidden, so the
 *   snapshot stays valid).
 */

// Ball drifting left↔right across a fixed-width lane, so the title length is stable.
const FRAMES = ['🏐 · · ·', '· 🏐 · ·', '· · 🏐 ·', '· · · 🏐', '· · 🏐 ·', '· 🏐 · ·'];
const FRAME_MS = 900;

export function IdleTitleRally() {
  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let timer: ReturnType<typeof setInterval> | undefined;
    let original: string | null = null;

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      if (original !== null) {
        document.title = original;
        original = null;
      }
    }

    function onVisibility() {
      if (document.hidden) {
        if (original !== null) return; // already running
        original = document.title;
        if (reduce) {
          document.title = `🏐 ${original}`;
          return;
        }
        let i = 0;
        const base = original;
        timer = setInterval(() => {
          document.title = `${FRAMES[i % FRAMES.length]}  ${base}`;
          i += 1;
        }, FRAME_MS);
      } else {
        stop();
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  return null;
}
