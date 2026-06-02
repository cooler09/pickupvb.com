'use client';

import { useEffect, useRef } from 'react';
import { useToast } from './toast';
import { claimKonamiBadge } from '@/app/profile/easter-egg-actions';

// ↑ ↑ ↓ ↓ ← → ← → B A
const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/**
 * Phase 3 easter egg: a hidden Konami-code listener on the profile that grants
 * the "Secret Set" badge. Deliberately one tasteful trigger, not a framework
 * (the "balanced" tone). Pure refs — no setState in the effect — and it claims
 * at most once per mount.
 */
export function KonamiListener() {
  const { show } = useToast();
  const pos = useRef(0);
  const claimed = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === SEQUENCE[pos.current]) {
        pos.current += 1;
        if (pos.current === SEQUENCE.length) {
          pos.current = 0;
          if (claimed.current) return;
          claimed.current = true;
          void claimKonamiBadge().then((r) => {
            show({
              variant: 'success',
              title: r.newlyGranted ? 'Secret unlocked!' : 'Secret found',
              message: r.newlyGranted
                ? 'You earned the Secret Set badge.'
                : 'You already hold the Secret Set badge.',
            });
          });
        }
      } else {
        // Allow a restart if the wrong key was itself the first of the sequence.
        pos.current = key === SEQUENCE[0] ? 1 : 0;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  return null;
}
