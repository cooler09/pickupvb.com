'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';

/**
 * Delight #12 (see docs/delight-backlog.md): "volley-pong" — pong with a net in
 * the middle. You (left) vs. a beatable CPU (right); first to {@link WIN} points.
 * Lives on its own `/play` route, so the game code is fully route-isolated — it
 * never touches any core-page bundle.
 *
 * Same performance discipline as the keep-ups game: all physics run on the
 * canvas via refs (React re-renders only when the score or game-over state
 * changes), the rAF loop pauses when the tab is hidden, and under
 * `prefers-reduced-motion: reduce` it renders a static fallback with no loop.
 */

const ASPECT = 3 / 2; // width : height
const PADDLE_W = 10;
const PADDLE_H = 70;
const BALL_R = 8;
const EDGE_INSET = 18;
const BALL_SPEED_0 = 340; // px/s
const BALL_SPEED_MAX = 720;
const PLAYER_KEY_SPEED = 520; // px/s for keyboard control
const AI_SPEED = 300; // px/s — capped so the CPU is beatable
const SERVE_DELAY_MS = 700;
const WIN = 7;

type Ball = { x: number; y: number; vx: number; vy: number };

export function VolleyPong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scores, setScores] = useState({ you: 0, cpu: 0 });
  const [over, setOver] = useState<null | 'you' | 'cpu'>(null);
  const [reduced, setReduced] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);

  // Live game state (kept off React so the loop never triggers re-renders).
  const ball = useRef<Ball>({ x: 0, y: 0, vx: 0, vy: 0 });
  const leftY = useRef(0); // player paddle center-y
  const rightY = useRef(0); // CPU paddle center-y
  const pointerTarget = useRef<number | null>(null);
  const keys = useRef({ up: false, down: false });
  const serveAt = useRef(0);
  const scoreRef = useRef({ you: 0, cpu: 0 });

  const playAgain = useCallback(() => {
    scoreRef.current = { you: 0, cpu: 0 };
    setScores({ you: 0, cpu: 0 });
    setOver(null);
    setResetNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx2d = canvasEl.getContext('2d');
    if (!ctx2d) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(prefersReduced);

    const css = getComputedStyle(document.documentElement);
    const v = (prop: string, fb: string) => {
      const raw = css.getPropertyValue(prop).trim();
      return raw ? `rgb(${raw})` : fb;
    };
    const courtColor = v('--tw-color-primary', 'rgb(67 144 147)');
    const ballColor = '#ffffff';
    const lineColor = 'rgba(255,255,255,0.55)';

    let w = 0;
    let h = 0;
    let gameOver = false; // set when a side reaches WIN; freezes the ball + scoring

    function resize() {
      const parent = canvas.parentElement;
      w = parent ? parent.clientWidth : 360;
      h = Math.round(w / ASPECT);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      leftY.current = leftY.current || h / 2;
      rightY.current = rightY.current || h / 2;
    }

    function serve(towardPlayer: boolean) {
      const angle = (Math.random() * 0.5 - 0.25) * Math.PI; // -45°..45°
      const dir = towardPlayer ? -1 : 1;
      ball.current = {
        x: w / 2,
        y: h / 2,
        vx: dir * BALL_SPEED_0 * Math.cos(angle),
        vy: BALL_SPEED_0 * Math.sin(angle),
      };
      serveAt.current = performance.now() + SERVE_DELAY_MS;
    }

    function point(side: 'you' | 'cpu') {
      scoreRef.current = { ...scoreRef.current, [side]: scoreRef.current[side] + 1 };
      setScores({ ...scoreRef.current });
      if (scoreRef.current[side] >= WIN) {
        gameOver = true;
        setOver(side);
        return;
      }
      serve(side === 'you'); // server alternates toward whoever just conceded
    }

    function clampPaddle(y: number) {
      return Math.max(PADDLE_H / 2, Math.min(h - PADDLE_H / 2, y));
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      // Court tint.
      ctx.fillStyle = courtColor;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      // Net (dashed center line).
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.setLineDash([]);
      // Paddles.
      ctx.fillStyle = courtColor;
      ctx.fillRect(EDGE_INSET, leftY.current - PADDLE_H / 2, PADDLE_W, PADDLE_H);
      ctx.fillRect(w - EDGE_INSET - PADDLE_W, rightY.current - PADDLE_H / 2, PADDLE_W, PADDLE_H);
      // Ball.
      ctx.fillStyle = ballColor;
      ctx.strokeStyle = courtColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ball.current.x, ball.current.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    resize();
    window.addEventListener('resize', resize);
    serve(Math.random() < 0.5);

    if (prefersReduced) {
      draw();
      return () => window.removeEventListener('resize', resize);
    }

    let raf = 0;
    let last = performance.now();
    let running = true;
    let stopped = false;

    function step(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Player paddle: pointer wins; otherwise keys.
      if (pointerTarget.current !== null) {
        leftY.current = clampPaddle(pointerTarget.current);
      } else {
        let dy = 0;
        if (keys.current.up) dy -= PLAYER_KEY_SPEED * dt;
        if (keys.current.down) dy += PLAYER_KEY_SPEED * dt;
        if (dy) leftY.current = clampPaddle(leftY.current + dy);
      }

      // CPU paddle: chase the ball with capped speed (beatable).
      const targetY = ball.current.y;
      const diff = targetY - rightY.current;
      const move = Math.max(-AI_SPEED * dt, Math.min(AI_SPEED * dt, diff));
      rightY.current = clampPaddle(rightY.current + move);

      // Ball — frozen during the serve delay and once the match is decided.
      if (!gameOver && now >= serveAt.current) {
        const b = ball.current;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // Top/bottom walls.
        if (b.y < BALL_R) {
          b.y = BALL_R;
          b.vy = Math.abs(b.vy);
        } else if (b.y > h - BALL_R) {
          b.y = h - BALL_R;
          b.vy = -Math.abs(b.vy);
        }
        // Left paddle.
        const leftX = EDGE_INSET + PADDLE_W;
        if (
          b.vx < 0 &&
          b.x - BALL_R <= leftX &&
          b.x > EDGE_INSET &&
          Math.abs(b.y - leftY.current) <= PADDLE_H / 2 + BALL_R
        ) {
          b.x = leftX + BALL_R;
          reflect(b, leftY.current, 1);
        }
        // Right paddle.
        const rightX = w - EDGE_INSET - PADDLE_W;
        if (
          b.vx > 0 &&
          b.x + BALL_R >= rightX &&
          b.x < w - EDGE_INSET &&
          Math.abs(b.y - rightY.current) <= PADDLE_H / 2 + BALL_R
        ) {
          b.x = rightX - BALL_R;
          reflect(b, rightY.current, -1);
        }
        // Scoring.
        if (b.x < -BALL_R) point('cpu');
        else if (b.x > w + BALL_R) point('you');
      }

      draw();
      if (!stopped) raf = requestAnimationFrame(step);
    }

    function reflect(b: Ball, paddleY: number, dir: 1 | -1) {
      const offset = (b.y - paddleY) / (PADDLE_H / 2); // -1..1
      const speed = Math.min(BALL_SPEED_MAX, Math.hypot(b.vx, b.vy) * 1.05);
      const angle = offset * (Math.PI / 3.2); // up to ~56°
      b.vx = dir * speed * Math.cos(angle);
      b.vy = speed * Math.sin(angle);
    }

    raf = requestAnimationFrame(step);

    function onVisibility() {
      if (document.hidden) {
        if (running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resetNonce]);

  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (reduced) return;
      const rect = e.currentTarget.getBoundingClientRect();
      pointerTarget.current = e.clientY - rect.top;
    },
    [reduced],
  );
  const onPointerLeave = useCallback(() => {
    pointerTarget.current = null;
  }, []);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (reduced) return;
      if (e.key === 'ArrowUp' || e.key === 'w') {
        keys.current.up = true;
        pointerTarget.current = null;
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 's') {
        keys.current.down = true;
        pointerTarget.current = null;
        e.preventDefault();
      }
    },
    [reduced],
  );
  const onKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'w') keys.current.up = false;
    else if (e.key === 'ArrowDown' || e.key === 's') keys.current.down = false;
  }, []);

  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm border p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-fg text-title-lg font-semibold tabular-nums">
          You <span className="text-primary">{scores.you}</span>
          <span className="text-muted"> — </span>
          <span className="text-primary">{scores.cpu}</span> CPU
        </p>
        <p className="text-muted text-xs">First to {WIN}</p>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={onPointerLeave}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          tabIndex={0}
          role="img"
          aria-label="Volley-pong: move your paddle with the mouse, touch, or the up/down arrow keys."
          className="rounded-shape-xs focus-visible:ring-primary block w-full touch-none bg-black/80 outline-none focus-visible:ring-2"
        />
        {over && (
          <div className="bg-fg/60 rounded-shape-xs absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-headline-sm font-bold text-white">
              {over === 'you' ? 'You win! 🏐' : 'CPU wins'}
            </p>
            <button type="button" onClick={playAgain} className={primaryButtonClass('md')}>
              Play again
            </button>
          </div>
        )}
      </div>
      <p className="text-muted mt-2 text-center text-xs">
        {reduced
          ? 'Reduced motion is on — volley-pong is paused.'
          : 'Move with your mouse, touch, or ↑/↓.'}
      </p>
    </div>
  );
}
