# Material Design 3 alignment — 2026-05-28

> **Status update (2026-05-28, Bundle 135):** TextField primitive
> shipped — **P2 #13 primitive + reference call site shipped**
> (surface-by-surface form migration deferred). New
> [text-field.tsx](../../apps/web/src/components/text-field.tsx) is the
> M3 **outlined** TextField with all the slots the audit called for:
> top-aligned label, `supportingText` (helper or error — error
> overrides), `leadingIcon` / `trailingIcon` (inside the bordered
> chassis, padding auto-adjusts), `prefix` / `suffix` text adornments,
> and `multiline` flag for `<textarea>`. ARIA wiring is
> primitive-owned: composes the existing
> [field-error.tsx](../../apps/web/src/components/field-error.tsx)
> `errors` prop to paint `aria-invalid`, generates the
> supporting-text id and threads it through `aria-describedby`, and
> applies `role="alert"` only when an error is showing (helper copy
> stays unannounced). Focus state uses the Bundle 129
> `--md-primary` token via `focus-within:border-md-primary` +
> `focus-within:ring-md-primary`. Reference call site:
> [new-team-form.tsx](../../apps/web/src/app/teams/new/new-team-form.tsx)
> migrated its "Team name" input (the format `<select>` stays on the
> legacy chassis until a SelectField primitive lands). Existing
> `<input>` + `<FieldError>` call sites keep working untouched per
> the audit's surface-by-surface migration plan. Verify 15/15
> typecheck · lint 3 pre-existing warnings · 179+50 tests · 8/8
> build. See [Bundle 135 journal](../journal/2026-05-28-bundle-135.md).

> **Status update (2026-05-28, Bundle 134):** Dialog + BottomSheet
> shipped — **P2 #9 closed** and **P2 #14 closed**.
> [form-modal.tsx](../../apps/web/src/components/form-modal.tsx)
> migrated off the native `<dialog>` element onto
> `@radix-ui/react-dialog` while preserving the public API — the
> three existing call sites (host-ad-hoc-teams panel, no-bracket
> view, setup view) needed zero edits. The two `useEffect` bridges
> (one to `showModal()`, one for browser-initiated `close`) are
> gone; Radix gives us controlled `open` state for free, real
> backdrop-click + Escape on every browser, and `data-state`
> attributes the M3 motion tokens animate against. New M3
> affordances: optional **`icon` prop** (M3 dialog icon slot above
> the title), **`presentation` prop** — `'dialog'` (default,
> centered card), `'sheet'` (bottom sheet on every viewport), or
> `'auto'` (sheet below `sm`, dialog above) — sheet anchors to the
> bottom edge with a drag-handle nub and `pb-safe` for the iOS
> notch, and a new **`<ModalActions>`** export with named
> `destructive` / `dismissive` / `confirming` slots enforcing M3's
> action ordering. `<ModalFooter>` stays exported as the unstyled
> escape hatch already used by Bundle 128 call sites. Motion
> bridged via three new CSS classes in
> [globals.css](../../apps/web/src/app/globals.css)
> (`.md-dialog-overlay`, `.md-dialog-motion`, `.md-sheet-motion`)
> with five `@keyframes` consuming the Bundle 129 motion tokens
> (`--md-sys-motion-duration-medium2/short4` +
> `--md-sys-motion-easing-emphasized-{decelerate,accelerate}`).
> `RadixDialog.Close` carries `tap-target` + `state-layer` (Bundles
> 130/131). Verify 15/15 typecheck · lint 3 pre-existing warnings ·
> 179+50 tests · 8/8 build. See
> [Bundle 134 journal](../journal/2026-05-28-bundle-134.md).

