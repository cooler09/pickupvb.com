'use client';

import { useEffect, useRef } from 'react';

/**
 * Watches the server-provided "latest match" id across renders and, when
 * it changes (i.e. a realtime refresh promoted a new card), draws the eye
 * to the new card:
 *
 *   • Always flashes the `.match-flash` ring on the new card's wrapper.
 *   • When `autoScroll` is true (spectator view), also smooth-scrolls
 *     the card into the centre of the viewport.
 *
 * Skips on the first mount so a fresh page load doesn't jerk the viewport
 * — the page's initial scroll position is the user's intent. The host
 * page passes `autoScroll={false}` so a host entering scores isn't yanked
 * around after every save.
 *
 * Pairs with `pickLatestMatchId` in `board-view.tsx` (which computes the
 * id on the server) and `BracketRealtimeRefresher` (which triggers the
 * re-render that delivers the new prop).
 */
export function LatestMatchTracker({
  matchId,
  autoScroll,
}: {
  matchId: string | null;
  autoScroll: boolean;
}) {
  const prevRef = useRef<string | null>(matchId);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = matchId;
      return;
    }
    if (!matchId || matchId === prevRef.current) {
      return;
    }
    prevRef.current = matchId;

    const el = document.getElementById(`match-${matchId}`);
    if (!el) return;

    if (autoScroll) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Force a reflow so the animation re-fires when the same element is
    // promoted twice in a row.
    el.classList.remove('match-flash');
    void el.offsetWidth;
    el.classList.add('match-flash');
  }, [matchId, autoScroll]);

  return null;
}
