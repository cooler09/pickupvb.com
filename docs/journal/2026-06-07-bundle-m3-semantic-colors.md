# M3 semantic color roles — warning/success + Alert/Toast (2026-06-07)

## Context

S2 of the M3 re-audit ([docs/audits/m3-alignment.md](../audits/m3-alignment.md)):
the M3 color roles shipped in Bundle 129 but the surface-container hierarchy +
most container roles sit at **0 adoption**, while the dark-mode-fragile raw
palette they were meant to replace grew to **555** utils. 93% of those are four
semantic families — red 215 (error), amber 161 (warning), emerald 85 + green 54
(success). The dark-mode contrast bugs that originally motivated finding #1 all
trace to hand-rolling per-theme palette guesses (`bg-red-50 … dark:bg-red-950/40`)
at each call site. This bundle takes the first, highest-leverage S2 step.

## Decisions

- **Chose custom `warning` + `success` roles over reusing `tertiary`.** M3
  ships neither. Tertiary is the brand sand/gold — overloading it with
  "caution" muddies its meaning, and there's no spare role for "success" at
  all. Defining both as full role families (role/on/container/on-container)
  mirrors `error` exactly and keeps the vocabulary legible.
- **Generated, not hand-picked, via the same tones as `error`.** Extended
  [gen-palette.ts](../../scripts/gen-palette.ts) with amber/emerald seeds and
  the M3 error tone rows (container = tone 90 light / 30 dark; on-container =
  tone 10 / 90). So the new container surfaces are contrast-correct **by
  construction** — the one safety net that matters when you can't eyeball dark
  mode.
- **Migrated only the two centralized surfaces (`Alert`, `Toast`); no codemod,
  no ratchet.** Unlike the type scale, raw color is _contextual_: the
  scoreboard's red/green are **team** colors, a danger panel's red is
  destructive-action chrome, a form's `text-red-600` is an inline error. None
  map 1:1, so a blind sweep would miscolor team courts, and the family can't
  reach zero to lock. `<Alert>`/`useToast` are the two surfaces literally named
  "semantic notice" — fixing them fixes every consumer at once with no judgment
  per call site.
- **Left `info` untouched.** It was already on brand tokens (`primary/10`), not
  raw palette, and `md-primary` is a different teal tone than brand `primary` —
  migrating it would have recolored info for no S2 benefit.

## Changes

- [scripts/gen-palette.ts](../../scripts/gen-palette.ts) — `warning` (amber
  `#D97706`) + `success` (emerald `#059669`) seeds, palettes, and light/dark
  role rows.
- [globals.css](../../apps/web/src/app/globals.css) — 16 new
  `--md-sys-color-{warning,success,…}` vars (light + dark `:root`) + 8
  `--color-md-{warning,success}*` utilities in `@theme inline`.
- [alert.tsx](../../apps/web/src/components/alert.tsx) +
  [toast.tsx](../../apps/web/src/components/toast.tsx) — error/warning/success
  variants (surface + toast focus-ring map) → `bg-md-{role}-container
text-md-on-{role}-container border-md-{role}/30`; `dark:` forks deleted.
- [AGENTS.md](../../AGENTS.md) — new **pattern 17** (semantic surfaces use role
  tokens; the warning/success caveat; "not every red/green is semantic").

## Patterns observed

- **The role token _is_ the dark-mode fix.** Because each `--md-sys-color-*`
  carries a light and a dark value, a surface painted with `bg-md-{role}-container
text-md-on-{role}-container` needs **zero** `dark:` variants — the recurring
  contrast bugs came from authors hand-guessing the dark side. Promoted to
  pattern 17.
- **Alpha-modified role utilities emit via `color-mix`.** `border-md-warning/30`
  compiles to `color-mix(in oklab, rgb(var(--md-sys-color-warning)) 30%,
transparent)` with a solid `rgb(var(...))` fallback rule — verified in the
  built CSS. (Same built-CSS-grep discipline as the type-scale bundle: a green
  quad does **not** prove a previously-unused token actually emits.)

## Follow-ups

- **Surface-container hierarchy (S2, still 0 usages)** — `md-surface-container*`
  / `md-outline*` / `md-on-surface-variant` for cards, panels, dividers. The
  judgment-heavy core of the original dark-mode finding; its own bundle.
- **Scattered semantic palette** — status pills, inline form-error
  `text-red-600`, hand-rolled error _banners_. Each can now reach for the roles;
  per-surface reviewable diffs. **Update (same day): the four
  destructive-confirmation panels** (cancel-event, delete-team, delete-group,
  account-delete) are done — panel chrome → `md-error`, plus account-delete's
  amber/green → `md-warning`/`md-success` (first all-three-roles consumer
  outside Alert/Toast). **And (same day) the ~8 hand-rolled error/notice
  _banners_** (forgot-password, both community forms, new-event-form,
  community-notice, the two signup panels, import-client) were swapped for
  `<Alert variant>` — wrapping the ref'd `useAlertReveal` div per pattern 15,
  mapping tone→variant, recoloring import-client's dense result rows in place.
  **Net raw palette 555 → 395.** Then (same day) the **centralized semantic
  recipes** — `fieldErrorClass` / `FieldError` / `TextField` error,
  `StatusPill`, the 3 duplicated payment-status maps, `rsvp-flash` error, the
  inline Paid/Pending/Refunded labels — moved to role tokens, fixing dark-mode
  error text app-wide (was dark-red-on-dark). **Net 395 → 350.** Then every
  **destructive text-button + inline error** (`text-red-600` Withdraw/Leave/
  Remove + `role=alert` error `<p>`s, 29 sites) → `text-md-error` via a
  token-safe global codemod (`text-red-600` is never a bg-badge). **Net 350 → 305.** Then the symmetric counterpart — **inline success/warning text**
  (`text-emerald-700` "saved"/template/scoreboard → `text-md-success`,
  `text-amber-700` labels/counts → `text-md-warning`, 12 files) — via exact
  full-className subs (green/amber _shares_ shades with bg-badges, so no blanket
  codemod; only the 12 inline files changed, zero badges). **Net 305 → 277**;
  inline semantic-text migration now complete (red+green+amber). Then the
  hand-rolled **warning/success notice panels** (community/billing/edit-event +
  the tip-thanks flash → `<Alert>`) → container roles (`bg-md-warning-container`
  / `*/5` tints). **Net 277 → 227.** See the m3-alignment remediation log. The
  **remainder is visual-review** — bg-tinted status badges (mixed semantics +
  pale-pill-on-dark behavior) + the app-wide surface migration — best done with
  eyes on the running app, not more blind recolors.
- **No palette ratchet yet** — raw red/amber/emerald can't reach zero
  (decorative/team uses remain), so the lint lock waits until a _fully
  migratable_ sub-bucket exists.

## Verify

15/15 typecheck · lint 0 errors / 3 pre-existing `set-state-in-effect`
warnings · 268 web tests (+ domain/application) · 8/8 build · built-CSS
confirms the warning/success container, on-container, alpha-border (`color-mix`)
and ring utilities emit with both light and dark values.