> **Status update (2026-05-28, Bundle 133):** BottomNav + FAB primitive
> shipped — **P2 #11 closed**; **P2 #10 primitive + reference call site
> shipped** (multi-page rollout deferred). New
> [bottom-nav.tsx](../../apps/web/src/components/bottom-nav.tsx)
> server wrapper resolves viewer auth and renders
> [bottom-nav-bar.tsx](../../apps/web/src/components/bottom-nav-bar.tsx)
> — a `'use client'` `<nav>` fixed below `md` with 4 destinations
> (Events / Groups / Teams / Profile-or-Sign-in), `state-layer` +
> `tap-target` per item, `pb-safe` for the iOS notch, and an
> rAF-coalesced **hide-on-scroll** that flips a `data-hidden`
> attribute the M3 motion tokens animate against. Mounted in
> [layout.tsx](../../apps/web/src/app/layout.tsx) alongside a
> matching mobile-only spacer so the SiteFooter clears the bar.
> [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)
> trimmed to **secondary** destinations only (Host an event,
> Community feed, Players, Host tools, Pricing + team-invite badge
> when pending) per M3 spec. New
> [fab.tsx](../../apps/web/src/components/fab.tsx) M3 FAB primitive —
> 56 dp circle (`h-14 w-14 rounded-2xl`),
> `bg-md-primary-container` / `text-md-on-primary-container`,
> `shadow-elevation-3` → `hover:shadow-elevation-4`, compact +
> extended variants, stacked above BottomNav via `z-30` +
> `bottom-20` (clears `h-16` bar) collapsing to `md:bottom-6`
> where the bar hides. Reference call site:
> [events/page.tsx](../../apps/web/src/app/events/page.tsx) renders
> the FAB for signed-in viewers with `href="/events/new"` /
> `label="Host an event"`. Verify 15/15 typecheck · lint 3 pre-existing
> warnings · 179+50 tests · 8/8 build. See [Bundle 133 journal](../journal/2026-05-28-bundle-133.md).

> **Status update (2026-05-28, Bundle 132):** Radix Toast shipped —
> **P2 #8 closed**. [toast.tsx](../../apps/web/src/components/toast.tsx)
> rewritten on `@radix-ui/react-toast` while preserving the
> `useToast()` public API (zero call-site edits). Brings the toast
> system in line with M3 Snackbar: **single-visible queueing** (head
> renders, rest held in React state — assertable queue depth on the
> context for tests); **action slot** (`Toast.action = { label,
altText?, onClick }` wired through `<RadixToast.Action>` for
> recovery flows like "Couldn't save. **Retry**"); **M3 duration
> policy** via `defaultDurationMs` — 10 s for errors, 6 s when an
> action is present, 5 s otherwise (callers override via
> `durationMs`; `0` → persistent); **bottom-center on mobile /
> bottom-right on `≥ sm` with `pb-safe`**; **`type="foreground"` for
> errors/warnings → `aria-live='assertive'`, `"background"` for the
> rest → `polite`**. Motion uses one new `md-toast-motion` CSS
> class in [globals.css](../../apps/web/src/app/globals.css) (three
> `@keyframes` bound to Radix's `[data-state]` / `[data-swipe]`
> attributes) consuming the Bundle 129 motion tokens
> (`--md-sys-motion-duration-medium2/short3/short4` +
> `--md-sys-motion-easing-emphasized-{accelerate,decelerate}`) — no
> new animation dep. Per-variant focus rings + `tap-target`
> (Bundle 130) preserved on Close + Action buttons. Radix convention
> documented in [AGENTS.md](../../AGENTS.md#ui-primitives--radix-ui).
> Verify 15/15 typecheck · lint warnings only · 179+50 tests · 8/8
> build. See [Bundle 132 journal](../journal/2026-05-28-bundle-132.md).

> **Status update (2026-05-28, Bundle 131):** State layers + button
> vocabulary shipped — vocabulary half of P2 #4 closed. New
> `@utility state-layer` in [globals.css](../../apps/web/src/app/globals.css)
> paints the M3 `currentColor` overlay at the system state alphas
> (`--md-sys-state-{hover,focus,pressed}-opacity`) — one canonical
> recipe for hover/focus/pressed across every interactive surface.
> [primary-button.tsx](../../apps/web/src/components/primary-button.tsx)
> refactored: `primaryButtonClass` drops `hover:opacity-90` for
> `state-layer`, and three new variants — `tonalButtonClass`,
> `secondaryButtonClass` (outlined), `textButtonClass` — land alongside
> at the same call-site shape. Visual change on existing primary
> buttons: hover/focus now reads as a soft white overlay (M3-correct)
> instead of a global opacity dim — same brightness direction, cleaner
> at the edges. The **migration half** of P2 #4 (sweep ad-hoc
> `hover:bg-fg/5` on nav items, `<details>` triggers, list rows,
> etc.) stays open and is drawn down by the per-component bundles.
> Verify 15/15 typecheck · lint warnings only · 179+50 tests · 8/8
> build. See [Bundle 131 journal](../journal/2026-05-28-bundle-131.md).

> **Status update (2026-05-28, Bundle 130):** Touch-targets sweep
> shipped — P1 #3 closed. New `tap-target` Tailwind 4 `@utility`
> (`3rem × 3rem` min, flex-centered) defined in
> [globals.css](../../apps/web/src/app/globals.css) and applied to every
> icon-only `<button>` flagged by the audit: toast close,
> `FormModal` close, mobile-menu hamburger, notification bell,
> pagination prev/next, co-host remove, bracket seeding move-up/down,
> bracket board move-earlier/later, walk-in player remove. Visual change
> is intentionally minimal — only the **hit area** grows. Verify 15/15
> typecheck · lint warnings only · 179+50 tests · 8/8 build. See
> [Bundle 130 journal](../journal/2026-05-28-bundle-130.md).

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

