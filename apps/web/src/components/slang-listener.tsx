'use client';

import { useEffect, useRef, useState } from 'react';
import { ConfettiBurst } from './confetti-burst';

/**
 * Delight #9 (see docs/delight-backlog.md): a global key-buffer easter egg.
 * Type a piece of volleyball slang anywhere that isn't a text field and a small
 * brand-confetti toss fires. Same "one tasteful trigger" spirit as the Konami
 * listener — discoverable by the actual volleyball crowd, invisible to everyone
 * else.
 *
 * Cheap by construction: one passive `keydown` listener, a tiny rolling char
 * buffer (no allocation per key beyond an 8-char string), and confetti that's
 * pure CSS (reduced-motion-safe via the global rule). A cooldown stops a
 * key-masher from spamming bursts. Skips entirely while the user is typing in an
 * input / textarea / contenteditable, so it never hijacks real text entry.
 */

// Kept short + unambiguous; all lowercase, letters only (the buffer is lowercased).
const WORDS = ['ace', 'dig', 'pancake', 'spike', 'rally', 'sideout', 'pepper'] as const;
const BUFFER_LEN = 8; // ≥ longest word
const COOLDOWN_MS = 1500;

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

export function SlangListener() {
  const buffer = useRef('');
  const cooldownUntil = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // `tick` re-keys the burst so it re-fires; `active` mounts/unmounts it.
  const [tick, setTick] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
      if (isTextEntry(document.activeElement)) return;

      buffer.current = (buffer.current + e.key.toLowerCase()).slice(-BUFFER_LEN);

      const now = Date.now();
      if (now < cooldownUntil.current) return;
      if (!WORDS.some((w) => buffer.current.endsWith(w))) return;

      cooldownUntil.current = now + COOLDOWN_MS;
      buffer.current = '';
      setTick((n) => n + 1);
      setActive(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setActive(false), 1100);
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!active) return null;
  return (
    <span
      key={tick}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-28 z-100 block"
    >
      <ConfettiBurst />
    </span>
  );
}
