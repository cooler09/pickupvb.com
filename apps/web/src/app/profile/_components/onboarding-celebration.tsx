'use client';

import { useEffect, useState } from 'react';
import { ConfettiBurst } from '@/components/confetti-burst';
import { useToast } from '@/components/toast';

/**
 * Delight #6 (see docs/delight-backlog.md): a one-time confetti + toast the first
 * time a viewer's required onboarding steps are all done. The checklist card
 * itself hides on completion (so there's no server "just completed" event), so
 * this client component owns the celebration: it fires the first load it sees
 * `complete` and then writes a per-user localStorage flag so it never repeats.
 *
 * Renders `null` (and fires nothing) until that first complete load — cheap on
 * every other visit.
 */
export function OnboardingCelebration({
  complete,
  storageKey,
}: {
  complete: boolean;
  storageKey: string;
}) {
  const { show } = useToast();
  const [fire, setFire] = useState(false);

  useEffect(() => {
    if (!complete) return;
    let already = true;
    try {
      already = localStorage.getItem(storageKey) !== null;
      if (!already) localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      return; // storage blocked — skip silently rather than risk a repeat
    }
    if (already) return;
    show({
      variant: 'success',
      title: "You're all set! 🎉",
      message: 'Your account is ready — go find a game.',
    });
    // Defer the confetti mount off the synchronous effect path (avoids a
    // cascading render; one frame's delay is imperceptible).
    const raf = requestAnimationFrame(() => setFire(true));
    const t = setTimeout(() => setFire(false), 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [complete, storageKey, show]);

  if (!fire) return null;
  return (
    <span aria-hidden className="pointer-events-none fixed inset-x-0 top-24 z-100 block">
      <ConfettiBurst />
    </span>
  );
}