### #3 Mobile touch targets — drift below 48 dp outside primary nav 🟢 Fixed (2026-05-28, Bundle 130)

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

### #4 No state-layer convention for hover/focus/pressed 🟡 Utility + button vocabulary shipped (2026-05-28, Bundle 131)

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

- **Where:** 🟢 Fixed (2026-05-28, Bundle 132)
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

### #9 Dialog primitive lacks M3 affordances 🟢 Fixed (2026-05-28, Bundle 134)

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

### #10 No FAB (Floating Action Button) on host-heavy pages 🟡 Primitive + reference call site shipped (2026-05-28, Bundle 133)

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

### #11 No bottom-navigation primitive — site uses desktop top nav on mobile 🟢 Fixed (2026-05-28, Bundle 133)

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

### #13 Text fields lack M3 structure (filled vs. outlined, supporting text, leading icon) 🟡 Primitive + reference call site shipped (2026-05-28, Bundle 135)

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

### #14 Bottom sheet primitive missing — modals on mobile are visually wrong 🟢 Fixed (2026-05-28, Bundle 134)

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

### Bundle 135 — TextField primitive (2026-05-28)

Lands the **P2 #13** primitive + reference call site
(surface-by-surface form migration deferred per the audit's plan).

**Files touched:**

- [apps/web/src/components/text-field.tsx](../../apps/web/src/components/text-field.tsx)
  — new M3 outlined TextField primitive. `forwardRef` so callers can
  drive focus / select / scroll-into-view. Props split via
  discriminated union on `multiline`: `false` (default) takes
  `InputHTMLAttributes<HTMLInputElement>`, `true` takes
  `TextareaHTMLAttributes<HTMLTextAreaElement>`. Outlined chassis
  paints `border-border-base` idle / `border-md-primary` focus /
  `border-red-600` error, with `focus-within:ring-2` so a child
  `<input>` / `<textarea>` focus brings the ring to the chassis (the
  ring isn't on the field itself — it's on the whole adornment row).
  Padding helper `inputPadding(hasLeading, hasTrailing)` strips the
  left or right `px-3` when an adornment is taking that side; the
  chassis owns the vertical padding so leading/trailing slots share
  the centerline.

  Slot semantics:
  - `leadingIcon` / `trailingIcon` — `text-fg/60`, `aria-hidden` is
    the caller's call (icons get aria-hidden by default in our
    inline SVG vocabulary).
  - `prefix` / `suffix` — `text-muted text-sm`, no padding adjustment
    on the input side (adornment text is part of the value-flow).
  - `supportingText` — single `<p>` under the chassis with stable id
    `${fieldId}-support`. When `errors[name]` is set the same
    element swaps to the error text + `text-red-600` +
    `role="alert"`. `aria-describedby` is wired in both states so
    screen readers always announce the most-recent helper / error
    copy.
  - Field `id` is auto-generated via `useId()` so labels are wired
    even when a form has duplicate `name` props across nested
    blocks. Caller can override with explicit `id` prop.

- [apps/web/src/app/teams/new/new-team-form.tsx](../../apps/web/src/app/teams/new/new-team-form.tsx)
  — reference call site. "Team name" input swapped from the
  hand-rolled `<input>` + `<FieldError>` pair to a single
  `<TextField name="name" label="Team name" errors={state.fieldErrors}
required maxLength={80} />`. The format `<select>` stays on the
  legacy chassis — SelectField is its own primitive and bundle.

**Decisions:**

- **Outlined only, top-aligned label.** Audit explicitly preferred
  outlined-no-floating over the "very Material" filled-with-floating
  default. Floating-label support is a CSS-only follow-up (M3
  outlined notches the border around the label) but adds ~30 lines
  of motion + sizing nuance — not worth bundling.
- **Single primitive for `input` + `textarea`.** They share 95% of
  the chassis; splitting them would force callers to remember which
  primitive to use for which control. `multiline?: boolean` flag
  with discriminated-union typing covers both without losing
  control-specific prop autocomplete.
- **`<SelectField>` deferred.** `<select>` has different focus-ring
  semantics (browser draws its own dropdown) and needs a separate
  decision on whether to wrap native `<select>` or migrate to a
  Radix Select primitive. Mixing it in here would either bloat the
  bundle or push half-baked styling.
