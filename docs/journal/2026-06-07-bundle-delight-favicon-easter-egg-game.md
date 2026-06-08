# Delight bundle: live favicon, logo easter egg, 404 keep-ups (2026-06-07)

## Context

User request for "cool fun CSS animations / favicons / games" that are **low
impact** — must not hurt performance or distract from the site's purpose. We
seeded a [docs/delight-backlog.md](../delight-backlog.md) of 13 ideas (graded by
delight-per-byte) and shipped the top three. The bar was set by the existing
Konami → "Secret Set" badge easter egg: _one tasteful trigger, not a framework._

## Decisions

- **Favicon = a route-scoped hook, not a global provider.** `useLiveFavicon` is
  called only by the scoreboard view, so it mounts/unmounts with that one route
  and costs nothing elsewhere. Chose canvas-drawn frames over animating
  `/icon.svg` (Safari freezes SMIL) and over a global subscriber (no signal to
  watch on most pages).
- **Reuse the scoreboard's own `winner` + score state** as the "is a match live"
  signal rather than adding polling — `live = !winner && play has started`.
- **Logo streak on a nav link works because the header is in the root layout.**
  `SiteHeader` persists across soft navigations, so a click-streak counter in
  refs survives the logo's own navigation to `/`. We never `preventDefault`, so
  the link behaves exactly as users expect; the 7th rapid tap just also fires
  the celebration on the (persistent) header. Rejected delaying navigation to
  disambiguate single-vs-streak clicks (degrades the common case).
- **New easter-egg badge is pure code — no migration.** `user_badges.badge_key`
  is a free string validated against the catalog by `grantEasterEggBadge`, so
  "Pepper" (`pepper`) is added in the domain catalog + `EasterEggBadgeKey` union
  only. Named for volleyball's bump-it-back warm-up drill — the on-brand metaphor
  for repeated taps. `claimPepperBadge` mirrors `claimKonamiBadge` exactly.
- **The game ships on its own route chunk.** `KeepieUppie` is statically imported
  by `not-found.tsx`, so its code only loads on the 404 route (Next splits per
  route) — no `dynamic()` ceremony needed. Physics run on the canvas via refs;
  React re-renders only on score change, not per frame. The rAF loop pauses on
  `visibilitychange` and tears down on unmount.
- **Reduced motion is honoured per-feature:** the favicon paints a static lit
  dot (no pulse interval); the game renders a calm static card with no loop; the
  logo bounce is auto-defanged by the global `prefers-reduced-motion` rule (and
  confetti already was).

## Changes

- `docs/delight-backlog.md` (new) — the 13-idea tracker + shipped/backlog
  status; linked from `docs/README.md`.
- `apps/web/src/components/use-live-favicon.ts` (new) — canvas LIVE-dot favicon
  hook; wired into `…/scoreboard/[code]/_components/scoreboard-view.tsx`.
- `apps/web/src/components/brand-mark.tsx` (new) — client wordmark + tap-streak +
  bounce + confetti; swapped in for the plain `<Link>` in `site-header.tsx`.
- `apps/web/src/app/profile/easter-egg-actions.ts` — added `claimPepperBadge`.
- `packages/domain/src/badges/badge-key.ts` + `badge-catalog.ts` — `pepper`
  easter-egg badge + new `volleyball` `BadgeIcon`; glyph added in
  `apps/web/src/components/badge-icon.tsx`.
- `apps/web/src/app/globals.css` — `logo-bounce` keyframe (compositor-only).
- `apps/web/src/components/keepie-uppie.tsx` (new) — the 404 keep-ups game;
  mounted in `apps/web/src/app/not-found.tsx`.

## Patterns observed

- **Captured `const` narrowing is widened back to `| null` inside nested
  `function` declarations.** `canvas`/`ctx` (narrowed by an early-return guard)
  read as possibly-null inside the effect's `resize`/`draw`/`frame` closures.
  Fix: re-bind as explicitly-typed non-null consts (`const ctx:
CanvasRenderingContext2D = ctx2d`) after the guard, then use those inside the
  closures. Worth remembering for any canvas/rAF effect.
- **Adding an easter-egg badge is a code-only change** (catalog + key union +
  glyph + a `claim*` action mirroring `claimKonamiBadge`). No DB work — the
  `badge_key` column is a free string. Good template for future playful badges.

## Follow-ups

- The remaining 10 backlog ideas (#1, #3–#7, #9, #10, #12, #13) are in
  `docs/delight-backlog.md` with one-line implementation notes — pick up as
  desired; none are blocking.
- **Not yet verified in a real browser.** Quad-green (typecheck/lint/test/build)
  only. The favicon pulse, the tap-streak claim round-trip, and the canvas game
  should be eyeballed on a deployed preview (favicon swaps and canvas rendering
  don't surface in the static checks).
