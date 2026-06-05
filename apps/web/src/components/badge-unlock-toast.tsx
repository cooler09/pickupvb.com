'use client';

import { useEffect, useRef } from 'react';
import { getBadgeDefinition } from '@pickupvb/domain';
import { useToast } from './toast';

/**
 * Fires a one-time celebratory toast for badges that were granted on *this*
 * page load (the reconcile use-case returns the newly-granted keys). Mounted on
 * the owner's profile so the unlock feels immediate — the balanced-tone delight
 * from the gamification design. A ref guard makes it fire once per mount even
 * under React's double-invoke in dev; this is the sanctioned "dispatch a toast
 * on mount" effect (it calls the toast context, never its own setState).
 */
export function BadgeUnlockToast({ newlyGranted }: { newlyGranted: string[] }) {
  const { show } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || newlyGranted.length === 0) return;
    fired.current = true;
    const titles = newlyGranted
      .map((k) => getBadgeDefinition(k)?.title)
      .filter((t): t is string => !!t);
    if (titles.length === 0) return;
    show({
      variant: 'success',
      title: titles.length === 1 ? 'Badge unlocked!' : 'Badges unlocked!',
      message:
        titles.length === 1
          ? `You earned the ${titles[0]} badge.`
          : `You earned: ${titles.join(', ')}.`,
    });
  }, [newlyGranted, show]);

  return null;
}