- **Auto-`useId()` for field ids.** Forms in this codebase frequently
  have duplicate `name` slugs across nested sections (`location.city`
  in two different addresses); using `name` as the DOM id would
  silently break label/control association. `useId()` is the only
  collision-free option that works with SSR.
- **`role="alert"` only on error.** Helper copy doesn't need to
  preempt the screen reader; only the error message warrants the
  interruption. The `aria-describedby` link is always wired so the
  field's own focus announcement still reads helper / error copy.
- **Don't migrate every form in this bundle.** Audit's plan is
  surface-by-surface; one reference call site + the primitive is
  the right cut. Each form migration is a small reviewable diff.

**Follow-ups deferred** (tracked in [Bundle 135 journal](../journal/2026-05-28-bundle-135.md)):

- **SelectField primitive** — needs a separate bundle. Open
  question: wrap native `<select>` for accessibility + form-data
  compatibility, or adopt `@radix-ui/react-select` for full styling
  control (loses the native mobile picker UX).
- **Floating-label variant** of TextField if a future surface
  benefits (signup, settings). Mostly a CSS exercise once the
  primitive ships.
- **Migration backlog:** `new-event-form.tsx` (the largest form,
  many fields), `community-listing-edit-form.tsx`, `new-group-form.tsx`,
  remaining inputs in `new-team-form.tsx`. Each is a small PR.
- **`<NumberField>` / `<DateField>`** subclasses with built-in
  formatting + validation could compose on top of TextField. Wait
  for a concrete need before generalising.

**Verify:** typecheck 15/15 ✓ · lint 0 errors / 3 pre-existing
`set-state-in-effect` warnings ✓ · 179 domain + 50 web tests ✓ ·
8/8 build ✓.

### Bundle 134 — Dialog + BottomSheet on Radix (2026-05-28)

Closes **P2 #9** (Dialog primitive lacks M3 affordances) and **P2 #14**
(Bottom sheet primitive missing).

**Files touched:**

- [apps/web/package.json](../../apps/web/package.json) — added
  `@radix-ui/react-dialog` as a runtime dependency, following the
  documented `pnpm --filter @pickupvb/web add …` + `pnpm install`
  peer-dep reconciliation pattern.
- [apps/web/src/components/form-modal.tsx](../../apps/web/src/components/form-modal.tsx)
  — full rewrite on Radix primitives. **Public API preserved
  one-for-one** — same `<FormModal trigger title description size>`
  shape, same `children` node-or-render-prop, same `CloseOnSettled`
  - `ModalFooter` exports. Three call sites (`host-ad-hoc-teams-panel.tsx`,
    `no-bracket-view.tsx`, `setup-view.tsx`) needed no edits. Two
    legacy `useEffect` bridges gone: the one in
    [old form-modal.tsx#L72-L89] that drove `el.showModal()` from
    React state, and the one that listened for browser-initiated
    `'close'` events. Radix's controlled `open` + `onOpenChange`
    collapses both into a single `useState`. Backdrop click + Escape
    now work consistently on every browser (native `<dialog>`
    backdrop-click is still spotty on Safari).

  Additive M3 affordances:
  - `icon?: ReactNode` prop — M3 dialog icon slot, centered above
    the title in `text-md-primary`; title + description center when
    an icon is present per M3 spec.
  - `presentation?: 'dialog' | 'sheet' | 'auto'` prop — `'dialog'`
    (default) preserves the Bundle 128 centered card,
    `'sheet'` anchors a full-width bottom sheet with rounded top
    corners + drag-handle nub + `pb-safe`, `'auto'` composes
    `md-sheet-motion sm:md-dialog-motion` and the responsive layout
    flips so a single Radix `<Content>` covers both viewports.
  - `<ModalActions>` new export — named
    `destructive` / `dismissive` / `confirming` slots that handle
    M3's `[destructive]   …   [dismissive] [confirming]` ordering
    automatically; on `<sm` collapses to a `column-reverse` stack so
    the primary action stays nearest the thumb.
  - Close button keeps `tap-target` (Bundle 130) + adopts
    `state-layer` (Bundle 131) and `rounded-full` per M3 icon-button
    spec.

- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css)
  — new M3 dialog motion section after `.md-toast-motion`. Five
  `@keyframes` (`md-overlay-enter`, `md-overlay-exit`, `md-dialog-enter`,
  `md-dialog-exit`, `md-sheet-enter`, `md-sheet-exit`) and three
  classes (`.md-dialog-overlay`, `.md-dialog-motion`,
  `.md-sheet-motion`) bound to Radix's `[data-state='open'|'closed']`.
  Enter uses `emphasized-decelerate` at `medium2`, exit uses
  `emphasized-accelerate` at `short4` — same pair as toast so dialog
  - sheet + snackbar feel like one motion family. Centered dialog
    enters from a 4 px lift + 2% scale-up; sheet enters via
    `translateY(100%) → 0`. Reduced-motion global block already
    defangs both.

