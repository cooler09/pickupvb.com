# Delight backlog: the remaining ten (2026-06-07)

## Context

Follow-on to [the first delight bundle](2026-06-07-bundle-delight-favicon-easter-egg-game.md)
(favicon LIVE dot, logo easter egg, 404 keep-ups). The user asked to implement
the whole [delight backlog](../delight-backlog.md). Shipped in three verified
batches, cheapest/most-isolated first, games last.

## Decisions

- **Batched + verified, not one mega-change.** A (easter-egg/favicon), B (CSS
  micro-animations), C (games), each typecheck/lint/test/build green before the
  next. Cheaper to localize a regression than to debug ten features against one
  red build.
- **Scroll-triggered divider via CSS `view()` timeline, not an IntersectionObserver.**
  `#5` is a pure-CSS server component — `animation-timeline: view()` drives the
  net "stringing" as it scrolls in. Browsers without scroll-timeline support
  ignore the property and, with no `animation-duration`, resolve straight to the
  settled end state — so it's visible everywhere, no JS, no hydration dance.
  Rejected an IO client component (more code, a flash-of-hidden to manage).
- **Easter eggs that don't fight real input.** `#9`'s global key-buffer skips
  while `document.activeElement` is an input/textarea/select/contenteditable, has
  a cooldown, and only matches a short slang list — so it never hijacks typing.
  `#3`'s title rally only runs while the tab is hidden and restores the exact
  pre-hide title (navigation can't happen while hidden, so the snapshot stays
  valid). Both are deliberately calm — no guilt-trip "come back" copy.
- **`#6` celebrates the first _observed_ completion, client-side.** The onboarding
  card hides on completion, so there's no server "just finished" event. A small
  client component fires confetti+toast the first load it sees `requiredComplete`
  and writes a per-user localStorage flag so it never repeats. Existing
  already-complete users get one gentle congrats on their next profile visit —
  accepted as harmless.
- **`#7` reuses the read model's `spotsRemaining`** (`=== 0` → full; `null` =
  unlimited, never fires), gated to page 1, so it's a one-shot mount bump with no
  new query.
- **`#12` volley-pong is its own `/play` route (noindex).** Route-isolation keeps
  the game out of every core bundle; `#13` reuses the keep-ups game on the _calm_
  events empty state via a `dynamic({ ssr: false })` lazy wrapper
  (`keepie-uppie-lazy.tsx`, mirroring `event-map-lazy.tsx`) so the shared
  `EventsEmptyState` doesn't drag the game into the events route's main bundle.
- **`#10` reframed, not built.** A purely decorative date-gated falling-ball
  sprinkle added ambient motion the "don't distract" bar doesn't want, and the
  interactive surfaces (#9/#11/#12/#13) already carry the playfulness. Documented
  as intentionally-deferred in the backlog rather than shipped.
- **`#4` is contained to one CTA.** A spinning ball on _every_ primary button
  would be noise (and touches the ratcheted button vocabulary), so it's just the
  homepage hero "Find events" button — a `.ball-serve-cta:hover .ball-serve` rule
  - one `<Icon name="volleyball">`.

## Changes

- New components: `slang-listener.tsx`, `idle-title-rally.tsx` (both mounted in
  `layout.tsx`), `net-divider.tsx`, `keepie-uppie-lazy.tsx`,
  `profile/_components/onboarding-celebration.tsx`,
  `play/_components/volley-pong.tsx`, `play/page.tsx`.
- `icon.svg` — CSS one-shot ball hop (`#1`).
- `globals.css` — `net-draw` (+ view-timeline), `ball-serve`, `high-five`
  keyframes/utilities.
- `page.tsx` — `NetDivider` + ball-serve hero CTA. `attendee-list.tsx` /
  `attendees-panel.tsx` — `celebrateFull` high-five. `profile/page.tsx` —
  onboarding celebration. `events-empty-state.tsx` — lazy keep-ups on the calm
  empty state. `not-found.tsx` — keep-ups `className` + `/play` link.
- `keepie-uppie.tsx` — accept a `className` so it can live in the 404 and an
  empty state with different spacing.
- Docs: `delight-backlog.md` (all 13 marked shipped/reframed).

## Patterns observed

- **`SiteHeader` had to move inside `ToastProvider`.** `BrandMark` (bundle 1)
  calls `useToast`, but the header was mounted _outside_ the provider — a latent
  runtime `useToast must be used within ToastProvider` that typecheck/lint/build
  can't see. Fixed in `layout.tsx`. Lesson: any component that consumes a context
  provider must be inside it, and the static checks won't catch a provider-scope
  miss — only a render does.
- **`view()` scroll-timeline is a clean progressive-enhancement lever.** No-JS,
  graceful fallback to the end state, RM-safe via the global rule. Good default
  for "reveal on scroll" decoration.
- **Canvas-game shape is now a repeatable template** (keep-ups + volley-pong):
  refs for physics, state only for score, `const`-rebind to keep `canvas`/`ctx`
  non-null in nested closures, `visibilitychange` pause, reduced-motion static
  fallback.

## Follow-ups

- **Real-browser pass still owed.** All quad-green, but favicon animation/swap,
  canvas rendering, the `view()` timeline divider, and the title rally only truly
  show in a browser — eyeball on a deployed preview.
- **`#10` calendar hook** can be revived for a specific date campaign if wanted.
- If volley-pong proves popular, consider a visible entry point beyond the 404 /
  keep-ups card (e.g. a `/tools` listing) — left out deliberately to keep it a
  low-key easter-egg route.
