# Delight backlog

Low-impact "delight" ideas — fun CSS micro-animations, favicon tricks, easter
eggs, and tiny games. The bar (set by the existing Konami easter egg) is **"one
tasteful trigger, not a framework"**: each item must be self-contained, cost
~nothing on the pages real users live on, and degrade to nothing under
`prefers-reduced-motion`.

Constraints every item here must respect:

- **No measurable performance hit on core pages.** Games / heavy animation are
  route-isolated (their own chunk) or only mount on idle surfaces (404, empty
  states, the scoreboard tool).
- **Reduced-motion safe.** The global `prefers-reduced-motion: reduce` rule in
  [globals.css](../apps/web/src/app/globals.css) defangs every CSS animation;
  JS-driven motion must check the media query itself.
- **Compositor-only CSS** (`transform` / `opacity`) — no layout thrash, no CLS.
- **Never block or distract from the task.** `aria-hidden` +
  `pointer-events-none` for decorative motion; opt-in for anything interactive.

Already in the tree before this backlog existed: the M3 motion system
(`court-line-draw`, `ball-spin-in`, `spots-pulse`, `fade-up`, `match-flash`),
[`ConfettiBurst`](../apps/web/src/components/confetti-burst.tsx), and the
Konami → "Secret Set" badge easter egg
([konami-listener.tsx](../apps/web/src/components/konami-listener.tsx)).

## Status

| #   | Idea                           | Category   | Status                |
| --- | ------------------------------ | ---------- | --------------------- |
| 1   | Animated SVG favicon           | Favicon    | 💡 backlog            |
| 2   | **Dynamic LIVE tab favicon**   | Favicon    | ✅ shipped 2026-06-07 |
| 3   | Title-bar rally when tab idle  | Favicon    | 💡 backlog            |
| 4   | Ball "serve" spin on CTA       | CSS        | 💡 backlog            |
| 5   | Net-draw section dividers      | CSS        | 💡 backlog            |
| 6   | Confetti on more milestones    | CSS        | 💡 backlog            |
| 7   | Roster avatar "high-five"      | CSS        | 💡 backlog            |
| 8   | **Logo tap-streak easter egg** | Easter egg | ✅ shipped 2026-06-07 |
| 9   | Type "ace"/"dig"/"pancake"     | Easter egg | 💡 backlog            |
| 10  | Date-aware homepage sprinkles  | Easter egg | 💡 backlog            |
| 11  | **Keepie-uppie on the 404**    | Game       | ✅ shipped 2026-06-07 |
| 12  | Pong-but-volleyball            | Game       | 💡 backlog            |
| 13  | Keepie-uppie on empty states   | Game       | 💡 backlog            |

## Shipped

### #2 — Dynamic LIVE tab favicon

When a volleyball match is being scored live on the scoreboard tool, the browser
tab favicon swaps to a pulsing red "LIVE" dot so a backgrounded tab signals the
match is in progress. Reuses the scoreboard's existing `winner` / score state —
no new polling. Lives only on the scoreboard route (mounts/unmounts with it), so
zero cost on every other page.

- [use-live-favicon.ts](../apps/web/src/components/use-live-favicon.ts) — the hook
  (canvas-drawn favicon, restores the original on unmount, static dot under
  reduced-motion).
- Wired in
  [scoreboard-view.tsx](../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx)
  — `live = !winner && a match has started`.

### #8 — Logo tap-streak easter egg

Tap the `PickupVB` wordmark 7× fast → it does a single playful bounce, fires the
brand confetti, and grants the hidden **"Pepper"** badge (the volleyball warm-up
drill where you bump the ball back and forth — the on-brand name for repeated
taps). Mirrors the Konami pattern exactly. The header lives in the root layout,
so the click-streak counter survives the logo's own soft navigation.

- [brand-mark.tsx](../apps/web/src/components/brand-mark.tsx) — client wordmark +
  streak detector + bounce + confetti.
- [easter-egg-actions.ts](../apps/web/src/app/profile/easter-egg-actions.ts) —
  `claimPepperBadge()` (mirrors `claimKonamiBadge`).
- `pepper` badge added to the domain catalog
  ([badge-catalog.ts](../packages/domain/src/badges/badge-catalog.ts),
  [badge-key.ts](../packages/domain/src/badges/badge-key.ts)) with a new
  `volleyball` glyph ([badge-icon.tsx](../apps/web/src/components/badge-icon.tsx)).
  No migration — `user_badges.badge_key` is a free string.

### #11 — Keepie-uppie on the 404

The 404 page is an idle screen, so it hosts a tiny canvas keepie-uppie game: tap
the falling volleyball to keep it airborne, counting your rally (with a personal
best). Route-isolated — the game chunk only loads on the 404 route. The physics
run entirely on the canvas via refs (React only re-renders when the rally count
changes), the loop pauses when the tab is hidden, and under reduced-motion it
renders a static card instead of an animated ball.

- [keepie-uppie.tsx](../apps/web/src/components/keepie-uppie.tsx) — the game.
- Mounted in [not-found.tsx](../apps/web/src/app/not-found.tsx).

## Backlog detail

- **#1 Animated SVG favicon** — add `<animate>` to [icon.svg](../apps/web/src/app/icon.svg)
  for a one-shot ball bounce. Pure markup; Safari freezes SMIL so treat as
  progressive enhancement.
- **#3 Title-bar rally** — animate `document.title` while the tab is hidden
  (`visibilitychange`), restore on focus. Only ticks while backgrounded.
- **#4 CTA ball spin** — reuse `ball-spin-in` as a one-rotation hover on
  primary "Join"/"RSVP" buttons (transform-only).
- **#5 Net-draw dividers** — scroll-trigger `court-line-draw` as a section-header
  underline via a single `IntersectionObserver` (unobserve-on-fire).
- **#6 More confetti milestones** — extend `ConfettiBurst` triggers to
  "event filled to capacity", "onboarding complete", "first badge".
- **#7 Avatar high-five** — staggered single bounce of attendee avatars when an
  event hits capacity (`animation-delay` ladder).
- **#9 Slang key-buffer** — a global listener like `KonamiListener` that fires
  themed micro-confetti for "ace"/"dig"/"pancake".
- **#10 Date-aware sprinkles** — faint falling-ball motif on the homepage hero on
  a chosen volleyball day; CSS-only, RM opt-out.
- **#12 Pong-but-volleyball** — net in the middle, two paddles, on a `/play`
  route (route-isolated, ~150 LOC).
- **#13 Keepie-uppie on empty states** — promote the 404 game into a shared
  empty-state slot once it's proven; keep it opt-in so blank lists stay calm.