**Decisions:**

- **Preserve public API at all costs.** The Bundle 128 call sites
  were carefully written and tested; this bundle is a primitive
  swap, not a call-site migration. New affordances added strictly
  as **optional props** so the diff at every call site is zero.
- **`<ModalActions>` is additive, not a `ModalFooter` replacement.**
  Existing call sites use `ModalFooter` with custom button rows that
  already match M3 ordering by hand. Renaming/forcing migration
  would risk regressing the working layouts. New code is encouraged
  to use `<ModalActions>` for the slot enforcement.
- **Single `<Content>` for `presentation='auto'` instead of two
  conditional renders.** Composes `md-sheet-motion sm:md-dialog-motion`
  and switches positioning at `sm:` via Tailwind responsive prefixes.
  Keeps the focus trap + portal lifecycle stable across the
  breakpoint (no remount on rotation).
- **`<span style={{ display: 'contents' }}>` wraps the trigger
  render-prop output.** Radix's `Dialog.Trigger asChild` requires a
  single forwardRef child; legacy call sites pass arbitrary JSX
  (buttons, links, styled divs) into `(open) => …`. The contents
  wrapper keeps the wrapper out of the layout while giving Radix
  the single element it needs — the imperative `open()` callback
  the caller wires onto their element handles the actual trigger
  logic, so we don't need `Trigger asChild` semantics at all and
  instead just render the trigger output adjacent to `Portal`.
- **No `vaul` for swipe-to-dismiss yet.** Audit mentions `vaul` as
  an option; Radix Dialog alone covers the visual + a11y story.
  Touch-drag dismiss is a follow-up if real usage demands it.

**Follow-ups deferred** (tracked in [Bundle 134 journal](../journal/2026-05-28-bundle-134.md)):

- Migrate the two existing `ModalFooter` call sites to
  `<ModalActions>` once a real change touches those forms (cheap
  diff but no value in a churn-only PR).
- Pick a first `presentation='auto'` adoption site — likely the
  walk-in team form on `host-ad-hoc-teams-panel.tsx` (the largest
  modal, most-likely benefit from full-width on mobile).
- Add `vaul`-style swipe-down-to-dismiss on the sheet variant if
  user testing shows the close button is awkward on mobile.
- Audit other native `<dialog>` users
  ([report-bug-button.tsx], [confirm-submit-button.tsx]) for whether
  they should migrate onto Radix as well or stay native (smaller
  one-off use cases may not be worth the dep weight per call site).

**Verify:** typecheck 15/15 ✓ · lint 0 errors / 3 pre-existing
`set-state-in-effect` warnings ✓ · 179 domain + 50 web tests ✓ ·
8/8 build ✓.

### Bundle 133 — BottomNav + FAB primitive (2026-05-28)

Closes **P2 #11** (no bottom-navigation primitive) and lands the
**P2 #10** primitive + reference call site (multi-page rollout deferred).

**Files touched:**

- [apps/web/src/components/bottom-nav.tsx](../../apps/web/src/components/bottom-nav.tsx)
  — new thin server wrapper. Resolves the current user via
  `getCurrentUser()`, derives `isAuthenticated = Boolean(user) && !isAnon`
  (anon JWTs are treated as signed-out per AGENTS.md Supabase guidance),
  forwards to `<BottomNavBar isAuthenticated>`. The split exists so the
  client surface stays free of `cookies()` reads.
- [apps/web/src/components/bottom-nav-bar.tsx](../../apps/web/src/components/bottom-nav-bar.tsx)
  — new `'use client'` `<nav aria-label="Primary">` with 4 items
  (Events / Groups / Teams / Profile-or-Sign-in), inline 24×24 stroke
  icons (calendar / users / trophy / person / login arrow), active
  highlight via `pathname === match || pathname.startsWith(\`${match}/\`)`,
`aria-current="page"`on the active link,`state-layer`overlay on
hover/focus/press from Bundle 131. Hide-on-scroll lives in a small`useHideOnScroll()`hook — passive`scroll` listener, rAF coalescing,
jitter threshold (`Math.abs(delta) > 8`), only hides past 80 px of
scroll. setState fires inside the rAF callback (not the effect body)
so it stays clear of `react-hooks/set-state-in-effect`(AGENTS.md
Pattern 5). Toggles`data-hidden` which a sibling Tailwind variant
(`data-[hidden=true]:translate-y-full`) animates via
`transition-transform duration-200 ease-out`. Bar is `fixed inset-x-0
  bottom-0 z-40 h-16 pb-safe md:hidden`with`shadow-elevation-2`.
