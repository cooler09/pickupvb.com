'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type EventSectionNavItem = { id: string; label: string };

/**
 * Sticky in-page jump nav for the event detail page's below-the-fold
 * sections (events-page-ux audit EV-4 — section sprawl). The page passes an
 * ordered list of candidate anchors; this auto-discovers which ones actually
 * rendered. Many sections self-gate to null — chat for non-members, Players
 * (open play) vs. Teams (tournament), an event with no description — so a
 * discovered link never points at a missing anchor.
 *
 * Discovery reads the live DOM through `useSyncExternalStore` (the blessed
 * primitive for subscribing to an external mutable store — AGENTS pattern 5,
 * avoids the set-state-in-effect smell) and re-scans on structural DOM
 * mutations, so the async-resolving chat panel is reflected once it settles
 * to a panel (member) or unmounts (non-member). The site header isn't sticky,
 * so `sticky top-0` pins the bar to the viewport top with no offset once the
 * reader scrolls past it.
 */
export function EventSectionNav({ items }: { items: ReadonlyArray<EventSectionNavItem> }) {
  const subscribe = useCallback((onChange: () => void) => {
    const root = document.getElementById('main') ?? document.body;
    let raf = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(onChange);
    });
    // `childList` only (no `characterData` / `attributes`) so live-score text
    // ticks and class toggles don't thrash the scan — only added/removed
    // sections (e.g. the chat panel resolving) move the discovered set.
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  // Snapshot is a comma-joined id string — a value type, so `useSyncExternalStore`
  // can compare it with `Object.is` without a stable-reference cache.
  const getSnapshot = useCallback(
    () =>
      items
        .filter((i) => {
          const el = document.getElementById(i.id);
          return !!el && el.offsetHeight > 0;
        })
        .map((i) => i.id)
        .join(','),
    [items],
  );

  // Server / pre-hydration: nothing discovered yet → the bar stays hidden.
  const presentKey = useSyncExternalStore(subscribe, getSnapshot, () => '');

  const visible = useMemo(() => {
    const present = new Set(presentKey ? presentKey.split(',') : []);
    return items.filter((i) => present.has(i.id));
  }, [presentKey, items]);

  // A lone chip isn't worth a bar.
  if (visible.length < 2) return null;

  return (
    <nav
      aria-label="Jump to section"
      className="bg-bg/90 border-border-base sticky top-0 z-30 flex flex-wrap gap-1.5 border-b py-2 backdrop-blur"
    >
      {visible.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          className="text-fg/80 hover:bg-fg/5 hover:text-fg rounded-full px-3 py-1 text-sm font-medium"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
