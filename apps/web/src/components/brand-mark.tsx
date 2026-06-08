'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from './toast';
import { ConfettiBurst } from './confetti-burst';
import { claimPepperBadge } from '@/app/profile/easter-egg-actions';

/**
 * Delight #8 (see docs/delight-backlog.md): the `PickupVB` wordmark in the site
 * header. Tap it {@link TAPS_TO_TRIGGER}× in quick succession and it does a
 * single playful bounce, tosses the brand confetti, and grants the hidden
 * "Pepper" badge (volleyball's bump-it-back-and-forth warm-up — the on-brand
 * name for repeated taps). Mirrors the Konami easter egg's "one tasteful
 * trigger" tone.
 *
 * Why a streak works on a nav link: `SiteHeader` lives in the root layout, so
 * this client component **persists across soft navigations**. Each tap still
 * navigates to `/` (normal logo behaviour — a no-op when already home), but the
 * streak counter survives in refs, so rapid taps accumulate and the celebration
 * plays on the persistent header. We never `preventDefault`, so the link keeps
 * doing exactly what users expect.
 */

const TAPS_TO_TRIGGER = 7;
const STREAK_WINDOW_MS = 600;
const BOUNCE_MS = 900;

export function BrandMark() {
  const { show } = useToast();
  const lastTap = useRef(0);
  const count = useRef(0);
  const claimed = useRef(false);
  const [celebrating, setCelebrating] = useState(false);

  const onClick = useCallback(() => {
    const now = Date.now();
    count.current = now - lastTap.current < STREAK_WINDOW_MS ? count.current + 1 : 1;
    lastTap.current = now;
    if (count.current < TAPS_TO_TRIGGER) return;
    count.current = 0;

    // Celebrate every time the streak completes...
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), BOUNCE_MS);

    // ...but only claim the badge once per mount (the action is idempotent
    // server-side too; this just avoids a redundant round-trip + toast).
    if (claimed.current) return;
    claimed.current = true;
    void claimPepperBadge().then((r) => {
      show({
        variant: 'success',
        title: r.newlyGranted ? 'Pepper!' : 'Still peppering',
        message: r.newlyGranted
          ? 'You earned the hidden Pepper badge.'
          : 'You already hold the Pepper badge.',
      });
    });
  }, [show]);

  return (
    <span className="relative inline-flex">
      <Link
        href="/"
        onClick={onClick}
        className={`text-primary text-title-lg font-bold ${celebrating ? 'logo-bounce' : ''}`}
      >
        PickupVB
      </Link>
      {celebrating && <ConfettiBurst />}
    </span>
  );
}