- [apps/web/src/components/fab.tsx](../../apps/web/src/components/fab.tsx)
  — new M3 FAB primitive. `Fab({ href, label, children, extended })` —
  `label` required (visible content is usually an icon), `extended`
  flips to the rectangular pill (`h-14 rounded-2xl px-4 gap-2`).
  Surface: `bg-md-primary-container text-md-on-primary-container
shadow-elevation-3 hover:shadow-elevation-4`. Positioned
  `fixed right-4 bottom-20 z-30 md:right-6 md:bottom-6` —
  `bottom-20` clears the BottomNav (h-16), `md:bottom-6` reclaims
  desktop where the bar hides. `z-30` < BottomNav `z-40` < Toast
  viewport `z-50` (intentional stacking — FAB never covers a toast).
  Caller owns viewer-state gating; primitive is a dumb link.
- [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx)
  — imports `BottomNav`; after `<SiteFooter />` renders a mobile-only
  `<div aria-hidden="true" className="pb-safe h-16 md:hidden" />`
  spacer (keeps footer content scrolling clear of the fixed bar) then
  `<BottomNav />` itself.
- [apps/web/src/components/mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)
  — removed the **Find events / Groups / Teams (top-line) / Profile**
  primary destinations now owned by BottomNav. The drawer carries
  **Host an event / Community feed / Players / Host tools / Pricing**
  plus a single **Team invites** row that surfaces only when
  `user && pendingTeamInvites > 0` (keeps the badge discoverable until
  the invite count gets promoted to a BottomNav badge — see follow-up).
  `pendingTeamInvites` prop signature kept unchanged so
  [site-header.tsx](../../apps/web/src/components/site-header.tsx)
  needs no edit; semantics narrowed to "pending count → badge".
- [apps/web/src/app/events/page.tsx](../../apps/web/src/app/events/page.tsx)
  — reference call site for `<Fab>`. Conditionally renders
  `<Fab href="/events/new" label="Host an event">` with an inline
  plus-icon for signed-in viewers (uses the existing `user` from
  `getCurrentUser()` on the page — no new fetch).

**Decisions:**

- **4 destinations, not 5.** Audit prescribes 3–5; chose 4 to keep
  per-tab tap target wide on small phones (390 px viewport → 97 px
  per tab in a 4-col grid) and to leave room for a future
  Notifications tab without churn.
- **`/events` is the only call site this bundle.** `/groups` reads via
  `createSupabaseAnonClient()` inside ISR (no `cookies()`) — adding a
  viewer-gated FAB would need a client wrapper. `/teams` already has
  a prominent `+ New team` CTA in its header card. Keeping the FAB
  surface area to one page lets it act as the canonical pattern for
  the deferred rollout.
- **Hide-on-scroll, not always-visible.** M3 standard pattern; also
  buys back the bottom 64 px when the user is actively scrolling a
  long feed.
- **`pendingTeamInvites` badge stays in the hamburger for now.**
  Surfacing it on the BottomNav Teams tab is the natural follow-up
  but needs a small client-state subscription so the count stays
  fresh without a reload — deferred to keep this bundle tight.

**Follow-ups deferred** (tracked in [Bundle 133 journal](../journal/2026-05-28-bundle-133.md)):

- Multi-page FAB rollout: `/events/[id]` host view, `/groups`,
  `/groups/[id]` admin view, `/teams`, `/teams/[slug]` captain view
  (each needs a per-page viewer-state gate and the right primary
  action label).
- Promote the pending-team-invites badge from the MobileMenu row
  onto the BottomNav Teams tab as a Material-style numeric badge.
- Consider an `<Fab variant="extended">` auto-collapse-on-scroll
  behaviour once we have a real page that benefits from it.

**Verify:** typecheck 15/15 ✓ · lint 0 errors / 3 pre-existing
`set-state-in-effect` warnings (scoreboard-view, remote-control,
unchanged from Bundle 132) ✓ · 179 domain + 50 web tests ✓ · 8/8
build ✓.

### Bundle 132 — Radix Toast (2026-05-28)

Closes **P2 #8** (Toast UX diverges from M3 Snackbar).

**Files touched:**

- [apps/web/package.json](../../apps/web/package.json) — added
  `@radix-ui/react-toast` as a runtime dependency (peer-dep
  reconciliation followed the documented `pnpm install` after
  `pnpm --filter @pickupvb/web add …` pattern).
