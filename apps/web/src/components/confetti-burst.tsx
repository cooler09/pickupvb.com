'use client';

import type { CSSProperties } from 'react';

/**
 * Pure-CSS celebratory confetti — a brand-coloured toss of mini "volleyballs"
 * that fans up-and-out from the top of its parent and fades. Mount it
 * (conditionally) at a moment of delight — RSVP confirmed, team registered —
 * and it fires exactly once on mount.
 *
 * Why this shape:
 * - **No animation library, no JS tween** — just the `confetti-pop` keyframe in
 *   [globals.css]; each piece's direction / rotation / colour / delay arrive as
 *   inline custom properties.
 * - **No `Math.random()` in render** — the piece set is a deterministic const,
 *   so the component stays pure for the React Compiler (audit pattern #4).
 * - **Compositor-only** (transform + opacity) — no layout thrash, no CLS.
 * - **Reduced-motion safe for free** — the global `prefers-reduced-motion:
 *   reduce` rule collapses each piece to its final keyframe (opacity 0), so the
 *   burst becomes an invisible no-op without any media-query JS here.
 * - `aria-hidden` + `pointer-events-none` keep it out of the a11y tree and out
 *   of the way of clicks.
 *
 * Anchor it inside a `position: relative` parent — pieces emit from that box's
 * top-centre.
 */

type Piece = { dx: number; dy: number; rot: number; color: string; delay: number };

// Teal / coral / sand — the brand triplet, read from the theme tokens so the
// confetti recolours with light/dark automatically.
const TEAL = 'var(--tw-color-primary)';
const CORAL = 'var(--tw-color-secondary)';
const SAND = 'var(--tw-color-highlight)';

// A fixed fan of 14 pieces: symmetric horizontal spread, all rising (negative
// dy), with varied spin. Deterministic on purpose (see note above).
const PIECES: readonly Piece[] = [
  { dx: -104, dy: -22, rot: -240, color: TEAL, delay: 0 },
  { dx: -78, dy: -52, rot: 180, color: CORAL, delay: 30 },
  { dx: -56, dy: -30, rot: -140, color: SAND, delay: 10 },
  { dx: -34, dy: -64, rot: 220, color: TEAL, delay: 50 },
  { dx: -18, dy: -40, rot: -90, color: CORAL, delay: 20 },
  { dx: -8, dy: -70, rot: 160, color: SAND, delay: 60 },
  { dx: 8, dy: -58, rot: -200, color: TEAL, delay: 40 },
  { dx: 20, dy: -34, rot: 120, color: CORAL, delay: 15 },
  { dx: 36, dy: -66, rot: -180, color: SAND, delay: 55 },
  { dx: 54, dy: -28, rot: 240, color: TEAL, delay: 25 },
  { dx: 76, dy: -50, rot: -160, color: CORAL, delay: 35 },
  { dx: 98, dy: -24, rot: 200, color: SAND, delay: 5 },
  { dx: 120, dy: -44, rot: -220, color: TEAL, delay: 45 },
  { dx: -120, dy: -46, rot: 140, color: CORAL, delay: 45 },
];

export function ConfettiBurst() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 block">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              '--cf-dx': `${p.dx}px`,
              '--cf-dy': `${p.dy}px`,
              '--cf-rot': `${p.rot}deg`,
              animationDelay: `${p.delay}ms`,
              background: `rgb(${p.color})`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
