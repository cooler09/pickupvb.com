'use client';

import { useEffect, useRef } from 'react';

/**
 * Watches the server-provided "latest match" id across renders and, when
 * it changes (i.e. a realtime refresh promoted a new card), draws the eye
 * to the new card:
 *
 *   • Always flashes the `.match-flash` ring on the new card's wrapper.
 *   • When `autoScroll` is true (spectator view), also smooth-scrolls
 *     the card into the centre of the viewport — **unless** at least
 *     one other match card is currently visible in the viewport. If the
 *     spectator is already looking at matches, we assume they're tracking
 *     something specific (e.g. their friend's match) and don't yank them
 *     to the newly-promoted card.
 *
 * Skips on the first mount so a fresh page load doesn't jerk the viewport
 * — the page's initial scroll position is the user's intent. The host
 * page passes `autoScroll={false}` so a host entering scores isn't yanked
 * around after every save.
 *
 * **Initial focus**: if `initialFocusId` is provided (driven by the page
 * from a `?focus=match-<id>` query) the tracker also scrolls that card
 * into view on first mount and flashes it. This powers shareable
 * "look at this match" deep links.
 *
 * Pairs with `pickLatestMatchId` in `board-view.tsx` (which computes the
 * id on the server) and `BracketRealtimeRefresher` (which triggers the
 * re-render that delivers the new prop).
 */
export function LatestMatchTracker({
  matchId,
  autoScroll,
  initialFocusId = null,
}: {
  matchId: string | null;
  autoScroll: boolean;
  initialFocusId?: string | null;
}) {
  const prevRef = useRef<string | null>(matchId);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = matchId;
      if (initialFocusId) {
        const el = document.getElementById(`match-${initialFocusId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
          el.classList.remove('match-flash');
          void el.offsetWidth;
          el.classList.add('match-flash');
        }
      }
      return;
    }
    if (!matchId || matchId === prevRef.current) {
      return;
    }
    prevRef.current = matchId;

    const el = document.getElementById(`match-${matchId}`);
    if (!el) return;

    if (autoScroll && !isAnyOtherMatchVisible(el)) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Force a reflow so the animation re-fires when the same element is
    // promoted twice in a row.
    el.classList.remove('match-flash');
    void el.offsetWidth;
    el.classList.add('match-flash');
  }, [matchId, autoScroll, initialFocusId]);

  return null;
}

/**
 * Returns true when at least one *other* match card is currently visible
 * in the viewport (>25% of its height intersecting). Used as the "don't
 * yank me" guard: if the viewer can already see matches, leave their
 * scroll position alone and let the flash on the promoted card do the
 * work of catching their eye if they care.
 *
 * Uses synchronous `getBoundingClientRect` rather than `IntersectionObserver`
 * because we need the answer right now (inside an effect), not on the
 * next paint.
 */
function isAnyOtherMatchVisible(exclude: Element): boolean {
  if (typeof window === 'undefined') return false;
  const cards = Array.from(document.querySelectorAll('[id^="match-"]')).filter(
    (el) => el !== exclude,
  );
  if (cards.length === 0) return false;
  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  for (const el of cards) {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) continue;
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, viewportH);
    const visibleH = Math.max(0, visibleBottom - visibleTop);
    if (visibleH / rect.height > 0.25) return true;
  }
  return false;
}