- [apps/web/src/components/toast.tsx](../../apps/web/src/components/toast.tsx) —
  full rewrite on Radix primitives while preserving the
  `useToast()`, `Toast`, `ToastVariant`, `ToastProvider` exports
  one-for-one. New additive `ToastAction` interface
  (`{ label; altText?; onClick }`) hung off `Toast.action`. Queue
  semantics: provider holds `Toast[]` in React state, renders only
  `toasts[0]` inside `<RadixToast.Provider swipeDirection="right">`;
  `dismiss(id)` filters by id; second `show()` while one is visible
  appends. Duration: `defaultDurationMs(t)` returns 10 000 for
  errors, 6 000 when `action` is present, 5 000 otherwise; the
  prop-supplied `0` is mapped to `POSITIVE_INFINITY`. Variant →
  Radix `type` mapping: errors / warnings → `'foreground'`
  (assertive); the rest → `'background'` (polite). Viewport
  positioned `fixed inset-x-0 bottom-4 mx-auto … sm:right-6
sm:bottom-6 sm:left-auto sm:items-end` with `pb-safe`.
  Per-variant focus-ring classes (Bundle 44) preserved on both
  Close and Action; Close keeps `tap-target` (Bundle 130).
  `FlashReader` (URL `?rsvp=…` consumer) preserved unchanged inside
  the provider's `<Suspense>`.
- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) —
  added one new `.md-toast-motion` class block right after the
  `@utility state-layer` block: three `@keyframes`
  (`md-toast-enter` opacity + translateY, `md-toast-exit` fade,
  `md-toast-swipe-out` translateX-to-edge + fade) bound to Radix's
  `[data-state='open' | 'closed']` and `[data-swipe='move' |
'cancel' | 'end']` attribute selectors. Durations + easings pull
  from the Bundle 129 motion tokens — no new animation dep.

**Why this closes the finding cleanly:**

- The two existing `useToast()` call sites
  ([layout.tsx](../../apps/web/src/app/layout.tsx),
  [near-me-button.tsx](../../apps/web/src/app/events/near-me-button.tsx))
  required **zero edits** — the public surface is byte-compatible
  except for the new optional `action?` field.
- The exact M3 Snackbar contract is now in code: one visible at a
  time, action slot, foreground/background `aria-live` mapping,
  duration policy, mobile-bottom-center / desktop-bottom-right
  position with safe-area.
- The motion bridge (Radix attributes → CSS keyframes consuming M3
  motion tokens) is a pattern that will compose onto Bundle 6
  (Dialog) and Bundle 8 (DropdownMenu) — no incremental cost there.

**Deferred (intentional):**

- No call site uses `Toast.action` yet — wired and typed, ready
  for the first "couldn't save / retry" UX (likely lands with the
  next round of optimistic-UI work).
- Touch-device swipe-gesture polish (the keyframes are wired;
  desktop mouse-drag looks right; real-device QA pending).
- Layering `state-layer` (Bundle 131) onto the Close button —
  per-variant ring + tinted hover already reads coherently; pick
  this up in the state-layer call-site sweep.

**Documentation:**

- Added "UI primitives — Radix UI" section to
  [AGENTS.md](../../AGENTS.md) so future bundles (Dialog,
  DropdownMenu, Popover, Tooltip) reach for `@radix-ui/react-*`
  with the same convention (preserve our public API at the
  call-site layer; bridge Radix `data-*` attributes to M3 motion
  tokens via plain CSS keyframes; no `tailwindcss-animate`).

**Verify:** typecheck ✅ · lint warnings only (all pre-existing) ✅ ·
`pnpm test` 179 domain + 50 web ✅ · `pnpm build` 8/8 ✅.

### Bundle 131 — State layers + button vocabulary (2026-05-28)

Vocabulary half of **P2 #4** (state-layer convention) — call-site
migration of ad-hoc `hover:*` rules on nav items / list rows /
`<details>` triggers stays open.

**Files touched:**

- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) —
  added `@utility state-layer`. Body sets `position: relative` +
  `isolation: isolate` on the host and paints an `::after`
  pseudo-element at `inset: 0` with `background-color: currentColor`,
  `border-radius: inherit`, `pointer-events: none`, opacity 0 at rest.
  Hover (`:hover:not(:disabled)`), focus-visible, and active each pull
  their opacity from the matching `--md-sys-state-*-opacity` token
  (8% / 12% / 12%). Transition uses the `short2` duration + `standard`
  easing tokens shipped in Bundle 129. Disabled hosts intentionally
  skip the hover overlay so the disabled affordance reads cleanly.
