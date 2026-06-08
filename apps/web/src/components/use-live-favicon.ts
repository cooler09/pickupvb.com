'use client';

import { useEffect } from 'react';

/**
 * Delight #2 (see docs/delight-backlog.md): while `active`, swap the browser
 * tab favicon to a pulsing red "LIVE" dot over the brand volleyball, so a
 * backgrounded tab signals a match is in progress. Restores the original
 * favicon on deactivate / unmount.
 *
 * Why this shape:
 * - **Self-contained + route-scoped.** The hook only runs on the surface that
 *   calls it (today: the scoreboard tool), so it costs nothing on every other
 *   page — it mounts and unmounts with that route.
 * - **No image load.** The favicon is canvas-drawn from brand tokens, so there's
 *   no network fetch and no dependency on `/icon.svg`.
 * - **Two pre-rasterized frames.** The "lit" and "dim" PNGs are drawn once on
 *   activate; the pulse just toggles `link.href` between the two cached data
 *   URLs — no per-tick canvas work.
 * - **Reduced-motion safe.** Under `prefers-reduced-motion: reduce` the dot is
 *   painted once, statically lit — no interval, no pulse.
 * - **Non-destructive restore.** We append our own `<link rel="icon">` (last
 *   wins) and remove it on cleanup, revealing the original Next-emitted icon
 *   rather than mutating it.
 */

// Brand palette (mirrors apps/web/src/app/icon.svg + the layout themeColor).
const SAND = '#F9EBD9';
const TEAL = '#439093';
const NET = '#183334';
const LIVE = '#e6004a';

/** Draw a 64×64 favicon: brand ball + net with a LIVE dot at `dotOpacity`. */
function drawFavicon(dotOpacity: number): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Rounded sand tile.
  ctx.fillStyle = SAND;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 14);
  ctx.fill();

  // Ball (teal ring), nudged up-left to leave room for the corner dot.
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(27, 26, 13, 0, Math.PI * 2);
  ctx.stroke();

  // A hint of net below the ball so it still reads as the brand mark.
  ctx.strokeStyle = NET;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8, 50);
  ctx.lineTo(40, 50);
  ctx.stroke();

  // LIVE dot — red disc with a white ring, bottom-right.
  ctx.globalAlpha = dotOpacity;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(49, 49, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = LIVE;
  ctx.beginPath();
  ctx.arc(49, 49, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  return canvas.toDataURL('image/png');
}

export function useLiveFavicon(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.id = 'pvb-live-favicon';

    const lit = drawFavicon(1);
    const dim = drawFavicon(0.3);
    if (!lit) return; // canvas unsupported — bail without touching the head

    link.href = lit;
    document.head.appendChild(link);

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let timer: ReturnType<typeof setInterval> | undefined;
    if (!reduce && dim) {
      let on = true;
      timer = setInterval(() => {
        on = !on;
        link.href = on ? lit : dim;
      }, 700);
    }

    return () => {
      if (timer) clearInterval(timer);
      link.remove();
    };
  }, [active]);
}
