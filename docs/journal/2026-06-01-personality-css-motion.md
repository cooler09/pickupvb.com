# Personality / brand-motion pass — pure-CSS flourishes (2026-06-01)

## Context

User request: "add some personality to the website" with fun, lightweight,
pure-CSS animations — explicitly **not** performance-hungry, must not break
compliance, and within reasonable browser support (or have a fallback). After
evaluating the design system the user picked all four proposed tracks: court
motif, micro-interactions, delight moments, and list polish.

The repo was already well-suited: full M3 motion tokens
(`--md-sys-motion-duration-*` / `--md-sys-motion-easing-*`), a disciplined
global `prefers-reduced-motion: reduce` defang at the foot of
[globals.css](../../apps/web/src/app/globals.css), and a brand motif already in
code ([DefaultCourtArt](../../apps/web/src/components/default-court-art.tsx) —
the top-down volleyball court). No animation library in the tree, and the icon
set is hand-rolled — so the whole pass is dependency-free CSS/SVG.

## Decisions

- **Pure CSS over a motion library.** No framer-motion/gsap — matches the
  existing toast/dialog/sheet keyframe approach and keeps the bundle at zero new
  deps. Every animation touches only compositor-friendly properties
  (transform / translate / rotate / opacity / box-shadow / stroke-\*) → no CLS,
  no main-thread jank.
- **Reuse the existing reduced-motion strategy, don't reinvent it.** Decorative
  one-shot entrances (`court-line-draw`, `ball-spin-in`, `fade-up`,
  `confetti-pop`) are defanged to ~0ms by the global rule and **snap to their
  END keyframe** — so nothing is ever left permanently hidden when motion is
  off (the reason `fade-up`/confetti animate _to_ the visible/settled state).
  Confetti therefore needs **no matchMedia JS** at all.
- **Functional motion stays finite + has a static fallback.** `spots-pulse`
  (capacity urgency) runs 1.5s × 3 = 4.5s then rests — under the WCAG 2.2.2 5s
  threshold, so no pause control is required — and ships an explicit static ring
  under reduced motion, mirroring `match-flash`.
- **Property-separation to avoid the fill-mode/`:hover` clash.** A finished
  `both`-filled entrance pins whatever property it animated and that pinned
  value wins over a normal `:hover` declaration in the cascade. So entrances
  animate the _individual_ `translate`/`rotate` properties while `card-lift`
  animates the `transform` shorthand — independent properties, no clobber. This
  is also why `ball-spin-in` animates `rotate` (not `transform`): the ball
  `<svg>` already carries Tailwind's `-translate-y-1/2` centering on `translate`.
- **Court flourish is opt-in (`animated` prop), hero-only.** Cards render
  `DefaultCourtArt` 6+ to a grid; leaving the entrance off there keeps grids
  calm and reserves the chalk-in + spin-in for the one wide hero per page.
- **Confetti is deterministic.** A fixed 14-piece fan, no `Math.random()` in
  render → stays pure for the React Compiler (audit pattern #4). Mounted
  conditionally on `banner.tone === 'success'` so it fires once on the
  flash-param navigation; colours read from `--tw-color-*` so they re-theme.
- **Button tactility lives in the canonical vocabulary.** Press (`active:
scale-[0.98]`) on all variants + a hover lift on the filled primary only,
  edited in [primary-button.tsx](../../apps/web/src/components/primary-button.tsx)
  (the lint-ratcheted home for button classes) so it lands everywhere with no
  call-site edits.
- **Skipped the theme-toggle "day/night morph"** from the original idea list:
  the toggle is a 3-way Light/Dark/System segmented control, not a binary
  sun↔moon, so a morph doesn't fit. List polish focused on the high-value
  staggered grid entrance instead.

## Changes

- [globals.css](../../apps/web/src/app/globals.css) — new "Personality / brand
  motion" section: `@keyframes` + classes for `court-line-draw`, `ball-spin-in`,
  `spots-pulse`, `fade-up`, `confetti-pop`, and `@utility` `card-lift` /
  `stagger-in`. All durations/easings from M3 tokens.
- [default-court-art.tsx](../../apps/web/src/components/default-court-art.tsx) —
  added optional `animated` prop; toggles `court-line-draw` on the lines `<svg>`
  and `ball-spin-in` on the ball `<svg>`.
- [hero-image.tsx](../../apps/web/src/components/hero-image.tsx) — passes
  `animated` to the fallback court (hero only).
- [confetti-burst.tsx](../../apps/web/src/components/confetti-burst.tsx) — **new**
  client component; deterministic 14-piece CSS burst.
- [rsvp-panel.tsx](../../apps/web/src/app/events/[id]/_components/rsvp-panel.tsx)
  - [ad-hoc-team-signup-panel.tsx](../../apps/web/src/app/events/[id]/_components/ad-hoc-team-signup-panel.tsx)
    — render `<ConfettiBurst/>` inside the (now `relative`) success banner.
- [event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) —
  `card-lift` on the tile; `spots-pulse` on the "N left" badge.
- [group-card.tsx](../../apps/web/src/app/groups/_components/group-card.tsx) —
  `card-lift` on the tile.
- [primary-button.tsx](../../apps/web/src/components/primary-button.tsx) —
  press feedback (all variants) + hover lift (primary).
- `stagger-in` on the card grids in
  [page.tsx](../../apps/web/src/app/page.tsx) (2),
  [events/page.tsx](../../apps/web/src/app/events/page.tsx) (2), and
  [groups/page.tsx](../../apps/web/src/app/groups/page.tsx) (1).

## Patterns observed

- **CSS animation `fill-mode` beats `:hover` in the cascade.** When an element
  carries both an entrance animation and a hover transform, animate _different_
  CSS properties (individual `translate`/`rotate` vs. the `transform` shorthand)
  or the filled end-state silently wins and the hover does nothing. Documented
  inline in the globals.css section header so the next agent doesn't "simplify"
  them onto one property. Candidate for the AGENTS.md patterns list if it
  recurs.
- **The global reduced-motion defang doubles as the confetti kill-switch** —
  because pieces animate _to_ opacity 0, the ~0ms collapse renders them
  invisible with no extra JS. Lean on this for any future one-shot burst.

## Follow-ups

- **Empty-state court charm** (part of the original "court motif" track) was not
  done — the empty states are scattered per-page and adding the motif to each is
  a separate, broader pass. `DefaultCourtArt animated` is ready to drop in when
  that's tackled.
- `stagger-in` is applied to 5 of the ~9 card grids; the directory pages
  (`/players`, `/teams`, profile/group sub-lists) can adopt the same class when
  convenient.
- Not yet verified in a real browser / against dev — changes are CSS-only and
  pass typecheck+lint+test+build, but the motion itself (confetti origin,
  chalk-in timing, pulse intensity) is worth an eyeball on `dev.pickupvb.com`.
