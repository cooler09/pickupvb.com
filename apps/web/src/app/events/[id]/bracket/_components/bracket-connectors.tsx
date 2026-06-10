'use client';

import { useEffect, useRef, useState } from 'react';

/** A winner-advances edge between two match cards in the same bracket tree. */
export type ConnectorEdge = { from: string; to: string };

type Line = { x1: number; y1: number; midX: number; y2: number; x2: number };

/**
 * Measured SVG connector layer for {@link TreeBracket} (UX-14). Replaces the old
 * CSS border-inset connectors, which assumed every match card was the same
 * height — an expanded "Enter result" card pulled its `]` off-center — and only
 * approximated double-elim losers brackets (non-2:1 round ratios).
 *
 * Instead we draw an elbow path from the right edge of each source card to the
 * left edge of the match its **winner advances to** (`advancesToMatchId`), using
 * the cards' actual measured positions. That is correct for any field shape and
 * any card height. Positions are re-measured on resize — including the height
 * change when a card's result form expands/collapses — via a `ResizeObserver` on
 * the container and each card.
 *
 * Renders behind the cards (`-z-10`; the container is `isolate`) and ignores
 * pointer events. Match ids are globally unique, so the source/target lookups go
 * through `getElementById`; coordinates are taken relative to the connector's own
 * container so the layer scrolls in lockstep with the bracket.
 */
export function BracketConnectors({ edges }: { edges: ReadonlyArray<ConnectorEdge> }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [lines, setLines] = useState<ReadonlyArray<Line>>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const svg = ref.current;
    const container = svg?.parentElement;
    if (!svg || !container) return;

    const compute = () => {
      const crect = container.getBoundingClientRect();
      const next: Line[] = [];
      for (const e of edges) {
        const from = document.getElementById(`match-${e.from}`);
        const to = document.getElementById(`match-${e.to}`);
        if (!from || !to) continue;
        const fr = from.getBoundingClientRect();
        const tr = to.getBoundingClientRect();
        const x1 = fr.right - crect.left;
        const y1 = fr.top - crect.top + fr.height / 2;
        const x2 = tr.left - crect.left;
        const y2 = tr.top - crect.top + tr.height / 2;
        next.push({ x1, y1, midX: x1 + (x2 - x1) / 2, y2, x2 });
      }
      setLines(next);
      setSize({ w: container.scrollWidth, h: container.scrollHeight });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    for (const card of container.querySelectorAll('[id^="match-"]')) ro.observe(card);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [edges]);

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      className="text-border-base pointer-events-none absolute top-0 left-0 -z-10 overflow-visible"
      width={size.w || '100%'}
      height={size.h || '100%'}
    >
      {lines.map((l, i) => (
        <path
          key={i}
          d={`M ${l.x1} ${l.y1} H ${l.midX} V ${l.y2} H ${l.x2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeOpacity={0.55}
        />
      ))}
    </svg>
  );
}
