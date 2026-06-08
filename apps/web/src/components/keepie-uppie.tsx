'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Delight #11 (see docs/delight-backlog.md): a tiny keep-it-up volleyball game
 * for idle screens (today: the 404 page). Tap the falling ball to bump it back
 * up; your rally counts until it hits the floor.
 *
 * Performance contract — this only ever ships on the routes that import it
 * (its own chunk), and even there it stays cheap:
 * - **Physics live on the canvas via refs**, not React state. React re-renders
 *   only when the rally / best score changes (on a bump or a drop), never per
 *   frame.
 * - **The rAF loop pauses when the tab is hidden** (`visibilitychange`) and is
 *   torn down on unmount, so a backgrounded 404 tab burns nothing.
 * - **Reduced-motion safe:** under `prefers-reduced-motion: reduce` the game
 *   renders a static, calm fallback instead of an animated ball — no loop.
 */

const HEIGHT = 220; // logical px; width tracks the container
const BALL_R = 18;
const HIT_PAD = 16; // forgiving tap radius on top of the ball
const GRAVITY = 1500; // px/s²
const BUMP_VY = -680; // px/s launch impulse
const MAX_VX = 520;

type Vec = { x: number; y: number; vx: number; vy: number; grounded: boolean };

function readColor(prop: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  return v ? `rgb(${v})` : fallback;
}

export function KeepieUppie() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ball = useRef<Vec>({ x: 0, y: 0, vx: 0, vy: 0, grounded: true });
  const rallyRef = useRef(0);
  const [rally, setRally] = useState(0);
  const [best, setBest] = useState(0);
  const [reduced, setReduced] = useState(false);

  const bump = useCallback((tapX: number | null) => {
    const b = ball.current;
    b.grounded = false;
    b.vy = BUMP_VY;
    if (tapX !== null) {
      // Push the ball away from where you tapped, for a bit of control.
      b.vx = Math.max(-MAX_VX, Math.min(MAX_VX, b.vx + (b.x - tapX) * 7));
    }
    rallyRef.current += 1;
    setRally(rallyRef.current);
    setBest((prev) => Math.max(prev, rallyRef.current));
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx2d = canvasEl.getContext('2d');
    if (!ctx2d) return;
    // Re-bind as explicitly non-null consts so the nested draw / rAF closures
    // below keep the narrowing (TS widens captured locals back to `| null`).
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(prefersReduced);

    const ballColor = '#ffffff';
    const seam = readColor('--tw-color-primary', 'rgb(67 144 147)');
    const fg = readColor('--tw-color-fg', 'rgb(24 51 52)');

    let width = 0;
    let dpr = 1;

    function resize() {
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : 320;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-seat a grounded ball when the box resizes.
      const b = ball.current;
      if (b.x === 0 || b.grounded) {
        b.x = width / 2;
        b.y = HEIGHT - BALL_R;
      }
    }

    function drawBall() {
      const b = ball.current;
      // Floor line.
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT - 1);
      ctx.lineTo(width, HEIGHT - 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Ball body.
      ctx.fillStyle = ballColor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = seam;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Three quick seams.
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, -1.7, -0.4);
      ctx.moveTo(b.x - BALL_R * 0.7, b.y - BALL_R * 0.4);
      ctx.arc(b.x - 4, b.y + 6, BALL_R * 0.9, 2.2, 3.6);
      ctx.moveTo(b.x + BALL_R, b.y);
      ctx.arc(b.x + 6, b.y + 2, BALL_R * 0.85, 0.5, 1.9);
      ctx.stroke();
    }

    function clear() {
      ctx.clearRect(0, 0, width, HEIGHT);
    }

    resize();
    window.addEventListener('resize', resize);

    if (prefersReduced) {
      // Static, calm frame — no loop.
      clear();
      drawBall();
      return () => window.removeEventListener('resize', resize);
    }

    let raf = 0;
    let last = performance.now();
    let running = true;

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05); // clamp tab-refocus jumps
      last = now;
      const b = ball.current;
      if (!b.grounded) {
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // Side walls.
        if (b.x < BALL_R) {
          b.x = BALL_R;
          b.vx = Math.abs(b.vx) * 0.8;
        } else if (b.x > width - BALL_R) {
          b.x = width - BALL_R;
          b.vx = -Math.abs(b.vx) * 0.8;
        }
        // Ceiling.
        if (b.y < BALL_R) {
          b.y = BALL_R;
          b.vy = Math.abs(b.vy) * 0.5;
        }
        // Floor — the rally ends.
        if (b.y >= HEIGHT - BALL_R) {
          b.y = HEIGHT - BALL_R;
          b.vx = 0;
          b.vy = 0;
          b.grounded = true;
          if (rallyRef.current > 0) {
            rallyRef.current = 0;
            setRally(0);
          }
        }
      }
      clear();
      drawBall();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function onVisibility() {
      if (document.hidden) {
        if (running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (reduced) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const b = ball.current;
      const within = Math.hypot(px - b.x, py - b.y) <= BALL_R + HIT_PAD;
      // First touch from rest, or any touch on the ball, launches it.
      if (b.grounded || within) bump(px);
    },
    [reduced, bump],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (reduced) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        bump(null); // straight up
      }
    },
    [reduced, bump],
  );

  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm mt-12 border p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-fg text-title-lg font-semibold">Keep it up 🏐</h2>
        <p className="text-muted text-sm tabular-nums" aria-live="polite">
          Rally <span className="text-fg font-semibold">{rally}</span>
          {best > 0 && <span className="text-muted"> · Best {best}</span>}
        </p>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="img"
        aria-label="Keep-ups: tap or press space to bump the volleyball and keep your rally going."
        className="rounded-shape-xs focus-visible:ring-primary block w-full touch-none outline-none focus-visible:ring-2"
      />
      <p className="text-muted mt-2 text-center text-xs">
        {reduced
          ? 'Reduced motion is on — the keep-ups game is paused.'
          : 'Tap the ball (or press space) to keep it in the air.'}
      </p>
    </div>
  );
}
