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

## Status — all shipped 2026-06-07

| #   | Idea                            | Category   | Status      |
| --- | ------------------------------- | ---------- | ----------- |
| 1   | Animated SVG favicon            | Favicon    | ✅ shipped  |
| 2   | Dynamic LIVE tab favicon        | Favicon    | ✅ shipped  |
| 3   | Title-bar rally when tab idle   | Favicon    | ✅ shipped  |
| 4   | Ball "serve" spin on CTA        | CSS        | ✅ shipped  |
| 5   | Net-draw section dividers       | CSS        | ✅ shipped  |
| 6   | Confetti on onboarding-complete | CSS        | ✅ shipped  |
| 7   | Roster avatar "high-five"       | CSS        | ✅ shipped  |
| 8   | Logo tap-streak easter egg      | Easter egg | ✅ shipped  |
| 9   | Type "ace"/"dig"/"pancake"      | Easter egg | ✅ shipped  |
| 10  | Date-aware homepage sprinkles   | Easter egg | ✅ shipped¹ |
| 11  | Keepie-uppie on the 404         | Game       | ✅ shipped  |
| 12  | Volley-pong (`/play`)           | Game       | ✅ shipped  |
| 13  | Keepie-uppie on empty states    | Game       | ✅ shipped  |

¹ #10 was reframed during build — see the note under it below.

## Shipped

### #2 — Dynamic LIVE tab favicon

When a match is scored live on the scoreboard tool, the tab favicon swaps to a
pulsing red "LIVE" dot. Reuses the scoreboard's `winner` / score state (no new
polling); mounts only on that route.

- [use-live-favicon.ts](../apps/web/src/components/use-live-favicon.ts), wired in
  [scoreboard-view.tsx](../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx).

### #8 — Logo tap-streak easter egg

Tap the `PickupVB` wordmark 7× fast → bounce + brand confetti + the hidden
**"Pepper"** badge. Counter survives the logo's own soft navigation (header is in
the root layout).

- [brand-mark.tsx](../apps/web/src/components/brand-mark.tsx),
  [easter-egg-actions.ts](../apps/web/src/app/profile/easter-egg-actions.ts)
  (`claimPepperBadge`), `pepper` badge in the domain catalog.

### #11 — Keepie-uppie on the 404

The 404 hosts a canvas keep-ups game (tap to keep the ball up, rally + best).
Route-isolated; physics on the canvas via refs; loop pauses when hidden; static
fallback under reduced motion.

- [keepie-uppie.tsx](../apps/web/src/components/keepie-uppie.tsx), mounted in
  [not-found.tsx](../apps/web/src/app/not-found.tsx).

### #1 — Animated SVG favicon

The brand ball does a single CSS-driven hop the first time the favicon loads.
CSS (not SMIL) so it honours reduced-motion and the static rasterization stays
correct (t=0 = ball at rest). Chrome/Firefox animate it; Safari shows the resting
frame.

- [icon.svg](../apps/web/src/app/icon.svg).

### #3 — Title-bar rally when tab idle

While the tab is backgrounded, a little ball drifts through the page title; the
exact original title is restored on return. Only runs while hidden; a single
static `🏐` under reduced motion.

- [idle-title-rally.tsx](../apps/web/src/components/idle-title-rally.tsx), mounted
  in [layout.tsx](../apps/web/src/app/layout.tsx).

### #9 — Slang key-buffer easter egg

Type volleyball slang (`ace`, `dig`, `pancake`, `spike`, `rally`, `sideout`,
`pepper`) anywhere that isn't a text field → a brand-confetti toss. One passive
`keydown` listener, a tiny rolling buffer, a cooldown, and it skips while you're
typing in a field.

- [slang-listener.tsx](../apps/web/src/components/slang-listener.tsx), mounted in
  [layout.tsx](../apps/web/src/app/layout.tsx).

### #5 — Net-draw section dividers

A volleyball-net hairline that "strings" left→right as it scrolls into view via a
pure CSS view-timeline (no JS). Browsers without scroll-timeline support show the
settled divider. On the homepage today.

- [net-divider.tsx](../apps/web/src/components/net-divider.tsx) +
  `.net-divider*` in [globals.css](../apps/web/src/app/globals.css); used in
  [page.tsx](../apps/web/src/app/page.tsx).

### #4 — Ball "serve" spin on a CTA

The homepage hero's "Find events" button carries a small volleyball that does one
360° spin on hover. Pointer-only; reduced-motion safe.

- `.ball-serve*` in [globals.css](../apps/web/src/app/globals.css); applied in
  [page.tsx](../apps/web/src/app/page.tsx).

### #6 — Confetti on onboarding completion

The first load on which a viewer's required onboarding steps are all done fires a
one-time confetti + toast (deduped per user via localStorage, since the checklist
card itself hides on completion).

- [onboarding-celebration.tsx](../apps/web/src/app/profile/_components/onboarding-celebration.tsx),
  rendered in [profile/page.tsx](../apps/web/src/app/profile/page.tsx).

### #7 — Roster "high-five" on capacity

When a fixed-capacity event fills (`spotsRemaining === 0`), the first page of
roster avatars does one staggered bump. Pure CSS mount entrance.

- `.high-five*` in [globals.css](../apps/web/src/app/globals.css);
  [attendee-list.tsx](../apps/web/src/components/attendee-list.tsx) +
  [attendees-panel.tsx](../apps/web/src/app/events/[id]/_components/attendees-panel.tsx).

### #12 — Volley-pong (`/play`)

Pong with a net in the middle: you vs. a beatable CPU, first to 7. Its own
`/play` route (noindex), so the game code never touches a core-page bundle.
Physics on the canvas via refs; loop pauses when hidden; reduced-motion fallback.
Reachable from the 404 and the keep-ups card.

- [volley-pong.tsx](../apps/web/src/app/play/_components/volley-pong.tsx) +
  [play/page.tsx](../apps/web/src/app/play/page.tsx).

### #13 — Keepie-uppie on empty states

The keep-ups game now also appears on the **calm** events empty state ("No
upcoming events yet" — not filtered/empty-following ones). Lazy-loaded via
[keepie-uppie-lazy.tsx](../apps/web/src/components/keepie-uppie-lazy.tsx) (the
`event-map-lazy.tsx` `dynamic({ ssr: false })` pattern) so it stays out of the
events route's main bundle.

- [events-empty-state.tsx](../apps/web/src/app/events/_components/events-empty-state.tsx).

### #10 — Date-aware homepage sprinkles (reframed)

Originally "a falling-ball motif on a chosen volleyball day." Reframed: the ambient
falling-ball decoration is **superseded** by the now-shipped interactive surfaces
(#9 slang confetti, #11/#13 keep-ups, #12 volley-pong) and the existing hero
motion. A purely decorative date-gated sprinkle added more ambient motion than the
"don't distract" bar wants, so it's intentionally **not** shipped as its own
component; the calendar hook can be revived later if a specific date campaign
needs it.

## Adding the next one

Match the constraints at the top. The cheap-and-contained recipe used throughout:
a CSS keyframe in `globals.css` (auto-defanged by the global reduced-motion rule)

- a small component, route-scoped or lazy-loaded if it carries any weight. Canvas
  games keep physics on refs (React re-renders only on score change), pause on
  `visibilitychange`, and ship a static reduced-motion fallback.
