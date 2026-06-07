# Material Design 3 alignment — 2026-05-28

> **Re-audit (2026-06-07) — the bleed continued; the shipped vocabulary
> is going stale.** No fix bundle this round; static re-measure of
> `apps/web/src` against the 2026-05-30 baseline. Two M3-styling commits
> landed since (`324eb2d9 "m3 styles"`, `f3277588 "pure css animations"`)
> — they migrated the **events surface** (host panels, RSVP panels,
> event cards) onto button recipes + the shape scale, which is real
> progress. But the **un-ratcheted categories grew**, exactly as the
> 2026-05-30 "stop the bleed first" strategy warned, because the
> color/type ratchets were deferred and never landed:
>
> | Category                           | 2026-05-30 | 2026-06-07 |    Δ | ratchet? |
> | ---------------------------------- | ---------: | ---------: | ---: | -------- |
> | raw palette utils (`text-red-600`) |        401 |        555 | +154 | **none** |
> | `text-Nxl`                         |         77 |        120 |  +43 | **none** |
> | `text-lg/sm/xs/base`               |       1181 |       1423 | +242 | **none** |
> | raw `shadow-*`                     |         53 |         31 |  −22 | none     |
> | `rounded-md`                       |        405 |        298 | −107 | none     |
> | `rounded-shape-*` (adopted)        |        162 |        221 |  +59 | yes      |
> | ad-hoc hovers                      |        132 |        104 |  −28 | none     |
> | `shadow-elevation-*` (adopted)     |         12 |          6 |   −6 | —        |
> | `state-layer` (adopted)            |         12 |         11 |   −1 | —        |
> | `md-` color roles (adopted)        |         12 |         20 |   +8 | —        |
> | M3 type-role usages (adopted)      |         39 |      **0** |    — | none     |
>
> (Palette/type counts use a slightly broader regex than the 2026-05-30
> sweep, so treat the absolute palette numbers as ±, but the **direction
> is robust**: every un-ratcheted growth category climbed, every
> migrated/ratcheted category fell.) **Net: the events surface moved onto
> M3; color and type went backwards.** New stale-vocabulary findings
> **S1–S3** below; **#1 (color) and #2 (type) re-graded to P1-now** —
> deferral has become unbounded growth. See
> [Re-audit 2026-06-07](#re-audit-2026-06-07--the-bleed-continued--stale-token-inventory).
>
> **Shipped same day (2026-06-07): type-scale bundle — S1 closed, S0
> half-closed.** All 120 raw `text-Nxl` migrated to the M3 type scale
> (`text-2xl→headline-sm` exact zero-change; `xl→title-lg`,
> `3xl→headline-lg`, `4xl→display-sm`, …) and the family locked at `error`;
> type-role adoption 0 → 120, the dead type tokens are now live, mapping
> documented in [AGENTS.md pattern 16](../../AGENTS.md). The `text-{sm,lg,xs}`
> body scale + palette + `shadow-*` + `rounded-md` ratchets stay open
> (judgment migrations; palette/dark-mode is the next highest-value bundle).
> Verify 15/15 typecheck · lint 0 err / 3 pre-existing · 268 web tests · 8/8
> build · built-CSS confirms the utilities emit. See the
> [remediation log](#type-scale--text-nxl-migrated--ratcheted-2026-06-07).
>
> **Also shipped 2026-06-07: semantic color roles — S2 started.** Added
> custom `warning` (amber) + `success` (emerald) M3 roles
> ([gen-palette.ts](../../scripts/gen-palette.ts) + globals.css, light+dark,
> same tones as `error`) and migrated the two centralized status surfaces
> ([alert.tsx](../../apps/web/src/components/alert.tsx) +
> [toast.tsx](../../apps/web/src/components/toast.tsx)) off raw red/amber/emerald
> onto `bg-md-{error,warning,success}-container` — every `<Alert>`/`useToast`
> is now dark-mode-correct (hand-rolled `dark:` forks deleted). Then the four
> **destructive-confirmation panels** (cancel-event, delete-team, delete-group,
> account-delete) followed — account-delete being the first all-three-roles
> consumer outside Alert/Toast. Then the ~8 hand-rolled form **error/notice
> banners** were swapped for `<Alert variant>` (dedupe + delete their `dark:`
> forks). **Net: raw palette 555 → 395.** Finally, the **surface-container
> hierarchy** was unblocked: it sat at 0 usages because the generated surfaces
> were cool-cyan (off-brand) and the brand's warm-light/teal-dark scheme can't
> come from one M3 neutral seed — so the surface/outline family was
> **hand-authored** to match the brand (`surface-container` == brand card, exact
> zero-change) + a reference adoption landed. Then the **centralized semantic
> recipes** (`fieldErrorClass`/`FieldError`/`TextField` error, `StatusPill`, the
> 3 duplicated payment-status maps, rsvp-flash error, the inline Paid/Pending/
> Refunded labels) moved to role tokens — fixing dark-mode error text app-wide.
> Then every **destructive text-button + inline error** (`text-red-600`
> Withdraw/Leave/Remove + `role=alert` error `<p>`s, 29 sites) → `text-md-error`,
> and its symmetric counterpart — the **inline success/warning text**
> (`text-emerald-700` "saved" → `text-md-success`, `text-amber-700` labels →
> `text-md-warning`, 12 files) — completing the inline semantic-text migration.
> **Net: raw palette 555 → 277.** Then the hand-rolled **warning/success notice
> panels** (community claim/hidden, billing, edit-event locks, the Pro section,
> the tip-thanks flash) → container roles (`bg-md-warning-container` / `*/5`
> tints), **555 → 227.** Finally the bg-tinted **status badges** (payment/role/
> live-draft pills + status maps) → `bg-md-{role}/15 text-md-{role}` tints
> (preserving the pop-on-dark; exact-string subs so the scoreboard's solid-500
> CTA buttons stay untouched), **227 → 118.**
> **The semantic red/amber/green/emerald → role-token migration is effectively
> done (555 → 118, −79%)** — the remaining 118 is **decorative/non-semantic**
> (violet "added-by-host" tag, neutral/slate UI greys, orange/sky accents,
> scoreboard solid-500 tool CTAs, dev env-banner) and legitimately stays raw; no
> ratchet (the family can't reach zero while decorative uses remain). Pattern in
> [AGENTS.md #17](../../AGENTS.md). **Open — separate, visual-review:** the
> app-wide **surface migration** (`bg-surface`/`border-border-base`/`text-muted`
> → surface roles; tokens authored + ready). See the
> [remediation log](#semantic-color-roles--alert--toast-2026-06-07).

> **Status update (2026-05-30, Bundle 139):** Adoption reality-check +
> first value-preserving shape migration + a lock-eliminated shape
> ratchet. **The 10-bundle arc (129–138) shipped every primitive and
> token, but adoption stalled** — a re-audit of the call sites found the
> app still ~95% on legacy ad-hoc styling. Snapshot (`apps/web/src`,
> 2026-05-30): **401** raw palette utilities (`text-red-600`,
> `bg-amber-100`…) vs 12 `md-` role utilities (P1 #1); **77** `text-Nxl`
>
> - 1181 `text-lg/sm/xs` vs 39 type-role usages (P1 #2); **132** ad-hoc
>   `hover:bg-fg/N` / `hover:opacity-N` vs 12 `state-layer` (P2 #4); **53**
>   `shadow-sm/lg/xl` vs 12 elevation utilities (P2 #5); **567** raw
>   `rounded-*` vs 7 `rounded-shape-*` _before_ this bundle (P2 #7); **192**
>   bare `<input>` vs 3 `<TextField>` (P2 #13); FAB on 1 page (P2 #10). The
>   🟡 headers conflated "primitive shipped" with "adopted across app" — see
>   the new [Adoption status](#adoption-status-2026-05-30) section for the
>   corrected split and the go-forward strategy.
>
> **What shipped this bundle (P2 #7, value-preserving subset):** a
> codemod of the _exact-pixel_ raw shape classes to the M3 shape scale —
> `rounded-lg → rounded-shape-sm` (8 px), `rounded-xl → rounded-shape-md`
> (12 px), `rounded-2xl → rounded-shape-lg` (16 px), plus form-modal's
> directional `rounded-t-2xl → rounded-t-shape-lg` — **162 sites across
> 88 files, zero visual change** (Tailwind v4 defaults make each a 1:1
> pixel match). The dominant bucket `rounded-md` (405; Tailwind's 6 px
> has **no** M3 token — `shape-sm` is 8 px, `shape-xs` is 4 px) and all
> 53 `shadow-*` (M3 elevation is a deliberate two-layer key+ambient
> shadow, visually distinct from Tailwind's presets) are **not**
> value-preserving and were left for role-aware migration. New
> **lock-eliminated ratchet** in
> [eslint.config.mjs](../../apps/web/eslint.config.mjs):
> `no-restricted-syntax` errors on re-introduced raw `rounded-lg/xl/2xl`
> (matches className string literals + template elements as whole tokens;
> `rounded-shape-*` and directional forms are not false-positives) so the
> migration can't silently regress. The color / type / `rounded-md`
> ratchets are **deferred to land with their migration** — erroring now
> breaks the build, warning now floods lint with ~900 entries and buries
> the 3 real pre-existing warnings. Verify 15/15 typecheck · lint 3
> pre-existing warnings · 179+50 tests · 8/8 build. See
> [Bundle 139 journal](../journal/2026-05-digest.md#bundle-139).

> **Status update (2026-05-28, Bundle 138):** System theme mode shipped
> — **P3 #19 closed.** Three-way preference (`light | dark | system`)
> stored in the existing `pvb-theme` cookie; the DB profile column
> stays `light|dark` check-constrained (no migration risk for a P3
> nice-to-have). `'system'` is intentionally device-scoped only —
> matches the typical pattern where a user might want pinned dark on
> one device and system on another. New
> [theme.ts](../../apps/web/src/lib/theme.ts) splits `Theme` (resolved
> `data-theme` painted by CSS) from `ThemePreference` (user-facing
> choice including `'system'`) with matching guards. The root layout
> renders `<html data-theme={resolved} data-theme-mode={preference}>`
> and injects a tiny inline bootstrap `<script>` as the first child of
> `<body>` that — only when `data-theme-mode === 'system'` — reads
> `matchMedia('(prefers-color-scheme: dark)')`, paints `data-theme`,
> and attaches a `change` listener so the page tracks OS dark-mode
> flips live without a reload. `setTheme()` in
> [theme-actions.ts](../../apps/web/src/app/theme-actions.ts) always
> writes the cookie; the profile update only fires for explicit
> light/dark (the check-constraint forbids `'system'`).
> [theme-toggle.tsx](../../apps/web/src/components/theme-toggle.tsx)
> gains a third button (⌂ System) using the same `aria-pressed` group
> pattern. `SiteHeader` / `MobileMenu` widened their `theme` prop type
> from `Theme` to `ThemePreference` — no call-site renames needed.
> This is the final bundle in the audit's 10-bundle adoption arc; the
> remaining P3 items (#17 icon discipline, #20 tonal palette
> exploration, #21 Switch primitive, #22 Chip primitive, #18 data-table
> primitive) stay opportunistic per their original guidance. Verify
> 15/15 typecheck · lint 3 pre-existing warnings · 179+50 tests · 8/8
> build. See [Bundle 138 journal](../journal/2026-05-digest.md#bundle-138).

> **Status update (2026-05-28, Bundle 137):** Density scale shipped
> — **P2 #15 vocabulary + reference call sites shipped** (responsive
> density now applied to receipts + earnings tables; further
> dense-list rollouts are opportunistic). Three M3 density utilities
> (`md-density-comfortable` / `md-density-standard` /
> `md-density-compact`) land tokens on cascading custom properties
> (`--md-row-py`, `--md-row-px`) so a single density class on a
> parent reaches every consuming descendant. New `.md-table`
> consumer paints those tokens onto `th` / `td` cells via descendant
> selector — cells keep their other utility classes (`text-right`,
> `text-muted`, `whitespace-nowrap`, `hidden sm:table-cell`) and
> only the padding token moves. Receipts ([profile/receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx))
> and earnings ([profile/billing/earnings/page.tsx](../../apps/web/src/app/profile/billing/earnings/page.tsx),
> both event-rollup and monthly tables) now declare
> `md-table md-density-compact md:md-density-comfortable` once on
> the `<table>` and shed the per-cell `px-3 py-2` triplets —
> cramped-on-mobile sympton from the audit is gone, desktop gains
> the M3 56 dp row height. Group-member list + other dense lists
> are deferred (still uniform `px-3 py-2` — each is a small
> reviewable diff using the same primitives). M3 data-table
> primitive (P3 #18) explicitly deferred "until a third table
> appears," per the original audit guidance. Verify 15/15 typecheck
> · lint 3 pre-existing warnings · 179+50 tests · 8/8 build. See
> [Bundle 137 journal](../journal/2026-05-digest.md#bundle-137).

> **Status update (2026-05-28, Bundle 136):** Dropdown menu on Radix
> shipped — **P2 #12 closed** for `<NavDropdown>` (the one Menu-style
> popover in the header; `<details>` / panel patterns elsewhere are
> separate primitives). [nav-dropdown.tsx](../../apps/web/src/components/nav-dropdown.tsx)
> rewritten on `@radix-ui/react-dropdown-menu` while preserving the
> public API (`NavDropdown`, `NavDropdownItem`) one-for-one — the
> only consumer ([site-header.tsx](../../apps/web/src/components/site-header.tsx))
> needed zero edits. Radix now owns focus management, arrow-key
> navigation, typeahead, Escape-to-close (with focus return to the
> trigger), and click-outside dismissal; the only effect kept is a
> route-change close (rAF-deferred per AGENTS.md Pattern 5) because
> Radix doesn't auto-close on Next.js client-side nav (trigger stays
> mounted). Items now render through `RadixDropdownMenu.Item asChild`
> wrapping `<Link>` so the primitive's roving-tabindex composes with
> typed routes. Surface adopts M3 menu tokens: `shadow-elevation-2`
>
> - `rounded-md` + `bg-surface`, items pick up the Bundle 131
>   `state-layer` plus a `data-[highlighted]:bg-fg/5` keyboard-focus
>   highlight (Radix paints `data-highlighted` on the active item).
>   Motion bridged via one new `.md-menu-motion` class in
>   [globals.css](../../apps/web/src/app/globals.css) with two
>   `@keyframes` (`md-menu-enter`, `md-menu-exit`) anchored to the
>   Radix-computed `--radix-dropdown-menu-content-transform-origin` so
>   the scale-in originates from the trigger, not the menu's center.
>   Same `emphasized-decelerate` / `emphasized-accelerate` curve as the
>   Bundle 134 dialog family, but `short4` / `short3` durations —
>   anchored menus feel sluggish on dialog timing. Notification-bell
>   panel and remaining `<details>` disclosures are content panels
>   (richer than a menu), not Menu-pattern targets — deferred. Verify
>   15/15 typecheck · lint 3 pre-existing warnings · 179+50 tests ·
>   8/8 build. See [Bundle 136 journal](../journal/2026-05-digest.md#bundle-136).

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
> build. See [Bundle 135 journal](../journal/2026-05-digest.md#bundle-135).

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
> [Bundle 134 journal](../journal/2026-05-digest.md#bundle-134).

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
> warnings · 179+50 tests · 8/8 build. See [Bundle 133 journal](../journal/2026-05-digest.md#bundle-133).

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
> build. See [Bundle 132 journal](../journal/2026-05-digest.md#bundle-132).

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
> build. See [Bundle 131 journal](../journal/2026-05-digest.md#bundle-131).

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
> [Bundle 130 journal](../journal/2026-05-digest.md#bundle-130).

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
> See [Bundle 129 journal](../journal/2026-05-digest.md#bundle-129) and the
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

## Adoption status (2026-05-30)

The 10-bundle arc (129–138) is **complete as a primitive/token program**
and **~5% complete as an adoption program.** The per-finding 🟡 headers
mark "vocabulary shipped"; they do **not** mean the app consumes it. The
gap, measured in `apps/web/src` on 2026-05-30:

| Finding             | Legacy still in tree                 | M3 adopted                         | State                                 |
| ------------------- | ------------------------------------ | ---------------------------------- | ------------------------------------- |
| P1 #1 color roles   | 401 raw palette utils                | 12 `md-` roles                     | primitive only                        |
| P1 #2 type scale    | 77 `text-Nxl` + 1181 `text-lg/sm/xs` | 39 type-role usages                | primitive only                        |
| P1 #3 touch targets | —                                    | swept                              | **adopted**                           |
| P2 #4 state layer   | 132 ad-hoc hovers                    | 12 `state-layer`                   | primitive only                        |
| P2 #5 elevation     | 53 `shadow-*`                        | 12 `elevation-*`                   | primitive only                        |
| P2 #7 shape         | 405 `rounded-md` (lg/xl/2xl now 0)   | 162 `rounded-shape-*`              | **exact-match subset adopted (B139)** |
| P2 #8/#9/#11/#14    | —                                    | Toast / Dialog / BottomNav / Sheet | **adopted**                           |
| P2 #10 FAB          | host / group / team pages            | 1 page (`/events`)                 | primitive + 1 site                    |
| P2 #12 menu         | bell + host `<details>`              | NavDropdown                        | partial                               |
| P2 #13 TextField    | 192 bare `<input>`                   | 3 sites                            | primitive + 3 sites                   |
| P2 #15 density      | dense lists                          | 2 tables                           | primitive + 2 sites                   |

**Why opportunistic migration stalled** (a strategy bug, not a
discipline failure):

1. **The compatibility aliases removed the forcing function.** Bundle
   129 deliberately kept `--tw-color-*` pointing at the M3 roles so
   everything renders identically. Right call for a zero-risk rollout —
   but it means migrating a call site produces _zero visible change_, so
   it never out-prioritizes feature work. The safety mechanism is itself
   why adoption died.
2. **Open question #5 was never resolved.** No lint guard forbade new
   `text-Nxl` / raw palette colors / raw `rounded-*`, so the legacy
   counts _grow_ with every feature — a losing race, not a slow win.
   Bundle 139 starts closing this (shape ratchet).
3. **🟡 hid the gap.** "8 bundles closed findings" reads as ~80% done;
   it's ~80% of the _primitives_ and ~5% of the _adoption_.

**Go-forward strategy (supersedes "migrate opportunistically"):**

- **Stop the bleed first — ratchet behind migration.** Each finding
  gets a `no-restricted-syntax` rule the moment its legacy count hits
  zero (P2 #7's `rounded-lg/xl/2xl` rule landed in Bundle 139). A rule on
  a category still heavily legacy either breaks the build (`error`) or
  floods lint with ~900 warnings (`warn`) — so the ratchet _follows_ the
  migration, it does not precede it.
- **Value-preserving codemod for exact-pixel buckets.** Where a legacy
  class maps 1:1 onto an M3 token (shape lg/xl/2xl in Bundle 139), a
  scripted sweep is zero-visual-change and safe. Do it once per such
  bucket, then ratchet.
- **Defer the judgment-heavy migrations and be honest they're work.**
  `rounded-md` (no exact token), all `shadow-*` (an M3 restyle), the
  color roles (dark-mode correctness — the audit's _original_ motivation),
  and the type scale require per-component decisions — the same effort
  class as a feature. Prioritize them by _user-visible value_ (color →
  dark mode; TextField → top-traffic forms; FAB → mobile host UX), not by
  finding number, and treat `rounded-md` / elevation as opportunistic
  unless a visual-review bundle is explicitly scheduled.
- **The design-system goal is already banked.** Tokens + Toast / Dialog /
  BottomNav / FAB / TextField / BottomSheet / density exist for _new_
  work. Retrofitting 1,000+ legacy call sites is a separate, optional ROI
  question — not a prerequisite for the audit's purpose.

---

## Re-audit 2026-06-07 — the bleed continued + stale-token inventory

Static re-measure 8 days after the 2026-05-30 reality-check. The
headline isn't a new gap in the _system_ — it's that the system is now
**measurably regressing**, and a large slice of the shipped M3
vocabulary is **dead code that ships the implication of a design system
the call sites ignore**. Three new stale-vocabulary findings, plus a
re-grade of the root cause.

### S0 — Root cause re-grade: the missing ratchets turned "deferred" into "growing" 🟡 P1 (text-Nxl closed 2026-06-07; palette/shadow/rounded-md open)

> **Partially resolved 2026-06-07.** The `text-Nxl` family is migrated to
> type roles and locked at `error` (see S1). Implementation note: a `warn`
> ratchet (the original recommendation) turned out to be infeasible —
> ESLint flat config can't run one rule at two severities, and a second
> `no-restricted-syntax` object replaces rather than merges, so a `warn`
> rule would have downgraded the existing `error` locks. The repo's proven
> path (Bundle 139) — migrate-the-bucket-to-zero, then `error`-ratchet it —
> applied cleanly: 120 sites is bounded, so the whole family went to zero
> in one pass. **Still open:** raw palette (555), `shadow-*` (31),
> `rounded-md` (298) — those keep `error`-ratcheting-behind-migration as the
> plan; palette is the highest-value (dark mode, S2).

- **Where:** [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs#L50-L140)
  carries `no-restricted-syntax` ratchets for exactly three categories —
  raw `rounded-lg/xl/2xl` (Bundle 139), the hand-rolled primary-button
  recipe (CC-1/CC-6), and local field-class strings (CC-2). There is
  **no ratchet on raw palette colors, `text-Nxl`, `text-lg/sm/xs`, raw
  `shadow-*`, or `rounded-md`** — the five highest-volume legacy
  categories.
- **Evidence:** in 8 days raw palette utils grew **401 → 555** (+154),
  `text-Nxl` grew **77 → 120** (+43), `text-lg/sm/xs/base` grew **1181 →
  1423** (+242). These categories grow 1:1 with feature work because
  nothing stops a new `text-red-600` / `text-2xl` from landing. The
  2026-05-30 strategy named this exact failure mode ("the legacy counts
  _grow_ with every feature — a losing race, not a slow win") and the
  re-measure confirms it.
- **Why P1-now:** the original deferral rationale ("erroring breaks the
  build, warning floods lint with ~900 entries") is real, but the cost of
  _continuing_ to defer is now visible: the migration target moves away
  faster than any bundle closes it. The audit's own conclusion — "stop the
  bleed first" — was never executed for color/type.
- **Fix (cheapest first):**
  1. **Ratchet `text-Nxl` at `warn` today.** Only 120 sites (not 900) —
     the warning list is a usable backlog, not a flood, and it stops the
     +43/week growth immediately. Add to the existing
     `no-restricted-syntax` block: `Literal`/`TemplateElement` selector
     `(?:^|[\s:])text-(?:xl|[2-9]xl)(?![\w-])`.
  2. **Then** schedule the color migration as a real bundle (it's the
     dark-mode motivation, finding #1) and ratchet palette behind it.
  3. Leave `text-lg/sm/xs` and `rounded-md` un-ratcheted until their
     value-preserving codemod is scoped (1181 + 298 sites is a genuine
     flood; the type-scale mapping is judgment, not 1:1).

### S1 — The M3 type scale is dead code (0 of 15 roles adopted) 🟢 Resolved (2026-06-07)

> **Resolved 2026-06-07.** All 120 raw `text-Nxl` sites migrated to type
> roles and the family is ratcheted at `error`. Adoption 0 → 120, the dead
> tokens are now live, and the mapping is documented in
> [AGENTS.md pattern 16](../../AGENTS.md). The `text-{sm,lg,xs,base}`
> body-text scale stays deferred (S0 — judgment mapping, 1423 sites). See
> the [remediation-log entry](#type-scale--text-nxl-migrated--ratcheted-2026-06-07).

- **Where:** [globals.css#L285-L327](../../apps/web/src/app/globals.css#L285-L327)
  defines all 15 M3 type roles inside `@theme inline` —
  `--text-display-{lg,md,sm}`, `-headline-*`, `-title-*`, `-body-*`,
  `-label-*`, each with its M3 `--line-height` and `--letter-spacing`
  companion (~43 lines). **Zero call sites** use the generated
  `text-display-lg … text-label-sm` utilities — `rg` across all of
  `apps/web` returns 0 files. The 2026-05-30 audit recorded "39 type-role
  usages"; the re-measure finds **0** (the 39 was counting the token
  definitions, not adoption).
- **Why it's stale:** Tailwind v4 JIT means the unused utilities don't
  emit, so the byte cost is ~nil — but the **43 lines of token
  definitions imply a type system is in force.** A contributor opening
  `globals.css` reasonably assumes `text-title-lg` is the house style;
  every heading around them is a hand-tuned `text-2xl font-bold`. That
  false signal is the cost.
- **Fix (this is the single cheapest M3 win on the board):** the type
  scale carries **zero behavioral/dark-mode risk** — it's just font-size
  - line-height. Adopt it on the highest-traffic headings (events list
    hero, `/events/[id]` H1, group/team headers, marketing H1s) in one
    value-mapping bundle: `text-3xl font-bold → text-headline-lg`,
    `text-2xl → text-headline-sm`/`text-title-lg` (per role), pair with
    S0's `text-Nxl` ratchet so it can't regress. If the team decides the
    scale won't be adopted, **delete L285-L327** rather than leave it
    implying a system.

### S2 — Most M3 color roles are dead, incl. the surface-container hierarchy that motivated finding #1 🟡 P2 (semantic roles started 2026-06-07; surface-container hierarchy still 0)

> **Partially started 2026-06-07 — semantic surfaces (Alert + Toast).**
> Added two **custom semantic roles** — `warning` (amber) + `success`
> (emerald) — to [gen-palette.ts](../../scripts/gen-palette.ts) and
> [globals.css](../../apps/web/src/app/globals.css) (light + dark, same tones
> as `error`), then migrated the two centralized status surfaces
> ([alert.tsx](../../apps/web/src/components/alert.tsx),
> [toast.tsx](../../apps/web/src/components/toast.tsx)) off raw
> red/amber/emerald onto `bg-md-{error,warning,success}-container` +
> `text-md-on-*-container` — so **every `<Alert>` / `useToast` instance app-wide
> is now dark-mode-correct** and the hand-rolled `dark:` forks are gone. Pattern
> documented in [AGENTS.md #17](../../AGENTS.md). **Then (same day) the four
> destructive-confirmation panels** (cancel-event, delete-team, delete-group,
> account-delete) moved onto `md-error`/`md-warning`/`md-success` —
> account-delete is the first all-three-roles consumer outside Alert/Toast (see
> the [danger-panels entry](#danger-zone-panels--error--warning--success-roles-2026-06-07)).
> **Then the hand-rolled form error/notice banners** (forgot-password, both
> community forms, new-event-form, the two signup panels, community-notice,
> import-client) were swapped for `<Alert variant>` — dedupes ~8 copies, deletes
> their `dark:` forks (see the
> [error-banners entry](#errornotice-banners--alert-2026-06-07)). **Net: raw
> palette 555 → 395.** **Then the surface-container hierarchy was unblocked:**
> the finding wasn't neglect — the generated surface roles were cool-cyan
> (off-brand) and the brand's warm-light/teal-dark scheme can't come from one M3
> neutral seed, so the surface/outline family was **hand-authored** to match the
> brand (warm ramp light, teal ramp dark, `surface-container` == brand card) and
> a zero-change reference adoption landed (account card + dialog/menu). See the
> [surface entry](#surface-container-hierarchy--brand-matched-ramps-authored-2026-06-07).
> **Still open:** the app-wide surface migration (now unblocked — assign
> elevation levels per surface, a visual-review bundle); inline status pills
> (payment `· Paid`/`· Pending`/`· Refunded`) + destructive text-links
> (`text-red-600` Withdraw/Leave); and the genuinely decorative palette (the
> scoreboard's red/green _team_ colors) stays raw by design. See the
> [remediation log](#semantic-color-roles--alert--toast-2026-06-07).

- **Where:** [globals.css#L68-L213](../../apps/web/src/app/globals.css#L68-L213)
  hand-declares **102 `--md-sys-color-*` custom properties** across
  light/dark `:root` blocks. Adoption of the generated `md-` utilities,
  measured across `apps/web/src`:

  | Role family                                                  | usages |
  | ------------------------------------------------------------ | -----: |
  | `md-surface-container{,-low,-lowest,-high,-highest}` (5)     |  **0** |
  | `md-on-surface-variant`, `md-outline`, `md-outline-variant`  |  **0** |
  | `md-inverse-surface`, `md-inverse-on-surface`                |  **0** |
  | `md-secondary-container`, `md-tertiary-container`, `-error-` |  **0** |
  | `md-primary-container`, `md-on-primary-container`            |  1 + 1 |

  Only the two primary-container roles are used, and only by the FAB
  (`/events` — finding #10's single call site).

- **Why it's stale _and_ a gap:** unlike the type scale, these are raw
  `:root` declarations (not `@theme` utilities), so **all 102 ship to
  every visitor** regardless of use (a few KB; ~1 KB gzip). More
  important: **the surface-container hierarchy was the entire P1 #1
  motivation** — "there is no canonical 'what color should a warning
  surface be at tone 90 in dark mode'." That hierarchy now _exists_ and
  is used **nowhere**, while the dark-mode-fragile raw palette it was
  meant to replace grew to 555. The fix shipped; the disease was never
  treated.
- **Fix:** drive the color migration off the surfaces that already log
  dark-mode contrast bugs (cross-ref [accessibility.md](accessibility.md)
  / events-page-ux remediation): map `bg-{red,amber,emerald}-50` alert
  surfaces → `bg-md-error-container` / `-tertiary-container` /
  semantic success, `text-*-700/800` → the matching `-on-*-container`.
  This is judgment work (raw red ≠ exactly `md-error`), so scope it as a
  visual-review bundle, migrate per surface, then ratchet palette. Until
  then the 102 tokens are a maintenance liability with one consumer.

### S3 — Elevation scale never displaced raw shadows 🟢 P3

- **Where:** [globals.css#L188-L213](../../apps/web/src/app/globals.css#L188-L213)
  defines the M3 two-layer elevation scale (`--md-sys-elevation-0…5`,
  light + dark). `shadow-elevation-*` is used in **6 sites across 5
  files** — all of them the Radix primitives shipped in Bundles 132–136
  (toast, dialog, nav-dropdown, bottom-nav, FAB). Application surfaces
  (event cards, hero panels, host cards) still carry **31 raw
  `shadow-sm/md/lg/xl`**.
- **Why P3:** the elevation tokens are legitimately _consumed_ (by the
  primitives), so they aren't dead — but the scale never became the
  house shadow vocabulary, so raw `shadow-*` keeps getting chosen by feel
  (P2 #5's original complaint). Lower priority than color/type because
  the visual delta of a wrong shadow is smaller than a wrong dark-mode
  color or heading size.
- **Fix:** opportunistic only, per the 2026-05-30 strategy — M3's
  key+ambient two-layer shadow is a deliberate restyle, not a 1:1
  codemod. Fold the `shadow-*` → `shadow-elevation-*` mapping into the
  same visual-review bundle as the color migration (S2) so cards get
  their elevation and surface tone fixed in one reviewable pass.

### What's healthy (not every signal is bad)

- **Touch targets (#3), Radix primitives (#8/#9/#11/#12/#14), density
  (#15), safe-area (#16), motion tokens (#6)** remain adopted/consumed —
  the 53 `--md-sys-motion-*` tokens back the 4 primitive motion classes
  and are correctly used.
- **The events surface migrated this round** — `rounded-md` fell 405 →
  298 (−107), raw `shadow-*` 53 → 31, ad-hoc hovers 132 → 104, driven by
  the host-panel / RSVP-panel rewrites in `324eb2d9`. The pattern works
  when a bundle is actually scheduled; the gap is that color/type never
  got one.

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

### #7 No shape scale — every container picks its own `rounded-*` 🟡 Tokens shipped (Bundle 129); exact-match `rounded-{lg,xl,2xl}` migrated + ratcheted (Bundle 139); `rounded-md` / `shadow-*` deferred

- **Where:** `rounded-md` (`PrimaryButton`), `rounded-lg` (`FormModal`),
  `rounded-xl` (event cards on `/events`), `rounded-2xl` (hero panel),
  `rounded` and `rounded-full` scattered.
- **Fix:** M3 shape scale (`--md-sys-shape-corner-none/-xs/-sm/-md/-lg/-xl/-full`).
  Map: buttons → `sm` (8 dp), cards → `md` (12 dp), dialogs → `lg`
  (16 dp), bottom sheets → `xl-top` (28 dp top corners), avatars +
  chips → `full`. Document the mapping in
  [globals.css](../../apps/web/src/app/globals.css) so the next
  component author doesn't reinvent it.
- **Migration status (Bundle 139):** the **value-preserving** raw classes
  were codemodded to the M3 scale and are now ratcheted at `error` so
  they can't return — `rounded-lg → rounded-shape-sm` (8 px),
  `rounded-xl → rounded-shape-md` (12 px), `rounded-2xl → rounded-shape-lg`
  (16 px), plus `rounded-t-2xl → rounded-t-shape-lg`. **Not yet migrated
  (judgment, not a codemod):** `rounded-md` (405 sites; Tailwind's 6 px
  has no exact M3 token, and the right target is role-dependent —
  button → `sm`, card → `md`) and all 53 `shadow-*` (P2 #5; M3's
  two-layer key+ambient elevation is a deliberate restyle, so it needs a
  visual-review bundle, not a sed). `rounded-full` (68) stays as-is — it
  is `shape-full`. See [Adoption status](#adoption-status-2026-05-30) for
  the ratchet-behind-migration strategy.

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

### #12 `<details>` / popover patterns used where M3 prescribes Menu 🟡 NavDropdown migrated (2026-05-28, Bundle 136); content-panel disclosures (notification bell, host panels) deferred

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

### #15 No density / responsive density 🟡 Tokens + `md-table` consumer + receipts/earnings migrated (2026-05-28, Bundle 137); other dense lists deferred

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

### #19 Theme-mode follow-system signal not exposed 🟢 Fixed (2026-05-28, Bundle 138)

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

### Status badges → role tints (2026-06-07) — semantic color migration effectively complete

Ninth (final) S2 color step. Migrated the bg-tinted **status badges** —
payment/role/live-draft pills + status maps across ~16 files (event-card
free/paid/Fundraiser/spots, attendee-list/position-rsvp waitlist+paid,
event-meta, event-hero, media-card/page, profile-video-grid, the bracket/
schedule **live-draft** maps, billing subscription status, members/team-card
**owner** role, signup-section free, community-listing-card, team-league W).

**Mapping decision — `/15` tint, NOT container.** Small badge pills differ from
notice panels: the pale-pill-that-pops-on-dark is intentional, and a full
`*-container` would make the pill _recede_ on dark. So badges use
`bg-md-{role}/15 text-md-{role}` (+ `border-md-{role}/30`, `dark:` forks
dropped) — a theme-aware tint that preserves the pop in both modes and unifies
the app's previously-mixed `-100`-solid vs `/15`-tint badges onto one recipe.
green/emerald → success, amber → warning, red → error (incl. live=success /
draft=error, preserving the existing colour choice without redesigning it).

**Done via exact full-className subs, not a token codemod** — critical because
the scoreboard tool uses **solid `bg-emerald-500`/`bg-red-500`** for CTA buttons

- connection status (decorative, not badges); a blanket `bg-emerald-*` replace
  would have recoloured those. Verified the 5 scoreboard CTAs are untouched.

**Net: raw palette 227 → 118.** The remaining **118 is decorative / non-semantic
and legitimately stays raw**: the violet "added-by-host" tag (no M3 role maps to
violet), neutral/slate/gray UI greys, orange/sky/rose/cyan/fuchsia accents, the
scoreboard solid-500 tool CTAs, and the dev `env-banner` bar. **So the semantic
red/amber/green/emerald → role-token migration that drove S2 is effectively
done** (555 → 118, **−79%**, all remaining being non-semantic). **No palette
ratchet** — the family can't reach zero while decorative uses remain (as the
audit predicted). **Still open (separate, visual-review):** the app-wide
**surface migration** (`bg-surface`/`border-border-base`/`text-muted` → surface
roles; tokens authored + ready). Verify: 15/15 typecheck · lint 0 err / 3
pre-existing · 268 web tests · 8/8 build · built-CSS confirms the `/15`/`/10`
role-tint utilities emit via `color-mix`.

### Hand-rolled notice boxes → warning/success container roles (2026-06-07)

Eighth S2 step. Migrated the hand-rolled **warning / success notice panels**
(the larger info boxes the `<Alert>` banner sweep didn't cover) off raw
amber/emerald onto the container roles — consistent with the danger-panels
treatment, and notices _should_ tone with the theme:

- **amber warning panels** → `border-md-warning/30 bg-md-warning-container` +
  `text-md-on-warning-container` (drop `dark:` forks):
  [community-action-sections](../../apps/web/src/app/community/[slug]/_components/community-action-sections.tsx)
  (pending-claim), [community-viewer-chrome](../../apps/web/src/app/community/[slug]/_components/community-viewer-chrome.tsx)
  ×2 (claim-awaiting-review), [my-hidden-community-listings](../../apps/web/src/app/community/_components/my-hidden-community-listings.tsx),
  [edit-event-form](../../apps/web/src/app/events/[id]/edit/edit-event-form.tsx)
  ×2 (pricing/payment locked).
- **emerald success panels** → `bg-md-success-container` /
  `text-md-on-success-container`:
  [billing/pro](../../apps/web/src/app/profile/billing/pro/page.tsx) ×2
  (subscription-activating + the "Pro" section).
- **subtle tints kept as tints** (not container): the `bg-amber-500/{5,10}`
  boxes ([billing](../../apps/web/src/app/profile/billing/page.tsx) anon-payout,
  [profile-hub](../../apps/web/src/app/profile/_components/profile-hub-sections.tsx)
  team-invites, [setup-view](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx)
  seed-changes) → `bg-md-warning/{5,10}` + `text-md-warning`, preserving the
  understated look. (Rule: solid `-50` → container; `/5`–`/10` tint → role-at-alpha.)
- [event-flash-banners](../../apps/web/src/app/events/[id]/_components/event-flash-banners.tsx)
  tip-thanks box → `<Alert variant="success">` (the file already used `<Alert>`
  for its sibling flash).

**Net: raw palette 277 → 227.** Confirmed the new alpha utilities
(`bg-md-warning/5`, `bg-md-success-container/40`, …) emit via `color-mix`.
**Still open — these are the visual-review remainder:** bg-tinted **status
badges** (`bg-emerald-500/15`/`bg-amber-500/15`/`bg-red-500/10` paid/role/
live-draft pills + subscription status maps in billing, members-section,
signup-section, team-card, bracket/schedule, event-card waitlist/fundraiser) —
mixed semantics (owner/fundraiser/draft aren't error/warning/success) and a
dark-mode visual change (pale pills that pop on dark → theme-flipping
containers), so they want eyes on the app; the **app-wide surface migration**;
and decorative palette (scoreboard team red/green, violet "added-by-host" tag).
Verify: 15/15 typecheck · lint 0 err / 3 pre-existing · 268 web tests · 8/8 build.

### Inline success/warning text → `text-md-success` / `text-md-warning` (2026-06-07)

Seventh S2 step — the **symmetric counterpart** to the red destructive sweep,
completing the inline semantic-text migration (red + green + amber now all on
role tokens). Recolored the bare inline status text (no `bg-`) across 12 files:

- **green/emerald success** → `text-md-success`: "✓ Template saved"
  (templates-section), "Video added" (add-profile-video), the pricing ✓ note,
  setup-view's ✓ status, the scoreboard "Saved to match ✓" + serving labels
  (remote-control, scoreboard-view), and the seeding / team-randomizer success
  results.
- **amber warning** → `text-md-warning`: profile-hub "Team invites" heading +
  count, the mobile-menu invite count, community-article label, format-picker's
  `role=status` caution.
- **red failure siblings** in the seeding / randomizer result lists
  (`text-sm text-red-700` next to the green success) → `text-md-error`.

Unlike the red `text-red-600` sweep, the inline green/amber **shares shades
with bg-badges** (a `text-emerald-700` status badge vs inline success text), so
a blanket codemod was unsafe. Instead used **exact full-className**
replacements — each inline site's string differs from the badge variant (badges
carry `bg-…` + a different `dark:` shade), verified by the changed-file list
(only the 12 inline-text files; **zero** badge/status-map files touched). Dark
companions (`dark:text-emerald-400` etc.) dropped — the role flips per theme.
`text-md-success` 7→10, `text-md-warning` 7→8.

**Net: raw palette 305 → 277.** **Still open:** bg-tinted **status badges**
(`bg-emerald-500/15`/`bg-amber-500/15`/`bg-red-500/10` paid/role/live-draft
pills + status maps in billing, members-section, signup-section, team-card,
bracket/schedule pages — ~73 green + ~90 amber utils, the bulk of what's left);
hand-rolled **notice boxes** (billing/media/community-viewer-chrome/
event-flash-banners/edit-event-form) → `<Alert>` or container roles; and the
unblocked app-wide surface migration. Verify: 15/15 typecheck · lint 0 err / 3
pre-existing · 268 web tests · 8/8 build.

### Destructive text-buttons + inline error text → `text-md-error` (2026-06-07)

Sixth S2 step. Recolored every `text-red-600` (29 sites) → `text-md-error`
across ~18 files, plus dropped the now-orphaned `dark:text-red-400` companions
(7 sites) — the role token flips per theme, so the dark fork is redundant.
Two clean categories, one migration:

- **Destructive text-buttons / links** — `text-red-600 hover:underline`
  (Withdraw / Leave / Remove me from pool / delete-division / remove-member,
  in the signup panels, team-member-row, team-viewer-chrome, divisions-repeater,
  my-videos, profile) and `hover:text-red-600` icon actions (conversation-view
  delete-message, block-control, import-client, hosts-section).
- **Hand-rolled inline error text** — `text-red-600` on `<p role="alert">`
  (format-picker-form ×5, setup-view, scoreboard-view, push-test/-subscribe,
  conversation-view) — now consistent with `fieldErrorClass` from the prior
  bundle.

Done via a token-safe global codemod (`\btext-red-600\b` is **never** a
bg-badge — badges use `text-red-700`+`dark:text-red-300`, left untouched), plus
two per-site bordered destructive buttons recolored by hand:
[host-ad-hoc-teams-panel](../../apps/web/src/app/events/[id]/_components/host-ad-hoc-teams-panel.tsx)
remove (`border-red-300 … text-red-700 hover:bg-red-50` → `border-md-error/40 …
text-md-error hover:bg-md-error/10`) and
[board-view](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)
"Reset bracket" disclosure (`border-red-500/40 … bg-red-500/5` → `border-md-error/…
bg-md-error/5`). `text-md-error` adoption 6 → 42.

**Net: raw palette 350 → 305.** **Still open:** hand-rolled notice boxes
(billing/media/community-viewer-chrome/event-flash-banners/edit-event-form →
`<Alert>` or container roles), bg-tinted status badges (`bg-amber-100`/
`bg-red-500/15` fundraiser/waitlist/status pills), the green/amber inline
_success/warning_ text (the symmetric counterpart to this red sweep —
`text-emerald-700` "saved" etc.), and the unblocked app-wide surface migration.
Verify: 15/15 typecheck · lint 0 err / 3 pre-existing · 268 web tests · 8/8 build.

### Semantic recipes + payment-status pills → role tokens (2026-06-07)

Fifth S2 step. Migrated the **centralized** semantic recipes (highest leverage
— each fixes many downstream call sites at once, and notably fixes dark-mode
error text, which was dark-red-on-dark before):

- [field-styles.ts](../../apps/web/src/components/field-styles.ts)
  `fieldErrorClass`, [field-error.tsx](../../apps/web/src/components/field-error.tsx)
  default, and [text-field.tsx](../../apps/web/src/components/text-field.tsx)
  (error chassis + supporting text): `text-red-600` / `border-red-600` →
  `text-md-error` / `border-md-error`. These are THE form-error recipes —
  every field error across the app is now theme-aware.
- [status-pill.tsx](../../apps/web/src/components/status-pill.tsx) `success` /
  `pending` tones + the three duplicated payment-status maps
  ([teams-registered-section](../../apps/web/src/app/events/[id]/_components/teams-registered-section.tsx),
  [host-ad-hoc-teams-panel](../../apps/web/src/app/events/[id]/_components/host-ad-hoc-teams-panel.tsx),
  [ad-hoc-team-signup-panel](../../apps/web/src/app/events/[id]/_components/ad-hoc-team-signup-panel.tsx),
  `none/pending/paid` → amber/amber/emerald) → `bg-md-{warning,success}-container`
  - `text-md-on-*-container`. `primary`/`neutral`/`refunded` tones stay on brand
    tokens.
- [event-rsvp-flash.ts](../../apps/web/src/lib/event-rsvp-flash.ts) error banner
  → `bg-md-error-container` (success/info already on brand tokens).
- [tournament-signup-panel.tsx](../../apps/web/src/app/events/[id]/_components/tournament-signup-panel.tsx)
  inline `· Paid` / `· Payment pending` / `· Refunded` labels →
  `text-md-{success,warning,error}` (plain role colours for inline text on a
  surface — first consumers of `text-md-success`/`-warning`; confirmed emitting
  in the built CSS).

**Net: raw palette 395 → 350.** **Deferred (a clean next bundle):** the
**destructive text-buttons** — `text-red-600 hover:underline` (Withdraw / Leave
/ Remove, ~17 sites incl. the leftovers in the panels above) and the
`hover:text-red-600` icon actions → `text-md-error`; plus the hand-rolled
**notice boxes** not caught by the banner sweep (billing, media, community
viewer-chrome, event-flash-banners, edit-event-form) and the bg-tinted
**status badges** (`bg-amber-100` fundraiser/waitlist pills on event-card,
attendee-list, event-meta) — each a per-surface recolor to role tokens. The
bracket live/draft + scoreboard "saved" indicators are status-ish but
borderline decorative; leave for the visual-review pass. Verify: 15/15
typecheck · lint 0 err / 3 pre-existing · 268 web tests · 8/8 build.

### Surface-container hierarchy — brand-matched ramps authored (2026-06-07)

Fourth S2 step. Investigating why the surface-container hierarchy sat at **0
usages** surfaced a real blocker, not neglect:

- **The generated values were off-brand.** Seeded from `neutral: '#183334'`
  (deep teal), the M3 surface roles came out **cool cyan** (`surface` light =
  `228 254 255`), but the brand uses **warm** light surfaces (`#F9EBD9` /
  `#EBD6D7`). Adopting `bg-md-surface-container*` as-is would have recolored
  every card warm → cyan.
- **The brand's scheme isn't expressible as one M3 neutral palette.** The brand
  hue-**flips** between themes — warm sand in light, **teal** in dark
  (`#0E2A2C` / `#1B3F42`). A single neutral tonal palette is one hue, so it
  physically can't produce warm-light + teal-dark. The surface family therefore
  **cannot be generated** — it must be hand-authored.

**Fix — hand-authored brand-matched ramps** in
[globals.css](../../apps/web/src/app/globals.css) (replacing the cool-cyan
generated block in both `:root` themes), anchored so **`surface-container` ==
the brand card colour** (`#EBD6D7` light / `#1B3F42` dark) and the other steps
ramp lighter/darker around it:

| role                      | light (warm)              | dark (teal)               |
| ------------------------- | ------------------------- | ------------------------- |
| surface (page)            | 249 235 217               | 14 42 44                  |
| surface-container-lowest  | 255 250 244               | 9 30 32                   |
| surface-container-low     | 242 225 216               | 18 48 50                  |
| **surface-container**     | **235 214 215**           | **27 63 66**              |
| surface-container-high    | 228 205 206               | 33 71 74                  |
| surface-container-highest | 221 196 197               | 40 80 83                  |
| on-surface(-variant)      | 24 51 52 / 85 95 96       | 249 235 217 / 159 191 190 |
| outline / -variant        | 140 126 122 / 219 205 203 | 122 140 140 / 42 85 87    |

Because `surface-container` and the brand `--tw-color-surface` resolve to the
**identical RGB** (verified in the built CSS), and `on-surface-variant` ==
`--tw-color-muted` exactly, the reference swaps below are **zero visual
change**. [gen-palette.ts](../../scripts/gen-palette.ts) got a ⚠️ header: it
still emits cool-cyan neutral rows, but those must **not** be pasted over the
hand-authored block (only the chroma roles are regenerable).

**Reference adoption** (makes the dormant tokens live + demonstrates the ramp):

- [account/delete](../../apps/web/src/app/profile/account/delete/page.tsx) base
  card → `bg-md-surface-container` + `text-md-on-surface-variant` (both **exact
  zero-change**).
- [form-modal](../../apps/web/src/components/form-modal.tsx) (dialog) +
  [nav-dropdown](../../apps/web/src/components/nav-dropdown.tsx) (menu) — the
  canonical **elevated** surfaces → `bg-md-surface-container-high` (a few RGB
  units more elevated than the base card, the correct M3 direction; a small
  delta worth an eyeball in both themes).

**Recommended level map for the future app-wide adoption** (its own
visual-review bundle): page = `surface`; base card / panel = `surface-container`;
raised card / dialog / menu / popover = `surface-container-high`; nested
emphasis = `surface-container-highest`; `border-border-base` →
`border-md-outline-variant` (light gains a faint visible hairline — an
intentional change to verify); `text-muted` → `text-md-on-surface-variant`.

**Findings updated:** S2 → 🟡 (surface tokens now brand-correct + ready; the
app-wide surface migration remains, but is no longer blocked). Verify: 15/15
typecheck · lint 0 err / 3 pre-existing · 268 web tests · 8/8 build · built-CSS
confirms the warm/teal ramps ship and `surface-container` == brand surface.

### Error/notice banners → `<Alert>` (2026-06-07)

Third S2 step, same day. The hand-rolled form **error/notice banners** —
`<div role="alert" className="border-red-200 bg-red-50 … text-red-700">` and
its tone-mapped success/warning siblings — were duplicated across ~8 files and
each carried (or omitted) its own `dark:` fork. Replaced them with the
centralized `<Alert variant>` (already on role tokens from the first S2 step),
which dedupes the markup, deletes every `dark:` guess, and adds the icon +
auto-`role` (error/warning → `alert`, else `status`).

- **Simple submit-error banners → `<Alert variant="error">`**, wrapped in the
  existing `useAlertReveal` ref'd `<div … className="outline-none">` (Alert
  doesn't forward a ref — AGENTS.md pattern 15):
  [forgot-password](../../apps/web/src/app/forgot-password/page.tsx),
  [new-event-form](../../apps/web/src/app/events/new/new-event-form.tsx) (keeps
  its `<ErrorActionLink>` child),
  [community-listing-form](../../apps/web/src/app/community/new/community-listing-form.tsx),
  [community-listing-edit-form](../../apps/web/src/app/community/[slug]/edit/community-listing-edit-form.tsx),
  [import-client](../../apps/web/src/app/admin/community-import/import-client.tsx).
- **Tone-mapped notices → `<Alert variant>`:**
  [community-notice-banner](../../apps/web/src/app/community/[slug]/_components/community-notice-banner.tsx)
  (`ok/warn/err` → `success/warning/error`, role preserved) and the two signup
  result banners ([free-agent](../../apps/web/src/app/events/[id]/_components/free-agent-signup-panel.tsx),
  [tournament](../../apps/web/src/app/events/[id]/_components/tournament-signup-panel.tsx),
  `result.tone` → `success`/`error`).
- **import-client result rows** (a dense list with links + sub-notes, not a
  banner) were recolored in place instead of forced into per-row Alerts:
  `border-md-success/30 bg-md-success-container` / `…-error-…`, amber sub-notes
  → `text-md-warning`.

Net: raw palette utils **555 → 395** across the three S2 bundles; `<Alert>`
call sites ~35 → 51. **Out of scope (noted):** inline payment-status labels
(`· Paid`/`· Pending`/`· Refunded`) and destructive **text-link** actions
(`text-red-600 hover:underline` Withdraw/Leave) — those are status-pill /
`errorTextButtonClass` follow-ups, not banners. Verify: 15/15 typecheck (forced
web run, 0 cached) · lint 0 err / 3 pre-existing · 268 web tests · 8/8 build.

### Danger-zone panels → error / warning / success roles (2026-06-07)

Continuation of S2, the same day. With the role families wired (previous
entry), migrated the four **destructive-confirmation panels** off raw palette:

- [cancel-event-panel.tsx](../../apps/web/src/app/events/[id]/edit/cancel-event-panel.tsx),
  [delete-team-panel.tsx](../../apps/web/src/app/teams/[id]/_components/delete-team-panel.tsx),
  [delete-group-panel.tsx](../../apps/web/src/app/groups/[id]/edit/delete-group-panel.tsx)
  — panel chrome `border-red-200 bg-red-50 … dark:bg-red-950/30` →
  `border-md-error/30 bg-md-error-container`, heading/description →
  `text-md-on-error-container`, inline error → `text-md-error`, the "Keep …"
  dismiss → `errorTextButtonClass`, and (cancel-event) the trigger → the
  shared `errorOutlinedButtonClass` + the reason textarea → `fieldInputClass`
  / `fieldLabelClass`. The submit + (where present) trigger already used the
  error-button vocabulary; this closed the panel chrome around them.
- [account/delete/page.tsx](../../apps/web/src/app/profile/account/delete/page.tsx)
  — the showcase: its **"Deletion scheduled"** panel was amber → `md-warning`,
  its **"cancelled"** notice green → `md-success`, its confirm error
  `text-red-600` → `text-md-error`. First real-world consumer of all three new
  roles outside Alert/Toast — validates the warning/success containers in dark
  mode by construction.

Every hand-rolled `dark:` fork in these files is gone (the role tokens flip).
Scope deliberately stops at the four delete/cancel panels — the other
`border-red-200 bg-red-50` hits are form **error banners** (forgot-password,
community/new + edit, new-event-form, signup panels) that should adopt
`<Alert variant="error">` rather than role classes directly; that's a separate
follow-up. Verify: 15/15 typecheck · lint 0 err / 3 pre-existing · 268 web
tests · 8/8 build · built-CSS confirms `text-md-on-warning-container` (+ `/90`
alpha via `color-mix`) and the error/success utilities emit.

### Semantic color roles + Alert / Toast (2026-06-07)

First step on **S2**. M3 ships an `error` role (already used by the
`errorButtonClass` family) but **no `warning`/`success`** — and 93% of the
555 raw palette utils are the four semantic families: red 215 (error), amber
161 (warning), emerald 85 + green 54 (success). This bundle adds the missing
roles and migrates the two **centralized** status surfaces.

**Foundation:**

- [scripts/gen-palette.ts](../../scripts/gen-palette.ts) — added `warning`
  (amber `#D97706`) + `success` (emerald `#059669`) seeds and their
  role/on/container/on-container rows to `LIGHT_ROLES` + `DARK_ROLES` using the
  **same M3 tones as `error`** (40/100/90/10 light · 80/20/30/90 dark), so the
  new roles are contrast-safe by construction.
- [globals.css](../../apps/web/src/app/globals.css) — pasted the generated
  `--md-sys-color-{warning,success,…}` rows into both `:root` blocks (16 new
  vars) and registered the 8 `--color-md-{warning,success}*` utilities in
  `@theme inline`. Confirmed in the production build that the utilities emit —
  incl. alpha borders via `color-mix(in oklab, …)` with a solid fallback — and
  that each var carries both a light and a dark value.

**Migration (centralized surfaces — every consumer fixed at once):**

- [alert.tsx](../../apps/web/src/components/alert.tsx) +
  [toast.tsx](../../apps/web/src/components/toast.tsx) — `error`/`warning`/
  `success` variants (surface **and** the toast focus-ring map) swapped from
  `bg-red-50 … dark:bg-red-950/40` to `bg-md-{role}-container
text-md-on-{role}-container border-md-{role}/30`. The role tokens flip per
  theme, so the hand-rolled `dark:` variants are **deleted**, not translated.
  `info` left untouched — it was already on brand tokens (`primary/10`), not
  raw palette, and `md-primary` is a different teal tone than brand `primary`.

**Decisions:**

- **Custom `warning`/`success` roles over reusing `tertiary`.** Tertiary is
  the brand sand/gold; overloading it with "caution" semantics would muddy it,
  and there's no spare role for "success" at all. Full custom roles mirror
  `error` exactly and keep the semantic vocabulary legible.
- **Centralized surfaces only; no codemod, no ratchet.** Unlike the type
  scale, raw color is contextual — the scoreboard's red/green are _team_
  colors, a danger panel's red is destructive-action chrome, a form's
  `text-red-600` is an inline error. None map 1:1, so a blind sweep is unsafe
  and the family can't reach zero to ratchet. Migrating `<Alert>`/`useToast`
  (the two surfaces literally named "semantic notice") is the high-leverage,
  low-risk cut; per-surface danger panels / status pills / form-error text are
  deferred follow-ups that can now reach for the roles.

**Findings updated:** S2 → 🟡 (semantic roles started; surface-container
hierarchy + scattered palette still open).

**Verify:** 15/15 typecheck · lint 0 errors / 3 pre-existing
`set-state-in-effect` warnings · 268 web tests + domain/application suites ·
8/8 build · built-CSS confirms the new role utilities (container / on-container
/ alpha border / ring) emit with light+dark values.

### Type scale — text-Nxl migrated + ratcheted (2026-06-07)

Closes **S1** and the `text-Nxl` half of **S0** from the 2026-06-07 re-audit.
The M3 type scale shipped in Bundle 129 but sat at **0/15 roles adopted**
while raw `text-Nxl` grew 77 → 120 for lack of a guard. This bundle migrates
the whole `text-Nxl` family to type roles and locks it.

**Migration (120 sites → type roles):**

- `text-2xl → text-headline-sm` — **exact, zero visual change** (both
  24 px / 32 px, no tracking). 55 sites; codemodded (`\btext-2xl\b`,
  null-delimited `xargs` + `perl`), incl. the one `sm:text-2xl`. This is the
  spine — most of these were already section headers (h2/h3).
- `text-xl → text-title-lg` (20→22 px), `text-3xl → text-headline-lg`
  (30→32 px, the canonical page-title role — ~28 page `<h1>`s were a uniform
  `text-3xl font-bold`), `text-4xl → text-display-sm` (36 px, exact size),
  `text-5xl → text-display-md` (48→45), `text-6xl → text-display-lg` (60→57).
  Small intended size refinements (≤2–3 px); the home hero's responsive
  `text-4xl … md:text-5xl` became `text-display-sm … md:text-display-md`.
- Verified the utilities emit real CSS in the production build —
  `.text-headline-sm{font-size:1.5rem;line-height:var(--tw-leading,2rem)}` —
  so any heading carrying an explicit `leading-*` still overrides the role's
  line-height. (The type roles had never been used, so Tailwind had never had
  to emit them; this confirms the `@theme inline` block actually generates
  utilities, not just dead `:root` vars.)

**Ratchet:** added two `no-restricted-syntax` selectors (Literal +
TemplateElement) to [eslint.config.mjs](../../apps/web/eslint.config.mjs)
matching `text-(xl|[2-9]xl)` as a whole token after a start/space/colon
boundary — so `text-display-lg`, `text-headline-sm`, `text-title-lg` and the
un-ratcheted `text-{sm,lg,xs,base}` are not false-positives. Lock-eliminated
only (the family is at 0), `error` severity, same shape as Bundle 139's shape
lock. Convention documented in [AGENTS.md pattern 16](../../AGENTS.md).

**Deliberately not done:** the `text-{sm,lg,xs,base}` body-text scale (1423
sites — a genuine flood, and the role mapping is judgment not 1:1), and the
palette / `shadow-*` / `rounded-md` ratchets (S0, S2, S3 — still
ratchet-behind-migration; palette/dark-mode is the next highest-value bundle).

**Findings updated:** S1 → 🟢 Resolved; S0 → 🟡 (text-Nxl closed,
palette/shadow/rounded-md open).

**Verify:** 15/15 typecheck · lint 0 errors / 3 pre-existing
`set-state-in-effect` warnings · 268 web tests + domain/application suites ·
8/8 build. Built-CSS grep confirms the type-role utilities emit font-size +
line-height.

### Bundle 139 — Adoption reality-check + value-preserving shape migration (2026-05-30)

Re-audit of the call sites after the 129–138 arc. The arc shipped every
primitive and token; **adoption is ~5%.** Reframed the audit to separate
"primitive shipped" from "adopted across app" (new
[Adoption status](#adoption-status-2026-05-30) section + corrected 🟡
semantics), recorded the go-forward strategy (ratchet-behind-migration,
value-preserving codemod for exact-match buckets, defer judgment-heavy
color / type / `rounded-md` / elevation), and landed the first
value-preserving migration for **P2 #7**.

**Files touched:**

- **88 component/page files under
  [apps/web/src](../../apps/web/src)** — value-preserving shape codemod
  (null-delimited `xargs` + `perl -i`, whole-token word boundaries so
  responsive prefixes like `sm:rounded-2xl` and the new `rounded-shape-*`
  classes are handled / untouched correctly):
  `rounded-lg → rounded-shape-sm` (8 px ≡ 8 px),
  `rounded-xl → rounded-shape-md` (12 px ≡ 12 px),
  `rounded-2xl → rounded-shape-lg` (16 px ≡ 16 px). **162 sites, zero
  visual change.**
- [apps/web/src/components/form-modal.tsx](../../apps/web/src/components/form-modal.tsx)
  — directional `rounded-t-2xl → rounded-t-shape-lg` (16 px ≡ 16 px) for
  the bottom-sheet top corners (Tailwind v4 generates the per-side
  `rounded-t-shape-*` utilities from the `--radius-shape-*` theme keys).
- [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) — new
  `no-restricted-syntax` block (scoped `src/**/*.{ts,tsx}`) erroring on
  re-introduced raw `rounded-lg/xl/2xl` in className string literals and
  template-literal quasis. Whole-token regex
  (`(?:^|[\s:])rounded-(?:lg|xl|2xl)(?![\w-])`) so `rounded-shape-*` and
  directional forms are not false-positives. **Lock-eliminated only** —
  the migrated classes are at 0, so the rule is green now and fails the
  build the moment one returns.

**Deliberately _not_ done** (each is a judgment migration, not a sed —
flagged so the next agent doesn't blind-codemod them): `rounded-md` (405;
6 px → no exact M3 token, role-dependent target), all 53 `shadow-*`
(P2 #5; M3 two-layer elevation is a visual restyle), and the color (P1 #1)
/ type-scale (P1 #2) ratchets (would break the build at `error` or flood
lint with ~900 warnings at `warn` — they land _with_ their migration).

**Findings updated:**

- **P2 #7** → 🟡 exact-match subset migrated + ratcheted; `rounded-md` /
  `shadow-*` deferred.

**Verify:** 15/15 typecheck · lint 3 pre-existing warnings (the same
`set-state-in-effect` trio; the shape ratchet adds 0) · 179+50 tests ·
8/8 build.

### Bundle 138 — System theme mode (2026-05-28)

Lands **P3 #19** — the "follow system" third option for the theme
toggle — closing the last bundle in the M3 audit's 10-bundle
adoption sequence. Cookie-only design: no Supabase migration, no
production-deploy risk for a P3 cleanup. Profile column stays
`light|dark` check-constrained; `'system'` lives in the device
cookie alongside, matching the typical pattern (device-scoped
mode is rarely an account-level preference).

**Files touched:**

- [apps/web/src/lib/theme.ts](../../apps/web/src/lib/theme.ts) —
  full rewrite. Splits `Theme` (resolved `data-theme` value,
  light/dark) from `ThemePreference` (user-facing,
  light/dark/system). Adds `isThemePreference`,
  `resolveThemeForSSR`, `readThemePreferenceFromCookies`,
  `DEFAULT_PREFERENCE`. Existing `Theme`, `isTheme`,
  `DEFAULT_THEME`, `THEME_COOKIE` unchanged so the rest of the
  tree keeps compiling.
- [apps/web/src/app/theme-actions.ts](../../apps/web/src/app/theme-actions.ts)
  — `setTheme` parameter widened to `ThemePreference`. Always
  writes the cookie. Profile update fires only when preference is
  explicit light/dark (the DB check-constraint forbids `'system'`,
  and conceptually `'system'` is device-scoped anyway).
- [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx)
  — `resolveTheme()` now returns `ThemePreference`; computes
  `theme` for SSR via `resolveThemeForSSR` (`'system'` → SSR
  default, corrected on hydration). `<html>` carries both
  `data-theme={resolved}` and `data-theme-mode={preference}`.
  Tiny inline bootstrap `<script>` (THEME_BOOTSTRAP) is the first
  child of `<body>` — checks `data-theme-mode`, paints the OS
  resolved value when `'system'`, and attaches a `matchMedia`
  `change` listener so the page tracks system dark-mode flips
  live. `<SiteHeader theme={preference} />`.
- [apps/web/src/components/theme-toggle.tsx](../../apps/web/src/components/theme-toggle.tsx)
  — full rewrite. Accepts `current: ThemePreference`. Third
  button (⌂ System). Immediate DOM update writes
  `data-theme-mode` and resolves `data-theme` via `matchMedia` for
  `'system'`. Same `useTransition` flow into the server action.
- [apps/web/src/components/site-header.tsx](../../apps/web/src/components/site-header.tsx)
  · [apps/web/src/components/mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)
  — widened `theme` prop type from `Theme` to `ThemePreference`.
  No structural changes; forwards untouched.

**Findings flipped:**

- **P3 #19** → 🟢 Fixed.

**Closes the audit's 10-bundle adoption sequence.** Remaining P3
items stay opportunistic per their original guidance:

- **#17 Icon discipline** — touches many files; needs its own pass.
- **#18 Data-table primitive** — defer "until a third table appears"
  (audit's own guidance; receipts + earnings is still only two).
- **#20 Tonal palette / tertiary container exploration** — research
  task, not a code change.
- **#21 Switch primitive** — Radix-based, own bundle when a switch
  call site shows up.
- **#22 Chip primitive** — wait for call sites before standardizing.

**Verify:** 15/15 typecheck · lint 3 pre-existing warnings (all
unrelated `set-state-in-effect`) · 179+50 tests · 8/8 build.

### Bundle 137 — Density scale (2026-05-28)

Lands the **P2 #15** vocabulary + reference call sites — receipts
and earnings tables — closing the cram-on-mobile finding the audit
explicitly called out. Other dense lists (group-member list and
friends) are deferred as opportunistic follow-ups using the same
primitives.

**Files touched:**

- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css)
  — three `@utility` blocks for the M3 density scale plus a
  `.md-table` consumer. Tokens land on two CSS custom properties
  (`--md-row-py`, `--md-row-px`) so density is set once per surface
  and cascades through the DOM. `md-density-comfortable` (12 px /
  16 px), `md-density-standard` (8 px / 12 px, also the `.md-table`
  baseline), `md-density-compact` (6 px / 8 px) — matches the
  audit's prescription ("subtract 4 dp per step"). `.md-table > thead
  > tr > th, .md-table > tbody > tr > {th,td}, .md-table > tfoot >
  > tr > td`is the cell selector, so cells outside the standard
three-section structure (raw`<table><tr>` without a section
  > wrapper) won't get padding silently — that's by design, the
  > selector is the API contract.
- [apps/web/src/app/profile/receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx)
  — transactions table migrated. `<table>` now carries
  `md-table md-density-compact md:md-density-comfortable w-full text-sm`;
  every `<th>` / `<td>` lost its `px-3 py-2` triplet and kept its
  other utility classes verbatim.
- [apps/web/src/app/profile/billing/earnings/page.tsx](../../apps/web/src/app/profile/billing/earnings/page.tsx)
  — both tables (per-event rollup + monthly) migrated with the
  same `md-table md-density-compact md:md-density-comfortable`
  pattern.

**Decisions:**

- **Cascading CSS custom properties, not BEM-style modifier
  classes per cell.** Setting `--md-row-py` / `--md-row-px` on the
  `<table>` reaches every descendant cell via natural CSS variable
  inheritance — no `<td className="md-cell">` boilerplate at every
  cell. The trade-off is the `.md-table > section > tr > cell`
  selector chain (one declaration covers all four cell positions:
  `thead>th`, `tbody>th`, `tbody>td`, `tfoot>td`).
- **Three density steps named per M3.** `comfortable` /
  `standard` / `compact` are the exact M3 vocabulary; using the
  same names in our utility classes keeps the design-system
  discussion legible ("that's our compact density" → same thing in
  Figma + the M3 spec + our codebase).
- **Compact on mobile, comfortable on desktop — not the reverse
  default.** M3's default is comfortable for desktop surfaces; we
  follow that but ramp DOWN on small screens because the audit's
  evidence was "cram on mobile." The reverse (comfortable on
  mobile) would lose 5+ rows on the receipts table viewport.
- **`.md-table` is opt-in, not a global `<table>` selector.**
  There are tables in the codebase outside the receipts/earnings
  pages that already have bespoke padding (host panels, etc.).
  Hijacking every `<table>` would silently break them. Opt-in via
  the `.md-table` class is the safe migration boundary.
- **`.md-table` baseline density is `standard`** — if a caller
  forgets to specify a density utility, they get sensible 8 px / 12
  px padding rather than zero. The `md-density-*` utility class on
  the same element overrides via CSS variable specificity (later
  declaration wins in the cascade).
- **No per-cell density utilities this bundle.** The audit's
  evidence was tables; lists are different layout primitives
  (`<ul><li>`, `<div>` chains) where the M3 density mapping is less
  obvious. Wait for a concrete dense-list pain point before
  designing the list utility.

**Follow-ups deferred:**

- **Group-member list and other dense lists** — the audit's
  third bucket ("group member list is sparse on desktop"). Each is
  a small reviewable diff; the primitives are ready but each list
  is a layout decision. Open audit-side: do we want
  `md-density-*` to set list padding via a `.md-list` consumer
  parallel to `.md-table`, or per-item utility?
- **M3 data-table primitive (P3 #18)** — sort, selection,
  pagination embedded. Original audit guidance: "defer until a
  third table appears." Still two tables (receipts + earnings),
  so still deferred.
- **Mobile receipts/earnings horizontal scroll** — the earnings
  page wraps the `<table>` in `overflow-x-auto`; receipts does
  not. Both work at compact density on iPhone SE without
  scrolling, but it's worth a sanity scan on the smallest target.
- **`tap-target` interaction** — dense table rows shrink toward
  the Bundle 130 `tap-target` floor on `compact`. Currently no
  interactive cell in receipts/earnings is icon-only (the action
  is a text link), so no immediate collision. Worth re-checking if
  a future migration adds icon-only cell affordances.

**Verify:** typecheck 15/15 ✓ · lint 0 errors / 3 pre-existing
`set-state-in-effect` warnings ✓ · 179 domain + 50 web tests ✓ ·
8/8 build ✓.

### Bundle 136 — Dropdown menu on Radix (2026-05-28)

Migrates the Menu-pattern half of **P2 #12** — the desktop header's
`<NavDropdown>` — to `@radix-ui/react-dropdown-menu` while keeping
the call-site contract exactly as it was. Content-panel disclosures
(notification bell, host-panel `<details>`) are not menus and are
out of scope for this bundle.

**Files touched:**

- `apps/web/package.json` — `@radix-ui/react-dropdown-menu` added.
- [apps/web/src/components/nav-dropdown.tsx](../../apps/web/src/components/nav-dropdown.tsx)
  — full rewrite on Radix. Public exports unchanged (`NavDropdown`,
  `NavDropdownItem`). Two legacy `useEffect` bridges gone (Escape +
  click-outside) — Radix owns those. The only kept effect is a
  route-change close (rAF-deferred via `requestAnimationFrame` per
  AGENTS.md Pattern 5) because Radix doesn't unmount the trigger on
  Next.js client-side nav. Items wrap `<Link>` via `Item asChild`
  so the primitive's roving tabindex + typeahead compose with
  Next.js typed routes. Trigger chevron rotates via
  `data-[state=open]:rotate-180` instead of a React state read.
- [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css)
  — added one `.md-menu-motion` class + two `@keyframes`
  (`md-menu-enter`, `md-menu-exit`) after the Bundle 134
  bottom-sheet block. Sets `transform-origin: var(--radix-dropdown-menu-content-transform-origin)`
  so the scale-in originates from the trigger (Radix computes the
  origin from the popper's resolved `side` + `align`). Durations
  `short4` enter / `short3` exit — menus feel slow on the dialog
  family's `medium2` / `short4` pair.

**Decisions:**

- **Public API preserved.** `NavDropdown({ label, items, hasIndicator,
indicatorLabel })` + `NavDropdownItem { href, label, badge? }`
  unchanged. The only consumer ([site-header.tsx](../../apps/web/src/components/site-header.tsx))
  needed zero edits. Matches the Bundle 132 / 134 Radix convention
  documented in [AGENTS.md](../../AGENTS.md).
- **Controlled `open` state.** Radix's `Root` accepts uncontrolled
  open by default, but we need to force-close on route change
  because the trigger stays mounted across client-side navigation.
  Keeping `useState(open)` + `<Root open onOpenChange>` lets that
  effect run without fighting Radix's internal state.
- **rAF-deferred setState in the route-change effect.** AGENTS.md
  Pattern 5 forbids synchronous setState in an effect body; the
  Bundle 133 hide-on-scroll pattern uses the same
  `requestAnimationFrame` deferral. Linter is back to 3 pre-existing
  warnings.
- **`Item asChild` over Radix's default `<div>`.** Lets the link
  itself be the focusable element (better than nesting `<a>` inside
  Radix's `<div role="menuitem">` and managing focus by hand). Typed
  routes flow through because `<Link href>` is the actual child.
- **State layer + `data-highlighted` for the keyboard focus path.**
  Mouse hover lights up via Bundle 131 `state-layer`; keyboard
  arrow-key navigation lights up via `data-[highlighted]:bg-fg/5`
  (Radix paints `data-highlighted` on the currently-active item).
  Two paint paths because state-layer is a `currentColor` overlay
  bound to `:hover` — not the same trigger as Radix's keyboard
  highlight.
- **`md-menu-motion` keyframes are anchored, not centered.** Setting
  `transform-origin: var(--radix-dropdown-menu-content-transform-origin)`
  makes the scale-in feel attached to the trigger. Centered scale
  would have the menu "land" rather than "unfold," which is the M3
  Menu motion intent.
- **Notification-bell panel and `<details>` host panels stay.**
  They're content panels (multiple sections, scroll, link rows with
  rich layout) — not the single-column item list a Menu primitive
  models. Migrating them to `react-dropdown-menu` would lose layout
  flexibility. They'd be `react-popover` candidates if the audit
  ever calls for one, but that's a separate finding.

**Follow-ups deferred:**

- **Notification-bell panel** ([notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx))
  could move to `@radix-ui/react-popover` for the focus-trap + Escape
  - click-outside owner-swap. Not strictly a Menu so it stays out of
    P2 #12; would be its own audit item.
- **Host-panel `<details>`** disclosures — most are inline content,
  not floating popovers. The Bundle 128 modal conversion already
  picked the ones that were really dialogs. Remaining `<details>`
  are fine as-is.
- **Submenu / checkbox-item / radio-item** support — Radix has them,
  but no current call site needs them. Wait for a concrete need.

**Verify:** typecheck 15/15 ✓ · lint 0 errors / 3 pre-existing
`set-state-in-effect` warnings ✓ · 179 domain + 50 web tests ✓ ·
8/8 build ✓.

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

**Follow-ups deferred** (tracked in [Bundle 135 journal](../journal/2026-05-digest.md#bundle-135)):

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

**Follow-ups deferred** (tracked in [Bundle 134 journal](../journal/2026-05-digest.md#bundle-134)):

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

**Follow-ups deferred** (tracked in [Bundle 133 journal](../journal/2026-05-digest.md#bundle-133)):

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