- [apps/web/src/components/primary-button.tsx](../../apps/web/src/components/primary-button.tsx) —
  factored shared parts (`SIZING`, `BASE`) so each variant is a
  one-line composition. `primaryButtonClass` drops `hover:opacity-90`
  and gains `state-layer`. Three new variants:
  - `tonalButtonClass` — Filled tonal (medium emphasis,
    `bg-primary/10 text-primary`).
  - `secondaryButtonClass` — Outlined (medium emphasis,
    `border border-primary text-primary bg-transparent`).
  - `textButtonClass` — Text (low emphasis, `text-primary` only).
    All four share size/base/state-layer; differ only in fill/border.

**Why this is "vocabulary shipped" not "finding closed":** the
`state-layer` utility now exists app-wide and the canonical button
vocabulary uses it, but ad-hoc `hover:bg-fg/5` / `hover:text-primary`
rules still live on `MobileMenu` items, `NavDropdown` triggers,
`<details>` summaries, list rows, and the notification-bell row items.
Those sweeps happen as the per-component bundles land (Bundle 4 =
Radix Toast; Bundle 5 = BottomNav + FAB will replace `MobileMenu`
hovers; Bundle 8 = DropdownMenu primitive replaces `<details>`).

**Visual change:** the only existing surfaces that change are calls to
`primaryButtonClass`. Hover/focus now paints a faint white overlay
instead of a global `opacity: 0.9` dim — both go brighter, the new
version stays crisp at button edges (no fade on the shadow / border).
Pre/post screenshots match within ~1% diff.

**Verify:** typecheck ✅ · lint warnings only (all pre-existing) ✅ ·
`pnpm test` 179 domain + 50 web ✅ · `pnpm build` 8/8 ✅.

### Bundle 130 — Touch targets sweep (2026-05-28)

Closes **P1 #3** (mobile touch targets drift below 48 dp).

**Files touched:**

- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css) —
  added `@utility tap-target` (`display: inline-flex; align/justify
center; min-width: 3rem; min-height: 3rem`). 48 px = M3 minimum;
  matches WCAG 2.5.8 AA (24 px floor) with the design-system target.
  Composes additively — no per-component overrides needed.
- [apps/web/src/components/toast.tsx](../../apps/web/src/components/toast.tsx) —
  toast `×` close: dropped `-mt-1 -mr-1 px-1.5` for `tap-target`.
  Hit area went from ~24 × 28 px to 48 × 48 px.
- [apps/web/src/components/form-modal.tsx](../../apps/web/src/components/form-modal.tsx) —
  modal `×` close: dropped `p-1 -m-1`, added `tap-target -m-2` to
  preserve visual flush-corner placement.
- [apps/web/src/components/pagination.tsx](../../apps/web/src/components/pagination.tsx) —
  Prev/Next links: replaced `inline-flex items-center py-1.5` with
  `tap-target` (kept `px-3` for horizontal label padding).
- [apps/web/src/components/notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx) —
  bell trigger: replaced `h-11 w-11 flex items-center justify-center`
  with `tap-target` (44 → 48 px).
- [apps/web/src/components/mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx) —
  hamburger: same swap (44 → 48 px). The fixed-inset backdrop
  `<button>` is already viewport-sized; not touched.
- [apps/web/src/app/events/[id]/\_components/hosts-section.tsx](../../apps/web/src/app/events/[id]/_components/hosts-section.tsx) —
  both co-host remove `✕` buttons (group + user variants).
- [apps/web/src/app/events/[id]/bracket/\_components/seeding-list.tsx](../../apps/web/src/app/events/[id]/bracket/_components/seeding-list.tsx) —
  move-up / move-down `↑` `↓` arrows.
- [apps/web/src/app/events/[id]/bracket/\_components/board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx) —
  move-match earlier / later arrows.
- [apps/web/src/app/events/[id]/bracket/\_components/walk-in-team-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/walk-in-team-form.tsx) —
  remove-player `✕`.

**Deferred:** `NavDropdown` chevron trigger (text label dominates the
hit area, already meets 24 px), `<details>`-based share menu in
[share-link.tsx](../../apps/web/src/components/share-link.tsx) (label +
icon together exceed 48 px width), filter chips in
[active-filter-chips.tsx](../../apps/web/src/app/events/_components/active-filter-chips.tsx)
(M3 Chip spec targets 32 dp, not 48 — handled in the eventual P3 chip
primitive). Lint rule that warns on icon-only `<button>` without
`tap-target` deferred to a follow-up bundle once the call-site pattern
is fully consistent.

**Verify:** `pnpm typecheck` ✅ · `pnpm lint` warnings only (all
pre-existing) ✅ · `pnpm test` 179 + 50 ✅ · `pnpm build` 8/8 (~49 s) ✅.

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
