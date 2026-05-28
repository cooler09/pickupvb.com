# Material Design 3 alignment — 2026-05-28

> **Status update (2026-05-28, Bundle 129):** Tokens bundle shipped —
> the **vocabulary half** of P1 #1 (color roles), P1 #2 (type scale),
> P2 #5 (elevation scale), P2 #6 (motion scale), P2 #7 (shape scale),
> and P2 #16 (safe-area) is live in
> [globals.css](../../apps/web/src/app/globals.css) and the layout
> [viewport](../../apps/web/src/app/layout.tsx) carries
> `viewportFit: 'cover'`. New `scripts/gen-palette.ts` generates the
> tonal palette from the brand seeds (teal `#439093` / coral `#F09B93` /
> sand `#E9DD8A` / neutral `#183334`) via
> `@material/material-color-utilities` — re-run on seed change, paste
> output back in. Zero runtime weight ships.
>
> **Importantly the legacy `--tw-color-*` aliases are unchanged** —
> every existing utility (`bg-primary`, `text-fg`, `bg-surface`, …)
> renders identically to pre-bundle, so this is a zero-visual-change
> bundle. M3 roles are exposed as parallel Tailwind utilities under the
> `md-` prefix (`bg-md-primary`, `text-md-on-surface-variant`,
> `border-md-outline`, `rounded-shape-md`, `shadow-elevation-2`,
> `text-headline-md`, `pt-safe`/`pb-safe`/…) ready for opt-in migration
> in Bundles 2 onward. Per-finding headers flipped to **🟡 Tokens
> shipped** — the call-site migration half remains open.
> See [Bundle 129 journal](../journal/2026-05-28-bundle-129.md) and the
> [Remediation log](#remediation-log).

> **Status (2026-05-28):** New audit. Driven by the observation that
> mobile UX keeps requiring rework bundle-over-bundle (see
> [events-page-ux.md](events-page-ux.md), Bundles 117/118/120/121/127/128).
> Diagnosis: the repo has tokens and components but no shared **design
> system** — no canonical type scale, elevation scale, motion scale,
> state-layer convention, or shape system. Material 3 is, at heart,
> exactly that system; this audit lays out adopting the M3 **system**
> (tokens, semantics, interaction patterns) while keeping our existing
> stack: Tailwind v4 + hand-rolled components in Server Components +
> Radix UI for the handful of widgets that justify a headless primitive.
>
> **What we are NOT doing:** swapping in `@mui/material`. The trade-off
> is laid out in [§ "Why not MUI"](#why-not-mui) — short version:
> Emotion + CSS-in-JS would collide with Tailwind v4, every primitive
> would have to flip to `'use client'` (regressing TTFB / streaming on
> server-component pages), and the Material visual language would push
> us off-brand. We adopt the **design system**, not the React library.
>
> **What we preserve, non-negotiable:** full SEO posture (no
> `force-dynamic` regressions, JSON-LD, OG metadata, server-rendered
> first paint); existing accessibility wins from
> [accessibility.md](accessibility.md) (FieldError sweep, combobox ARIA,
> focus trap on `MobileMenu`, `<dialog>` modal primitive); the
> `data-theme` light/dark toggle and the teal/coral/sand brand palette
> (re-expressed as an M3 tonal palette seeded from the existing brand
> colors — not replaced with Material's default purple).

## Scope

Static review of the visual + interaction layer in `apps/web` against
the **Material Design 3** specification ([m3.material.io](https://m3.material.io/)),
covering: color system (tonal palettes, role tokens, surface containers,
state layers), typography (type scale + roles), shape system, elevation,
motion (easing + duration tokens), layout/density, components
(buttons, cards, dialogs, snackbars, navigation drawer, FAB, chips,
text fields, switches/checkboxes/radios, tabs, lists, menus,
date/time pickers), and adaptive/responsive patterns (mobile-first
breakpoints, touch targets, safe-area handling). Out of scope: domain
logic, routing, server actions, RLS, payments — addressed in other
audits.

Reference components walked:
[primary-button.tsx](../../apps/web/src/components/primary-button.tsx),
[submit-button.tsx](../../apps/web/src/components/submit-button.tsx),
[alert.tsx](../../apps/web/src/components/alert.tsx),
[toast.tsx](../../apps/web/src/components/toast.tsx),
[form-modal.tsx](../../apps/web/src/components/form-modal.tsx),
[mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx),
[nav-dropdown.tsx](../../apps/web/src/components/nav-dropdown.tsx),
[notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx),
[site-header.tsx](../../apps/web/src/components/site-header.tsx),
[datetime-picker.tsx](../../apps/web/src/components/datetime-picker.tsx),
[user-picker.tsx](../../apps/web/src/components/user-picker.tsx),
[field-error.tsx](../../apps/web/src/components/field-error.tsx),
[pagination.tsx](../../apps/web/src/components/pagination.tsx),
[address-autocomplete.tsx](../../apps/web/src/components/address-autocomplete.tsx),
plus the token sheet at
[globals.css](../../apps/web/src/app/globals.css#L1-L150).

---

## Why not MUI

Recorded here so the rejection is durable; re-open if any of these
change.

1. **Two styling systems would coexist.** MUI ships Emotion as the
   default styling engine; Tailwind v4 already owns class-based
   styling app-wide via `@theme inline` tokens. Running both doubles
   the styling cache, inflates SSR work, and forces us to keep two
   theme objects in sync (the MUI `createTheme()` palette + our CSS
   custom properties in
   [globals.css](../../apps/web/src/app/globals.css#L1-L90)).
   `@mui/material-pigment-css` (zero-runtime) is on the table but
   still pre-1.0 and adds a build-time codegen step.
2. **`'use client'` regression.** Nearly every MUI component is a
   client component (Button, TextField, Dialog, Drawer, Menu, …).
   Adopting MUI means lifting `'use client'` into pages that are
   server-rendered today — directly contradicting the AGENTS.md rule
   "lift `'use client'` only when needed" and hurting first-paint /
   streaming on the routes that already index well for SEO
   (`/events`, `/events/[id]`, `/groups/[id]`, `/teams/[slug]`,
   `/about`, `/about/numbers`).
3. **Bundle weight.** `@mui/material` + `@mui/icons-material` adds
   ~90–120 KB gzip on top of current shipping JS. Current per-route
   payload is lean; this would regress the
   [performance.md](performance.md) baseline.
4. **Visual identity.** Material's defaults (filled buttons with
   ripple, elevation-heavy cards, FAB, M-style typography) read as
   "Android app." Customizing MUI away from Material defaults
   negates most of the "use the library so we look standard" benefit
   — at which point we've taken on the dependency without keeping
   the brand recognition.
5. **App Router + RSC churn.** MUI's App Router story stabilized
   only recently (`AppRouterCacheProvider`); upgrades and SSR
   workarounds would compete with our Next 16 / React 19 upgrade
   cadence.

The rejection is **not** about Material as a design system. M3 itself
is excellent — adopting the system is the point of this audit.

---

## Adoption strategy (B + C in plan terms)

- **B = tokens + principles.** Re-derive our brand palette as an M3
  **tonal palette** (tones 0–100 per key color) using
  [`@material/material-color-utilities`](https://www.npmjs.com/package/@material/material-color-utilities)
  (~10 KB, build-time / one-shot script — does not ship runtime
  weight). Add M3 type scale, elevation scale, motion scale, shape
  scale, and state-layer convention as CSS variables in
  [globals.css](../../apps/web/src/app/globals.css). All existing
  components keep their Tailwind classes; the **values behind the
  tokens** become principled.
- **C = Radix for the hard widgets.** Adopt `@radix-ui/react-*`
  primitives (unstyled, a11y-correct, RSC-friendly) for the five or
  six components where rolling our own keeps producing UX gaps:
  Dialog, DropdownMenu, Popover, Tooltip, Tabs, Toast (Snackbar).
  Style them with Tailwind classes that read M3 tokens. Each is
  tree-shaken (~5–15 KB) and most are server-component-safe at the
  shell level.

Bundles land **incrementally** — tokens first, then per-component
migrations driven by the per-component backlog below.

---

## P1 findings (ship-blocking design-system gaps)

### #1 No principled color system — ad-hoc Tailwind palette utilities mixed with brand tokens 🟡 Tokens shipped (2026-05-28, Bundle 129)

- **Where:**
  [globals.css#L14-L90](../../apps/web/src/app/globals.css#L14-L90)
  defines 11 brand tokens (`--tw-color-primary`, `--tw-color-surface`,
  etc.) but no surface-container hierarchy, no on-color pairings beyond
  `*-fg`, no outline tokens, no state-layer tokens, no
  inverse-on-surface. Components fall back to raw Tailwind palette
  classes for everything else: `bg-red-50` /
  `text-amber-900` / `border-emerald-300` (12 sites in
  [toast.tsx#L106-L120](../../apps/web/src/components/toast.tsx#L106-L120)
  alone), `text-red-600` / `bg-yellow-100` / `text-violet-700` across
  ~80 components. This is the root cause of the dark-mode regressions
  that keep showing up in events-page-ux remediation — there is no
  canonical "what color should a warning surface be at tone 90 in dark
  mode" because the system doesn't have surface tones at all.
- **Why P1:** Every UX iteration touches color decisions without a
  shared vocabulary. Dark mode contrast is whatever the author guessed
  at the call site.
- **Fix:** Generate an M3 tonal palette from the existing brand seeds
  (primary teal `#439093`, secondary coral `#F09B93`, tertiary
  highlight `#E9DD8A`, neutral `#183334` / `#F9EBD9`) using
  `material-color-utilities`. Emit the full M3 role-token set in
  [globals.css](../../apps/web/src/app/globals.css):
  - `--md-sys-color-primary` / `-on-primary` / `-primary-container` /
    `-on-primary-container`
  - same shape for `-secondary`, `-tertiary`, `-error`
  - `-surface`, `-on-surface`, `-on-surface-variant`,
    `-surface-container-lowest/-low/-/-high/-highest`
  - `-outline`, `-outline-variant`, `-scrim`,
    `-inverse-surface`, `-inverse-on-surface`, `-inverse-primary`
  - state-layer alphas: `--md-sys-state-hover-opacity: 0.08`,
    `-focus: 0.12`, `-pressed: 0.12`, `-dragged: 0.16`.
    Light + dark variants under `[data-theme='light' | 'dark']`.
    Keep current `--tw-color-*` aliases pointing at the matching M3
    roles so existing Tailwind utilities (`bg-primary`, `text-fg`)
    keep working — call sites migrate opportunistically. Land as a
    single bundle; zero component changes required.

### #2 No type scale — every heading/body class hand-tuned 🟡 Tokens shipped (2026-05-28, Bundle 129)

- **Where:** Page LOC walked: `text-base`, `text-sm`, `text-xs`,
  `text-lg`, `text-xl`, `text-2xl`, `text-3xl` all used without a
  semantic role. M3 defines 15 type roles (display L/M/S, headline
  L/M/S, title L/M/S, body L/M/S, label L/M/S) — we have none. The
  events page hero, the group header, the event list cards, and the
  marketing pages each invent their own heading sizes.
- **Why P1:** Heading hierarchy drift is already flagged in
  [accessibility.md](accessibility.md) (74 h1 / 153 h2 / 12 h3 — the
  ratios are wild). Without a semantic type scale we keep reinventing
  visual hierarchy per-page.
- **Fix:** Add the M3 type scale as Tailwind utility classes via
  `@theme` in [globals.css](../../apps/web/src/app/globals.css):
  ```css
  @theme inline {
    --text-display-lg: 57px;
    --text-display-md: 45px;
    --text-display-sm: 36px;
    --text-headline-lg: 32px;
    --text-headline-md: 28px;
    --text-headline-sm: 24px;
    --text-title-lg: 22px;
    --text-title-md: 16px;
    --text-title-sm: 14px;
    --text-body-lg: 16px;
    --text-body-md: 14px;
    --text-body-sm: 12px;
    --text-label-lg: 14px;
    --text-label-md: 12px;
    --text-label-sm: 11px;
  }
  ```
  Pair each with the M3 line-height and tracking. Convert headings
  surface-by-surface (events list → event detail → host pages → admin
  → marketing). Lint rule (eslint-plugin-tailwindcss `no-arbitrary-classname`-style)
  forbids new `text-3xl` / `text-2xl` etc. once the migration
  reaches green.

### #3 Mobile touch targets — drift below 48 dp outside primary nav

- **Where:** [accessibility.md](accessibility.md) closed the mobile-nav
  P2 (44 px on hamburger + bell). Drift is back elsewhere:
  - [pagination.tsx](../../apps/web/src/components/pagination.tsx) —
    page links are `px-3 py-1.5 text-sm` (~32 px tall) — below M3's
    48 dp minimum.
  - Toast close button in
    [toast.tsx](../../apps/web/src/components/toast.tsx) — single
    `×` glyph in a `p-1` hit area.
  - `FormModal` close `×` in
    [form-modal.tsx#L107-L113](../../apps/web/src/components/form-modal.tsx#L107-L113)
    — `p-1` on a single `×`, ~24 px hit area.
  - `NavDropdown` trigger and `NotificationBell` items — small icon
    buttons throughout.
- **Why P1:** M3 mandates 48 dp; WCAG 2.5.8 AA (new in 2.2)
  requires 24 px minimum but 48 dp is the design-system target. This
  is the single highest-leverage mobile UX fix.
- **Fix:** Introduce a `tap-target` utility (`min-h-12 min-w-12
inline-flex items-center justify-center` — 48 px = 12 × 4 px in
  Tailwind v4's default scale). Sweep every icon-only button to apply
  it; the visual icon stays small, the hit area grows. Pair with an
  eslint rule (custom or `jsx-a11y` extension) that warns on
  `<button>`s containing only an SVG without `min-h-12`.

---

## P2 findings (next-bundle hardening)

### #4 No state-layer convention for hover/focus/pressed

- **Where:** Hover states are bespoke per component:
  `PrimaryButton` uses `hover:opacity-90`
  ([primary-button.tsx#L29](../../apps/web/src/components/primary-button.tsx#L29));
  `MobileMenu` trigger uses `hover:bg-fg/5`
  ([mobile-menu.tsx#L99](../../apps/web/src/components/mobile-menu.tsx#L99));
  `Pagination` links use whatever was easiest at the call site.
  M3's state layers are a single overlay (`on-surface` color at
  8%/12%/12%/16% alpha for hover/focus/pressed/dragged) painted
  consistently on every interactive surface.
- **Fix:** Define state-layer tokens (`--md-sys-state-*` alphas, from
  #1) and a one-line utility pattern:
  ```css
  @utility state-layer {
    @apply relative isolate;
    &::after {
      content: '';
      @apply pointer-events-none absolute inset-0 rounded-[inherit] bg-[currentColor] opacity-0 transition-opacity;
    }
    &:hover::after {
      @apply opacity-[0.08];
    }
    &:focus-visible::after {
      @apply opacity-[0.12];
    }
    &:active::after {
      @apply opacity-[0.12];
    }
  }
  ```
  Apply to `PrimaryButton`, every secondary/tonal/text button variant,
  nav items, list items, chip buttons, menu items. Replace per-site
  `hover:opacity-*` and `hover:bg-fg/5` ad-hoc rules.

### #5 No elevation scale — `shadow-sm` / `shadow-md` / `shadow-lg` chosen by feel 🟡 Tokens shipped (2026-05-28, Bundle 129)

- **Where:** [primary-button.tsx#L29](../../apps/web/src/components/primary-button.tsx#L29)
  hard-codes `shadow-sm`;
  [form-modal.tsx#L102](../../apps/web/src/components/form-modal.tsx#L102)
  uses `shadow-xl`; event cards, hero panels, header dropdowns each
  pick a shadow at random.
- **Fix:** M3's 5-level elevation scale as CSS vars
  (`--md-sys-elevation-0` through `-5`), with light + dark variants
  (dark mode uses tinted surfaces + lower elevation per spec).
  Rebuild as Tailwind utilities `elevation-0` … `elevation-5`.
  Audit current `shadow-*` usage and map each to the closest M3 level.

### #6 No motion scale — animations one-off 🟡 Tokens shipped (2026-05-28, Bundle 129)

- **Where:**
  [globals.css#L150-L175](../../apps/web/src/app/globals.css#L150-L175)
  defines `match-flash` with hard-coded `1.6s ease-out`. Toast
  enter/exit, modal open/close, dropdown reveal, drawer slide — each
  picks its own duration and easing.
- **Fix:** M3 motion tokens (`--md-sys-motion-duration-short1` =
  50 ms through `-long4` = 600 ms; `--md-sys-motion-easing-standard`,
  `-emphasized`, `-emphasized-decelerate`, `-emphasized-accelerate`).
  Use `emphasized` (`cubic-bezier(0.2, 0, 0, 1)`) as the default for
  most UI motion. Apply to existing animations; new motion must
  reference a token. Respect `prefers-reduced-motion` once globally
  in [globals.css](../../apps/web/src/app/globals.css) instead of
  per-keyframe (`match-flash` already does this — generalize).

### #7 No shape scale — every container picks its own `rounded-*` 🟡 Tokens shipped (2026-05-28, Bundle 129)

- **Where:** `rounded-md` (`PrimaryButton`), `rounded-lg` (`FormModal`),
  `rounded-xl` (event cards on `/events`), `rounded-2xl` (hero panel),
  `rounded` and `rounded-full` scattered.
- **Fix:** M3 shape scale (`--md-sys-shape-corner-none/-xs/-sm/-md/-lg/-xl/-full`).
  Map: buttons → `sm` (8 dp), cards → `md` (12 dp), dialogs → `lg`
  (16 dp), bottom sheets → `xl-top` (28 dp top corners), avatars +
  chips → `full`. Document the mapping in
  [globals.css](../../apps/web/src/app/globals.css) so the next
  component author doesn't reinvent it.

### #8 Toast UX diverges from M3 Snackbar (queueing, action affordance, position)

- **Where:** [toast.tsx](../../apps/web/src/components/toast.tsx)
  stacks toasts vertically with no max-visible cap, no action-button
  slot, fixed top-right position. M3 Snackbar spec: single visible
  snackbar at a time (queue the rest); optional action button on the
  right; bottom-center on mobile, bottom-left on desktop; auto-dismiss
  matches M3 duration tokens (4 s default, 6 s with action, 10 s
  persistent error). Action buttons are how Snackbars do error recovery
  ("Couldn't save. **Retry**") instead of dumping users at flash-param
  redirect pages.
- **Fix:** Migrate to `@radix-ui/react-toast` styled with M3 tokens.
  Single-visible queueing, action slot, M3 position rules,
  M3 enter/exit motion tokens. Keep the existing `useToast()` API so
  call sites don't change.

### #9 Dialog primitive lacks M3 affordances

- **Where:** [form-modal.tsx](../../apps/web/src/components/form-modal.tsx)
  is a solid native `<dialog>` shell shipped in Bundle 128, but it
  doesn't carry the M3 dialog structure: no icon slot, no
  divided-header-on-scroll, no standard "two-action footer" layout
  (left = dismissive, right = confirming, M3 ordering matters), no
  full-screen variant for mobile (M3 prescribes full-screen dialog on
  compact screens for forms with >3 fields).
- **Fix:** Add `<FormModal.Icon>`, `<FormModal.Footer>` with built-in
  action ordering (`destructive` / `dismissive` / `confirming` slot
  pattern), and a `fullScreenOnCompact` prop that flips to a
  full-screen layout below `sm`. Optionally swap the underlying
  primitive for `@radix-ui/react-dialog` if we want focus-trap and
  Esc behavior the spec instead of relying on `<dialog>`'s browser
  defaults — Radix gives us controlled `open` state without the
  `useEffect` bridge that [form-modal.tsx#L72-L89](../../apps/web/src/components/form-modal.tsx#L72-L89)
  needs today.

### #10 No FAB (Floating Action Button) on host-heavy pages

- **Where:** `/events/[id]` host view, `/groups/[id]` admin view,
  `/teams/[slug]` captain view. Primary host actions
  ("Add walk-in team", "Add division", "Invite captain") live in
  cards far down the page. On mobile, the host scrolls past their own
  game's score / roster to get to the action.
- **Fix:** Introduce an M3 FAB component (56 dp circle, primary
  container color, elevation-3, bottom-right, 16 dp inset, plus
  safe-area inset for iOS notch). One FAB per page maximum, surfacing
  the page's single most-likely host action. Animate on scroll
  (extended → collapsed) per M3 spec. Skip on read-only pages.

### #11 No bottom-navigation primitive — site uses desktop top nav on mobile

- **Where:** [site-header.tsx](../../apps/web/src/components/site-header.tsx)
  - [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx).
    Mobile users get a hamburger that hides every primary destination
    (Events / Groups / Teams / Profile). M3 prescribes a **navigation
    bar** at the bottom for 3–5 top-level destinations on compact
    screens; hamburger is reserved for secondary destinations only.
- **Fix:** Build a `BottomNav` component shown below `md` breakpoint
  with 4 destinations (Events / Groups / Teams / Profile-or-Sign-in).
  Hide on scroll-down, reveal on scroll-up (M3 standard). Move
  rarely-used items (settings, billing, theme toggle, sign out) into
  the hamburger / profile drawer. This is the single biggest mobile
  UX win on the table.

### #12 `<details>` / popover patterns used where M3 prescribes Menu

- **Where:** [nav-dropdown.tsx](../../apps/web/src/components/nav-dropdown.tsx),
  notification panel in
  [notification-bell.tsx#L149-L160](../../apps/web/src/components/notification-bell.tsx#L149-L160),
  ad-hoc disclosures in host panels (some converted to modal in
  Bundle 128, others still raw `<details>`).
- **Fix:** Adopt `@radix-ui/react-dropdown-menu` for all anchored
  menus (typeahead, arrow-key nav, item disabled state, separators).
  Style with M3 menu tokens (elevation-2 surface, M3 item heights,
  state layers from #4).

### #13 Text fields lack M3 structure (filled vs. outlined, supporting text, leading icon)

- **Where:** Form inputs across `apps/web/src/app/**/*-form.tsx`
  use bare `<input>` with hand-rolled `border` + `rounded-md`
  - `aria-invalid` styles. No supporting-text slot; error message
    rendering is via `<FieldError>` but visual integration isn't
    spec'd. No leading/trailing icon support. No floating label.
- **Fix:** Build a `TextField` primitive matching M3's outlined
  variant (filled is M3 default but reads as "Material app";
  outlined matches our current aesthetic better). Slots: leading
  icon, trailing icon, supporting text (helper or error), prefix /
  suffix. Wires `aria-invalid` + `aria-describedby` automatically
  (extends [field-error.tsx](../../apps/web/src/components/field-error.tsx)
  rather than replacing it). Migrate forms surface-by-surface;
  existing `<input>` calls keep working until migrated.

### #14 Bottom sheet primitive missing — modals on mobile are visually wrong

- **Where:** The Bundle 128 `FormModal` centers a `max-w-md` card on
  every viewport. On mobile this loses ~30% of vertical space to
  margins and lifts above the thumb zone. M3 prescribes a **bottom
  sheet** for modal forms on compact screens — slides up from the
  bottom, anchored to the bottom edge, swipe-down to dismiss.
- **Fix:** Add a `<BottomSheet>` variant of `<FormModal>` (or merge
  via `presentation="auto" | "dialog" | "sheet"` prop with `auto`
  picking sheet < `sm` breakpoint). Touch-drag dismiss handled by
  `@radix-ui/react-dialog` or `vaul`. Use M3 motion tokens
  (`emphasized-decelerate` for entry).

### #15 No density / responsive density

- **Where:** Every list, table, card uses one set of paddings.
  Receipts table and earnings table cram on mobile; group member list
  is sparse on desktop.
- **Fix:** M3 density scale (`comfortable` / `standard` / `compact`).
  Token: `--md-sys-density-scale: 0` baseline, with utility classes
  that subtract 4 dp per step. Apply to tables and dense lists
  per-breakpoint (`compact` on `xs`, `comfortable` on `md+`).

### #16 No safe-area handling for iOS notch / Android gesture bar 🟡 Utilities + viewport shipped (2026-05-28, Bundle 129)

- **Where:** Fixed-position elements (mobile menu drawer header,
  FAB once landed, eventual `BottomNav`) need `env(safe-area-inset-*)`
  padding. Toast viewport already at top — needs `pt:env(safe-area-inset-top)`.
- **Fix:** Add safe-area utility classes (`pb-safe`, `pt-safe`,
  `pl-safe`, `pr-safe`) in [globals.css](../../apps/web/src/app/globals.css)
  using `env(safe-area-inset-*)`. Set `<meta name="viewport" content="…, viewport-fit=cover">`
  in [root layout](../../apps/web/src/app/layout.tsx) (verify already
  present — if not, add). Apply to BottomNav (#11) + FAB (#10) +
  any fixed footer.

---

## P3 findings (nice-to-haves)

### #17 No icon set discipline

- **Where:** Each component imports its own SVG or uses
  [icon.tsx](../../apps/web/src/components/icon.tsx) inconsistently.
  `notification-bell.tsx`, `mobile-menu.tsx`, `hero-image-upload.tsx`
  all hand-roll SVGs.
- **Fix:** Adopt **Material Symbols** via
  `@material-symbols/svg-*` package (tree-shaken per-symbol, no font
  load), or stick with hand-rolled but enforce M3's geometric grid
  via lint. Lower priority — visual consistency is the win, not size.

### #18 No data-table primitive

- **Where:** Receipts and earnings pages roll their own `<table>`.
  M3 has a data-table spec (sort, density, selection, pagination
  embedded).
- **Fix:** Defer until a third table appears. Premature otherwise.

### #19 Theme-mode follow-system signal not exposed

- **Where:** [theme-toggle.tsx](../../apps/web/src/components/theme-toggle.tsx)
  toggles light/dark binary. M3 spec includes "match system" as a
  first-class third option (mode = `system`).
- **Fix:** Add `system` mode that listens to
  `prefers-color-scheme` and updates `data-theme` on the fly. Persist
  user preference (`light | dark | system`) in cookie. Low priority;
  current binary works for most users.

### #20 Tonal palette unlocks new brand surfaces — explore tertiary container

- **Where:** Our `--tw-color-highlight` (sand `#E9DD8A`) is currently
  used only for the bracket-match flash animation. Once #1 lands, the
  tertiary container becomes a usable surface for "informational
  emphasis" (e.g. "Walk-in" pill on team list — currently violet
  ad-hoc).
- **Fix:** Audit non-token color usages (red/amber/violet/emerald)
  and migrate the ones that map onto M3 roles (error / warning /
  tertiary / success).

### #21 Switch / Checkbox / Radio not styled to M3 spec

- **Where:** Forms use native checkbox/radio with default browser
  styling.
- **Fix:** Build M3-spec Switch (Tailwind-styled, accessible labeled),
  Checkbox, Radio Group primitives. Native first, custom only where
  M3 visual fidelity matters (Switch is the obvious one — native
  checkboxes look fine).

### #22 No Chip primitive

- **Where:** Pills/tags inline-styled per call site (event status
  pills, walk-in pill from Bundle 120, free-agent count badges).
- **Fix:** `Chip` primitive with `assist` / `filter` / `input` /
  `suggestion` variants per M3 spec. Lowest priority — current
  ad-hoc usage is small and visually consistent enough.

---

## Open questions

1. **Material Symbols vs. keep hand-rolled SVGs?** Trade ~3 KB / icon
   for visual consistency with M3 spec exemplars. Bias toward
   hand-rolled given current size.
2. **Pigment CSS or stay tokens-only?** Once tokens land, do we ever
   want a CSS-in-JS escape hatch for one-off dynamic theming
   (per-event accent color from host's group palette)? Probably no
   — CSS variables can be set inline on a wrapper and Tailwind v4
   handles that natively.
3. **Bottom nav: 4 destinations or 5?** M3 allows 3–5; UX research
   recommends 5 to surface Profile separately from Sign-in. Current
   nav surfaces Events / Groups / Teams / Profile (or Sign-in) = 4.
   Add Notifications as a 5th to surface the bell as a destination
   on mobile?
4. **Should we add Radix dependencies one-at-a-time (per #8/#9/#12)
   or in a single bundle?** One-at-a-time is safer (each PR is small)
   but means contributors hit "do we already use Radix Dialog or
   should I roll my own" twice before the convention settles.
   Recommend: introduce Radix as a dependency in the same bundle as
   #8 (Toast) and document the convention in
   [AGENTS.md](../../AGENTS.md) immediately.
5. **Type-scale migration: lint-enforced or carrot?** Adding an
   eslint rule that forbids new `text-{n}xl` once #2 lands is
   strict; carrot-only means drift returns. Recommend lint with an
   explicit `// eslint-disable-line` escape hatch for the rare
   marketing surface.
6. **Do we ever want Material You "dynamic color"?** Per-user theme
   derived from a seed color the user picks. M3 supports it natively
   once #1 lands (regenerate tonal palette client-side). Could be a
   Pro perk. Not blocking.

---

## Recommended bundle sequence

Each bundle ends with `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
per [AGENTS.md](../../AGENTS.md) and a journal entry under
[docs/journal/](../journal/).

1. **Tokens bundle** (P1 #1, #2 + P2 #5, #6, #7, #16). Pure
   [globals.css](../../apps/web/src/app/globals.css) + new
   `scripts/gen-palette.ts` one-shot. Zero component changes.
   Establishes the vocabulary.
2. **Touch targets sweep** (P1 #3). Mechanical: every icon-only
   button gets the new `tap-target` utility. Touches ~20 files;
   no semantic changes. Add lint rule.
3. **State layers + Button vocabulary** (P2 #4). Refactor
   `primaryButtonClass()` to apply state-layer overlay; introduce
   `secondaryButtonClass()`, `textButtonClass()`, `tonalButtonClass()`
   sharing the same overlay convention. Migrate top 20 call sites.
4. **Radix introduction — Toast** (P2 #8). Drop in
   `@radix-ui/react-toast`; rewrite
   [toast.tsx](../../apps/web/src/components/toast.tsx) keeping
   the `useToast()` API. Document the Radix convention in
   [AGENTS.md](../../AGENTS.md).
5. **Mobile-first nav** (P2 #11 BottomNav, P2 #10 FAB). The biggest
   mobile UX win. Drives a per-route decision on "what's the FAB
   for this page."
6. **Dialog + BottomSheet** (P2 #9, #14). Extend `FormModal`;
   optionally swap to `@radix-ui/react-dialog` under the hood.
7. **TextField primitive** (P2 #13). Migrate forms one surface at a
   time, starting with `/events/new` (already touched most often)
   and the auth pages (highest a11y leverage).
8. **DropdownMenu primitive** (P2 #12). Sweep `nav-dropdown.tsx`,
   `notification-bell.tsx`, `details`-based menus.
9. **Density + table polish** (P2 #15, P3 #18 if appetite).
10. **P3 cleanup** (#17–#22) opportunistically.

---

## Remediation log

### Bundle 129 — Tokens (2026-05-28)

**Files touched:**

- [scripts/gen-palette.ts](../../scripts/gen-palette.ts) (new) —
  one-shot M3 tonal-palette generator seeded from the brand colors.
  Run with `pnpm tsx scripts/gen-palette.ts` and paste the output into
  the color-roles block in `globals.css`. Uses
  `@material/material-color-utilities` (devDependency only, never
  ships).
- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) —
  added: 34 M3 color roles × 2 themes; state-layer alpha tokens; motion
  duration + easing scales; elevation 0–5 (theme-aware); type scale (15
  roles wired via `--text-<name>` so Tailwind 4 picks them up as
  `text-<name>` utilities with line-height + tracking); shape scale via
  `--radius-shape-<name>` (`rounded-shape-xs/-sm/-md/-lg/-xl/-full`);
  elevation utilities via `--shadow-elevation-<0–5>`; M3 color roles
  re-exposed as Tailwind utilities under the `md-` prefix
  (`bg-md-primary`, `text-md-on-surface`, `border-md-outline`, etc.);
  `pt-safe`/`pb-safe`/`pl-safe`/`pr-safe` `@utility` shorthands for
  `env(safe-area-inset-*)`; global `prefers-reduced-motion` reset that
  defangs all transitions + animations.
- [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx) —
  added `export const viewport: Viewport = { viewportFit: 'cover', … }`
  so the safe-area utilities resolve to non-zero on notched devices.
- Root `package.json` devDeps: `@material/material-color-utilities`,
  `tsx` (palette-script runner).

**Why this is "tokens shipped" not "finding closed":** the M3
**vocabulary** is now available app-wide, but no component call site has
been migrated to use it yet. Existing `bg-primary` / `text-fg` /
`bg-surface` utilities continue to read from the unchanged legacy
`--tw-color-*` block — pre-bundle and post-bundle screenshots are
identical. The migration half of each finding stays open and gets
drawn down by Bundles 2 onward of the recommended sequence.

**Verify:** `pnpm typecheck` 15/15 ✅ · `pnpm lint` warnings only (all
pre-existing) ✅ · `pnpm test` 179 domain + 50 web ✅ · `pnpm build` 8/8
(~67 s) ✅.
