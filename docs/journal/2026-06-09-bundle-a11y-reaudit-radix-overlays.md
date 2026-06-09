# 2026-06-09 — Accessibility re-audit (D1–D2) + Radix overlay migration (C7)

## Context

User asked to re-audit accessibility (bugs, gaps, improvements, stale code) and
then to "fix them all." The [accessibility.md](../audits/accessibility.md) audit
was last touched 2026-06-08 (the monetization/chat/media/games pass that closed
C1–C6 and left C7–C8 open). This re-audit ran the day after, swept the
just-shipped legal/footer rework + a fresh app-wide anti-pattern grep, opened **2
new P3s (D1–D2)**, confirmed every prior ratchet still holds (no P1/P2), then
fixed D1–D2 and took on the full **C7** Radix-dialog migration. C8 (shared
Combobox primitive + end-to-end AT testing) stays open by the user's scoping
choice. Quad-green throughout.

## Decisions

- **D1 — the scoreboard match save-bar status was silent to AT and used raw
  palette.** The "Saved ✓" / save-error in `SaveToMatchBar`
  ([scoreboard-view.tsx](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx))
  rendered into a plain `<div>` (no live region) and used `text-emerald-500` /
  `text-red-400` (the `-400` red is sub-AA on the white scoreboard theme). Gave
  the success span `role="status"`, the error span `role="alert"`, and swapped
  both to `text-md-success` / `text-md-error`. The green "Save final to match"
  button was left raw — it's a decorative/functional CTA, not a status surface
  (AGENTS.md §17).

- **D2 — the public-profile follow toggle skipped the established `aria-pressed`
  convention.** [player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx)
  conveyed follow state by label text only. Added `aria-pressed` (matching
  `players-follow` / `groups-follow` / `block-control` / media-card vote chips)
  and `type="button"` to all three buttons (not in a `<form>`, so no
  accidental-submit bug — just the repo convention).

- **C7 — migrate all 6 hand-rolled overlays to Radix; delete the interim
  `useDialogFocusTrap`.** The 2026-06-03 A3 hand-roll was explicitly an interim
  to be superseded "once the Radix Dialog primitive lands" — it has
  ([form-modal.tsx](../../apps/web/src/components/form-modal.tsx)). Rather than
  reuse `FormModal` (which self-manages `open` via a trigger render-prop), the
  controlled/anchored overlays use the Radix primitives directly — the
  sanctioned "thin RadixDialog wrapper" path:
  - **Scoreboard `ShareModal` + `WinnerOverlay` → `@radix-ui/react-dialog`**
    (controlled, portaled). `WinnerOverlay` `preventDefault`s Escape +
    pointer/interact-outside because the match is over and the overlay has no
    dismiss (the user must pick Rematch/New game/Save) — Radix still gives the
    focus-move-in + trap. The team name is the `Dialog.Title` (accessible name)
    and the "Match won" eyebrow the `Dialog.Description`. The root is full-screen
    `fixed inset-0`, so portaled `fixed` content is visually identical to the old
    `absolute inset-0`.
  - **notification-bell + share-link → `@radix-ui/react-popover`** (new dep).
    Both are non-modal dropdowns, so Radix's Escape / outside-click dismissal,
    return-focus-to-trigger, and free `aria-expanded`/`aria-controls`/
    `aria-haspopup` are exactly right. share-link sheds its `<details>` +
    document-`click`/`keydown` listener hack entirely; notification-bell sheds
    its `containerRef` + mousedown/keydown effect.
  - **datetime-picker → `@radix-ui/react-popover`.** Kept `id={name}` on the
    `Popover.Trigger` button so the form's external `<label htmlFor>` (e.g. the
    Bundle-50 `registrationClosesAt` association) still resolves, and used
    `Popover.Close` for the Done button (close + return-focus for free). Radix's
    layer stack means Escape dismisses only the picker when it's nested inside a
    `FormModal`, replicating the old hand-rolled `stopPropagation`.
  - **mobile-menu → `@radix-ui/react-dialog`.** The one with real regression
    risk (core nav). Preserved: the hamburger↔X toggle (Radix `Dialog.Trigger`
    toggles `open`, so clicking the X closes); the `top-[57px]` full-width drawer
    anchor; and the header trigger staying _above_ the scrim (Overlay pinned to
    `z-40`, below the `z-50` header). Deleted: the `FOCUSABLE` selector +
    focus-trap/Escape effect + scroll-lock effect (all from the primitive now).
    **Kept** only the route-change-close effect (`lastPathnameRef` + `setOpen`) —
    Radix can't know a `<Link>` navigated. A visually-hidden `Dialog.Title`
    ("Main menu") supplies the accessible name.

- **Motion bridged via one new CSS class, not a library.** Added
  `.md-popover-motion` to [globals.css](../../apps/web/src/app/globals.css)
  mirroring the existing `.md-menu-motion` (reuses the `md-menu-enter/exit`
  keyframes, reads `--radix-popover-content-transform-origin`). Dialogs reuse the
  existing `.md-dialog-overlay` / `.md-dialog-motion`. The global
  `prefers-reduced-motion` block already defangs all of it.

## Deferred

- **C7 e2e/AT sign-off.** The two behavior-sensitive surfaces — the mobile-nav
  drawer and the datetime popover — are static + quad-green only. A deploy-gated
  Playwright run + a VoiceOver/NVDA pass should confirm the toggle/return-focus
  and the nested-Escape behavior before final sign-off. Folded into the standing
  **C8** "end-to-end AT testing" item.
- **C8 — shared Combobox primitive.** `address-autocomplete` + `user-picker`
  still each hand-wire the WAI-ARIA combobox; consolidation is now reasonable
  alongside the Radix adoption but the user scoped it out of this bundle.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green (356 web unit
tests + the domain/application suites). The 3 lint warnings
(`react-hooks/set-state-in-effect` in the scoreboard theme-restore effects) are
pre-existing and unrelated to this bundle. `@radix-ui/react-popover` was added
with `pnpm --filter @pickupvb/web add …` then `pnpm install` (the documented
peer-dep reconcile step).
