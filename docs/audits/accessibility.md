# Accessibility audit — 2026-05-17

> **Status update (2026-06-09, re-audit — legal/footer + post-monetization
> surface):** Light re-sweep the day after the 2026-06-08 monetization pass,
> covering the just-shipped legal/footer rework (privacy / terms / refunds, the
> `/legal/accessibility` statement, the consent banner, the footer) plus a
> fresh anti-pattern grep across `apps/web`. **The audit is in excellent shape**
> — every ratchet is holding (`text-destructive` → 0 real uses,
> `<th>`-without-`scope` → 0, weak `focus:ring-1` → 0, `focus:outline-none`
> without a `focus-visible` replacement → 0), the 2026-06-07 semantic-color
> migration is effectively complete (`text-red-600` → 0), the legal pages carry
> a clean h1→h2→h3 hierarchy with real list semantics, and the consent
> banner/footer are well-formed (labelled `role="region"`, `<h2>` footer
> columns, the accessibility statement linked). Only **2 minor new P3s
> (D1–D2)** surfaced — the scoreboard save-bar status isn't announced + uses raw
> palette, and the public-profile follow toggle skipped the `aria-pressed`
> convention. **No P1/P2 this pass.** The two carried-over backlog refactors
> (**C7** Radix-dialog migration, **C8** shared Combobox + end-to-end AT
> testing) stay open. Full write-up in
> **[2026-06-09 re-audit findings](#2026-06-09-re-audit--legal--post-monetization-surface)**.

> **Status update (2026-06-08, re-audit remediated):** All six re-audit findings
> are now **fixed and `pnpm typecheck && lint && test && build` green** (1108
> unit tests). **C1** — swapped the dead `text-destructive` token →
> `text-md-error` / `hover:text-md-error` in 9 sites, added `role="alert"` to the
> five upload / template error nodes, and **locked the dead token behind a new
> `*-destructive` `no-restricted-syntax` ratchet** so it can't re-enter (verified
> the rule fires). **C2** — 4 form-error nodes `text-red-500` → `text-md-error`
> (the always-dark `timer-view` expired-pulse is left raw on purpose — decorative
> colour on a theme-independent `bg-black` surface, per AGENTS.md §17's "not
> every red is semantic"). **C3** — the `focus:ring-1` regressions in `match-row`
>
> - `walk-in-team-form` (×3) → `focus-visible:ring-2`. **C4** — the 4 image
>   uploaders' `sr-only` file inputs get `tabIndex={-1}` + `aria-hidden` so AT only
>   sees the labelled trigger. **C5** — `sr-only "(opens in new tab)"` added to the
>   waiver / sponsor / community-article / social links. **C6** — `BlockControl`
>   gains `aria-pressed` + a ≥24px hit-area (the media chips already sit at the
>   24px floor, left as-is). **C7–C8 remain open** (the Radix-Dialog migration of
>   the scoreboard / notification-bell / share-link overlays, the shared Combobox
>   primitive, and end-to-end AT testing) — larger refactors tracked as backlog.
>   Per-finding ✅ marks below; [remediation-log](#remediation-log) row at the top.

> **Status update (2026-06-08, re-audit — monetization / chat / media / games
> surface):** A large slab of new UI has shipped since the 2026-06-03 close-out
> (passes + memberships, Club payouts & analytics, referrals, the waiver
> e-sign, sponsor slots, event media posts + voting, event/group chat rooms +
> DMs, the volley-pong / keepie-uppie games, conversion nudges). This pass
> static-reviews that surface against the same WCAG 2.1 AA / Section 508 bar and
> opens **2 P2 (C1–C2) + 4 P3 (C3–C6)** plus two stale-code / improvement items
> (C7–C8). **Headline (C1): `text-destructive` is an undefined token** — nine
> class usages emit no CSS, so several upload / template **error messages render
> with no error color at all** (and no `role="alert"`), and the "Remove"
> hover-red never fires. It's a pre-M3 leftover that typecheck / lint / build
> can't catch (an unknown Tailwind utility just no-ops). The `<th scope>` lint
> ratchet from the last pass is **holding** — zero bare `<th>` across the much
> larger table surface. Full write-up in
> **[2026-06-08 re-audit findings](#2026-06-08-re-audit--monetization--chat--media--games-surface)**.
> The 2026-06-03 backlog below remains resolved. (C1–C6 since fixed — see the
> remediated status block above; C7–C8 remain open.)

> **Status update (2026-06-03, re-audit remediated):** The entire 2026-06-02
> re-audit backlog is now closed — **all 5 P2 (A1–A5) and all 4 P3 (B1–B4)
> shipped**, `pnpm typecheck && lint && test && build` green. Highlights: the
> `scope="col"` regression is fixed **and** locked behind a new
> `no-restricted-syntax` lint ratchet so it can't recur; chat and live-score
> now announce over `aria-live`; the scoreboard overlays got an interim
> focus-trap/Escape/labelling pass (to be superseded by the Radix Dialog
> primitive, AGENTS.md "UI primitives — Radix UI"); and a `/legal/accessibility`
> statement now ships, linked from the footer. Per-finding ✅ marks and
> [remediation-log](#remediation-log) rows below. **Only the open questions
> remain** (Radix Dialog migration, shared Combobox primitive, end-to-end AT
> testing, full Stark/axe contrast sweep).

> **Status update (2026-06-02, re-audit — new-surface sweep):** The
> 2026-05-17 audit and its 2026-05-23 remediations (Bundles 41–50) closed
> every P1/P2/P3 finding, but a large slab of new UI has shipped since
> (chat / `ConversationView`, live match scoring + the scoreboard &
> standings tools, the bracket format picker, the auth sign-in/up tabs,
> the billing-analytics + about/numbers pages). This pass static-reviews
> that new surface against the same WCAG 2.1 AA bar and opens **5 P2 + 4
> P3**. Headline: **`scope="col"` regressed** — three new tables ship
> column headers with no `scope`, exactly the original P1 pattern, because
> nothing lints it. Full write-up in
> **[2026-06-02 re-audit findings](#2026-06-02-re-audit--new-surface-findings)**
> below; the 2026-05-17 findings above remain resolved.

> **Status (2026-05-17):** Quick-win bundle landed. P1 #1 (map aria-label + address fallback), #2 (notification popover Escape — already in place), #3 partial (mobile menu Escape + return-focus; full focus trap deferred), #4 (table `scope="col"`), and P2 #1 (tap targets), #5 (focus rings) are ✅. Rest open. See **Remediation log** and **Still open** below.

> **Status update (2026-05-22):** No new accessibility shipments or
> regressions this pass. Still-open list unchanged.

> **Status update (2026-05-23, Bundle 41):** FieldError sweep finished —
> the 4 remaining forms (`new-event-form`, `edit-event-form`,
> `community-listing-form`, `community-listing-edit-form`) now use the
> shared `FieldError` + `fieldA11y` from
> [field-error.tsx](../../apps/web/src/components/field-error.tsx). All 6
> known `useFormState` forms emit `aria-invalid` + `aria-describedby` on
> the inputs that have matching `<FieldError>`. P2 FieldError finding
> ✅. See [remediation log](#remediation-log) and the
> [Bundle 41 journal](../journal/2026-05-digest.md#bundle-41).

> **Status update (2026-05-23, Bundle 42):** Three small P2 a11y wins
> bundled together: (1) datetime picker now closes on Escape and returns
> focus to its trigger; (2) `confirm-submit-button`'s native `<dialog>`
> sets `aria-modal="true"`; (3) `OpenInNewTabButton` and the external
> `QuickShareButton` variant in `share-link.tsx` now append an
> `sr-only "(opens in new tab)"` cue, closing the remaining new-tab
> link affordance gap on billing/share surfaces. All three P2 entries
> ✅. See [remediation log](#remediation-log) and the
> [Bundle 42 journal](../journal/2026-05-digest.md#bundle-42).

> **Status update (2026-05-23, Bundle 43):** Both combobox-pattern P2s
> closed. `UserPicker` migrated to the full WAI-ARIA combobox shape
> (`role="combobox"`, `aria-expanded`, `aria-controls`,
> `aria-autocomplete="list"`, `aria-activedescendant`) with arrow-key
>
> - Enter + Escape navigation, an `aria-live="polite"` status region
>   for Searching… / No matches / count, and a click-outside ref
>   pattern replacing the fragile 120 ms blur timeout. `AddressAutocomplete`
>   already had most of the ARIA in place; added the missing
>   `aria-activedescendant` + an `aria-live` status region for parity.
>   Status messages now live outside the listbox so the listbox contains
>   only options. See [remediation log](#remediation-log) and the
>   [Bundle 43 journal](../journal/2026-05-digest.md#bundle-43).

> **Status update (2026-05-23, Bundle 50):** P3 cluster closed. Of the
> three findings, only one needed a code change: the
> `registrationClosesAt` `<label>` in
> [event-advanced-details-panel.tsx](../../apps/web/src/components/event-advanced-details-panel.tsx#L121)
> was missing `htmlFor`, so the only `DateTimePicker` callsite without a
> programmatic label is now wired. The other two findings were
> verified-stale: `AddressAutocomplete` already carries
> `aria-label="Search for an address or venue"` (added in Bundle 43), so
> placeholder-as-label no longer applies; `alert.tsx` has no close button
> at all (the cited h-4 w-4 SVG is the decorative variant icon, not a
> hit-target); and the `mobile-menu.tsx` trigger has been `h-11 w-11`
> (≥44×44 per WCAG 2.5.5) since Bundle 2. The heading sweep confirmed a
> clean structure across all pages: 74 `h1`, 153 `h2`, 12 `h3`, no
> `h4`-`h6`, no skips — the two `page.tsx` files without a local `h1`
> (`groups/[id]`, `events/[id]`) emit their `h1` from a co-located
> `_components/` child (`group-header.tsx`, `event-hero.tsx`). **Every
> finding in the accessibility audit — P1, P2, and P3 — is now resolved.**
> Only the open questions (combobox-primitive consolidation, end-to-end AT
> testing, accessibility-statement page, contrast token verification)
> remain. See [Bundle 50 journal](../journal/2026-05-digest.md#bundle-50).

> **Status update (2026-05-23, Bundle 44):** Last accessibility P2
> closed. Toast close button now uses a per-variant `focus-visible`
> ring (red-700 / emerald-700 / amber-800 / primary, each with a
> matching `ring-offset-<variant-bg>`) instead of the inherited
> `focus:ring-current`, which previously dropped below 3:1 contrast on
> info/warning surfaces. With this in, **every P1 and P2 in the
> accessibility audit is resolved** — only the P3 backlog and the
> open questions remain. See [remediation log](#remediation-log) and
> the [Bundle 44 journal](../journal/2026-05-digest.md#bundle-44).

## Scope

Static review (no screen reader, AT, or keyboard runtime testing) of the Next.js 16 app at `apps/web`. Covered semantic HTML, form labeling, ARIA usage, keyboard navigation, focus management, color contrast (Tailwind class inspection only), images, Leaflet map, landmarks, page titles, language, touch targets, reduced motion, dynamic content, tables, links, and dialog/modal patterns against WCAG 2.1 AA / Section 508. Skipped `copilot-skills`.

---

## P1 findings

### Leaflet map has no text alternative or accessible name ✅ (2026-05-17)

- **Where:** [apps/web/src/components/event-map.tsx](apps/web/src/components/event-map.tsx) (~L27–L40)
- **Issue:** `<MapContainer>` has no `aria-label`, and the page provides no list/text fallback of the event address. Leaflet maps are inaccessible without supplementary content; non-visual users cannot determine the event location at all.
- **WCAG:** 1.1.1 Non-text Content, 1.3.1 Info and Relationships
- **Fix:** Add `aria-label="Map showing event location"` (or similar with the venue name) to the container. Always render the textual address adjacent to the map.

### Notification popover does not close on Escape ✅ (already implemented)

- **Where:** [apps/web/src/components/notification-bell.tsx](apps/web/src/components/notification-bell.tsx) (~L149–L160)
- **Issue:** Custom `role="dialog"` div with no `onKeyDown` Escape handler. Keyboard-only users cannot dismiss it.
- **WCAG:** 2.1.1 Keyboard, 2.1.2 No Keyboard Trap
- **Fix:** Add `onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}` to the dialog container, or convert to native `<dialog>` (same pattern used by [confirm-submit-button.tsx](apps/web/src/components/confirm-submit-button.tsx)).

### Mobile menu drawer has no focus trap and no Escape close 🟡 Partial (2026-05-17)

- **Where:** [apps/web/src/components/mobile-menu.tsx](apps/web/src/components/mobile-menu.tsx) (~L43–L65)
- **Issue:** Fixed-position drawer overlay. Tab moves focus outside the drawer back to the underlying page; Escape does not close. Combined this is a 2.1.1 failure for primary navigation.
- **WCAG:** 2.1.1 Keyboard, 2.4.3 Focus Order
- **Fix:** Trap focus inside the drawer (first/last focusable refs that loop Tab/Shift+Tab), add `Escape` keydown to close, return focus to the trigger on close, and ensure the close button has explicit `type="button"`.

### Tables missing `scope` on header cells ✅ (2026-05-17)

- **Where:** [apps/web/src/app/profile/receipts/page.tsx](apps/web/src/app/profile/receipts/page.tsx) (~L177–L182); [apps/web/src/app/profile/billing/earnings/page.tsx](apps/web/src/app/profile/billing/earnings/page.tsx) (~L298–L305)
- **Issue:** Every `<th>` is missing `scope="col"`. Screen readers cannot reliably associate data cells with headers.
- **WCAG:** 1.3.1 Info and Relationships
- **Fix:** Add `scope="col"` to all column headers.

---

## P2 findings

### Touch targets below 44×44 px on primary navigation controls ✅ (2026-05-17)

- **Where:** [apps/web/src/components/mobile-menu.tsx](apps/web/src/components/mobile-menu.tsx) (~L43, `h-10 w-10` = 40 px); [apps/web/src/components/notification-bell.tsx](apps/web/src/components/notification-bell.tsx) (~L128, `h-9 w-9` = 36 px)
- **Issue:** Both fall short of the 44×44 target size recommendation. Although WCAG 2.5.5 is AAA, these are the _primary_ mobile nav controls — users with motor impairments and small touchscreens will struggle.
- **WCAG:** 2.5.5 Target Size (AAA, but high impact here)
- **Fix:** Bump to `h-11 w-11`, or add padding so the hit-area reaches 44 px while keeping the icon size unchanged.

### Address autocomplete combobox missing required ARIA

- **Where:** [apps/web/src/components/address-autocomplete.tsx](apps/web/src/components/address-autocomplete.tsx) (~L76–L100)
- **Issue:** Escape-to-close works, but the input lacks `aria-expanded`, `aria-controls`, and `role="combobox"`; the suggestions list lacks `role="listbox"` and `aria-live` for "Searching…" / "No matches" status. Screen reader users get no indication that a dropdown is open or that results have arrived.
- **WCAG:** 4.1.2 Name/Role/Value, 4.1.3 Status Messages
- **Fix:** Apply the WAI-ARIA combobox pattern: `role="combobox"`, `aria-expanded={open}`, `aria-controls="<list-id>"`, `aria-autocomplete="list"`; listbox container with `role="listbox" id="<list-id>"`; options with `role="option"`. Wrap result-count text in an `aria-live="polite"` region.

### User picker dropdown missing ARIA and uses fragile blur-timing

- **Where:** [apps/web/src/components/user-picker.tsx](apps/web/src/components/user-picker.tsx) (~L100–L190)
- **Issue:** Same combobox-pattern gaps as address autocomplete. Additionally relies on a 120 ms `setTimeout` after `onBlur` to close the dropdown — fragile, can swallow keyboard activation, and breaks for some AT.
- **WCAG:** 2.1.1, 4.1.2
- **Fix:** Same combobox pattern as above; replace blur-timing with `relatedTarget` containment check or a "click outside" ref pattern.

### Datetime picker missing `aria-expanded` and Escape handling

- **Where:** [apps/web/src/components/datetime-picker.tsx](apps/web/src/components/datetime-picker.tsx) (~L76–L130)
- **Issue:** Trigger button has `aria-haspopup="dialog"` but no `aria-expanded`. Picker dialog has no Escape close. Focus is not explicitly returned to the trigger after the "Done" button is clicked.
- **WCAG:** 2.1.1, 2.4.3, 4.1.2
- **Fix:** Add `aria-expanded={open}` to the trigger. Add `onKeyDown` Escape handler. Use a `useRef` on the trigger and call `.focus()` in the close handler.

### Form errors not programmatically associated with inputs

- **Where:** Form components such as [apps/web/src/app/events/new/new-event-form.tsx](apps/web/src/app/events/new/new-event-form.tsx) (~L128); pattern repeats across most forms using `<FieldError />`.
- **Issue:** Inline `<FieldError />` text renders below inputs but inputs have no `aria-describedby` pointing at the error message id, and `aria-invalid` is not set when the field has an error.
- **WCAG:** 1.3.1, 3.3.1 Error Identification
- **Fix:** Have `FieldError` accept/emit an `id` and set `aria-describedby` + `aria-invalid` on the matching input.

### `confirm-submit-button` native dialog missing `aria-modal`

- **Where:** [apps/web/src/components/confirm-submit-button.tsx](apps/web/src/components/confirm-submit-button.tsx) (~L80–L89)
- **Issue:** Uses native `<dialog>` (good — Escape works, focus trap is automatic) but is missing `aria-modal="true"`. Some screen readers still need it to announce modality.
- **WCAG:** 4.1.2
- **Fix:** Add `aria-modal="true"`.

### Focus-ring contrast may fall short on form inputs ✅ (2026-05-17)

- **Where:** [apps/web/src/app/events/new/new-event-form.tsx](apps/web/src/app/events/new/new-event-form.tsx) (~L26), [apps/web/src/app/claim/claim-form.tsx](apps/web/src/app/claim/claim-form.tsx) (~L10), [apps/web/src/components/user-picker.tsx](apps/web/src/components/user-picker.tsx) (~L136)
- **Issue:** `focus:outline-none focus:ring-1 focus:ring-primary` removes the browser outline and substitutes a 1 px primary-color ring. A 1 px ring rarely passes WCAG 2.4.11 (Focus Appearance) at typical primary/surface combinations and is hard to see when the input border is similar in color.
- **WCAG:** 2.4.7 Focus Visible, 2.4.11 Focus Appearance (AA in WCAG 2.2)
- **Fix:** Use `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary` (2 px + offset). Verify contrast vs both light and dark backgrounds; consider a dedicated `--ring` token that passes against every surface.

### Toast close button uses `outline-none focus:ring-current` — contrast varies by tone

- **Where:** [apps/web/src/components/toast.tsx](apps/web/src/components/toast.tsx) (~L155–L167)
- **Issue:** `focus:ring-current` inherits the toast's foreground color. On info/warn variants that combination may not contrast against the toast background.
- **WCAG:** 2.4.7
- **Fix:** Use a fixed high-contrast focus color (e.g. `focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-current`) or per-variant verified rings.

### "Arrow"-style link affordance is inconsistent with `aria-hidden` 🟡 Partial (2026-05-17)

- **Where:** [apps/web/src/components/share-link.tsx](apps/web/src/components/share-link.tsx) (~L72); [apps/web/src/components/mobile-menu.tsx](apps/web/src/components/mobile-menu.tsx) (~L151); [apps/web/src/app/profile/billing/page.tsx](apps/web/src/app/profile/billing/page.tsx) (~L115–L172)
- **Issue:** Visible `↗` / `→` are marked `aria-hidden`. That's fine for the arrow itself, but for links that open in a new tab (`↗`), sighted users get the affordance and AT users get nothing — there's no "(opens in new tab)" cue.
- **WCAG:** 2.4.4 Link Purpose, 3.2.2 On Input
- **Fix:** For new-tab links add an `sr-only` "(opens in new tab)" span alongside the visible arrow.

---

## P3 findings

### Placeholder-as-label in a few inputs

- **Where:** [apps/web/src/components/datetime-picker.tsx](apps/web/src/components/datetime-picker.tsx) (~L85), [apps/web/src/components/address-autocomplete.tsx](apps/web/src/components/address-autocomplete.tsx) (~L100)
- **Issue:** A handful of inputs lean on `placeholder` for context with no visible label.
- **WCAG:** 1.3.1, 3.3.2 Labels or Instructions
- **Fix:** Add a visible `<label>` (or `aria-label` if visually inappropriate). Don't rely on placeholder.

### Icon-only buttons sized `h-4 w-4` / `h-5 w-5`

- **Where:** [apps/web/src/components/alert.tsx](apps/web/src/components/alert.tsx) (~L66, `h-4 w-4` close icon); [apps/web/src/components/mobile-menu.tsx](apps/web/src/components/mobile-menu.tsx) (~L47–L52)
- **Issue:** Icons are 16–20 px. The hit-area may be larger via padding, but worth a verification pass.
- **WCAG:** 2.5.5
- **Fix:** Ensure each `<button>` wrapping these icons reaches 44×44 via padding, or bump the icon.

### Heading levels are mostly fine but worth a sweep

- **Where:** Various pages
- **Issue:** No obvious skips observed; flagging only as a routine recheck during template changes.
- **Fix:** None needed now.

---

## Verified good

- `<html lang="en">` set in root layout ([apps/web/src/app/layout.tsx](apps/web/src/app/layout.tsx) ~L119).
- Skip-to-content link present (`sr-only focus:not-sr-only`, targets `#main`) ([apps/web/src/app/layout.tsx](apps/web/src/app/layout.tsx) ~L129–L131).
- Landmark structure: `<main id="main">`, `<nav>`, `<footer>` correctly placed.
- Toast system uses `aria-live="assertive"` for errors/warnings and `polite` for info, with `aria-atomic="false"` ([apps/web/src/components/toast.tsx](apps/web/src/components/toast.tsx) ~L127–L144).
- Page titles unique per route via `metadata` + `%s · PickupVB` template.
- Theme toggle uses `aria-pressed` and `role="group" aria-label="Theme"` ([apps/web/src/components/theme-toggle.tsx](apps/web/src/components/theme-toggle.tsx)).
- Native `<dialog>` (`.showModal()` / `.close()`) used for the destructive-confirmation pattern.
- Most form inputs have associated `<label htmlFor>`.
- Decorative SVG icons marked `aria-hidden="true"`; icon-only buttons generally carry `aria-label`.
- Buttons set explicit `type` (mostly), avoiding accidental form submits.

---

## Quick-win bundle

1. **Add `scope="col"`** to every `<th>` in receipts and earnings tables (~5 min).
2. **Escape-to-close on notification popover + mobile menu** (~30 min) — also add focus trap + return-focus on the mobile menu.
3. **Bump mobile menu / notification bell to `h-11 w-11`** (~5 min).
4. **Address + textual fallback for the Leaflet map** (~30 min) — `aria-label` plus a visible address block.
5. **Standardize focus styles** — replace `focus:outline-none focus:ring-1 focus:ring-primary` with `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary` everywhere (~1 hr sweep).

---

## Open questions

- Should the address autocomplete and user picker share a single accessible `Combobox` primitive rather than each implementing the pattern? Would eliminate the duplicated ARIA + close-behavior bugs in one shot.
- Has anyone tested the keyboard / screen-reader flow end-to-end (VoiceOver on iOS Safari, NVDA on Firefox/Chrome) for the RSVP and Pro-checkout flows? Static review can't verify announcement quality.
- Is there an accessibility-statement page (often required for 508 / public-accommodation compliance)? None found.
- Color tokens — do `text-muted-foreground` on `bg-background` and `text-primary` on `bg-surface` pass 4.5:1 in both light and dark themes? Worth a Stark / axe-DevTools verification.

---

## 2026-06-02 re-audit — new-surface findings

Static review (Tailwind-class + JSX inspection; no AT/keyboard runtime
testing) of the UI shipped **after** the 2026-05-23 close-out: chat
(`ConversationView`), live match scoring + the `/tools/scoreboard` and
`/tools/standings` tools, the bracket format picker, the auth sign-in/up
tabs, and the new `billing/analytics` + `about/numbers` data tables. Same
WCAG 2.1 AA / Section 508 bar. Grading per the
[audits rubric](README.md) (P1 ship-blocking, P2 next-sprint, P3
nice-to-have).

### P2 findings

#### A1. `scope="col"` regressed on three new tables (repeat of the original P1) ✅ (2026-06-03)

- **Where:**
  [apps/web/src/app/tools/standings/\_components/standings-board.tsx#L99-L108](../../apps/web/src/app/tools/standings/_components/standings-board.tsx#L99-L108)
  (7 column `<th>`, 0 `scope`);
  [apps/web/src/app/profile/billing/analytics/page.tsx#L235-L274](../../apps/web/src/app/profile/billing/analytics/page.tsx#L235-L274)
  (two tables, 8 column `<th>`, 0 `scope`);
  [apps/web/src/app/about/numbers/page.tsx#L160-L165](../../apps/web/src/app/about/numbers/page.tsx#L160-L165)
  (4 column `<th>`, 0 `scope`).
- **Issue:** Every `<th>` in these `<thead>` rows is missing `scope="col"`.
  Screen readers cannot reliably associate data cells with their headers —
  the exact pattern the 2026-05-17 P1 fixed in receipts/earnings/pricing.
  It reappeared because the fix was per-table and **nothing lints it**, so
  each new table re-introduces the gap.
- **WCAG:** 1.3.1 Info and Relationships
- **Fix:** Add `scope="col"` to each column header. The empty action-column
  `<th aria-label="Remove" />` in `standings-board.tsx#L108` needs no scope
  (it labels a control column, not a data column) — leave it. **Then close
  the loop:** add a `no-restricted-syntax` ESLint rule (or a tiny custom
  rule) flagging a `<th>` inside `<thead>` without a `scope` attribute, same
  ratchet-behind-fix strategy used for the CTA/field vocabularies
  (AGENTS.md §11) and the M3 shape lock — otherwise table #N+1 regresses
  again.

#### A2. Auth sign-in / sign-up segmented toggle exposes no selected state ✅ (2026-06-03)

- **Where:**
  [apps/web/src/app/login/\_components/auth-mode-tabs.tsx#L16-L37](../../apps/web/src/app/login/_components/auth-mode-tabs.tsx#L16-L37)
- **Issue:** The two `<button>`s switch between the sign-in and sign-up
  forms, but the active mode is conveyed **only** by `bg-primary` styling.
  No `aria-pressed`, no `role="tab"`/`aria-selected` — a screen-reader user
  cannot tell which mode is selected, and the buttons announce identically.
  This is the entry control to the whole auth flow.
- **WCAG:** 4.1.2 Name, Role, Value
- **Fix:** Minimal — make them toggle buttons: add
  `aria-pressed={!signUp}` / `aria-pressed={signUp}` to the two buttons.
  (A fuller `role="tablist"` + `role="tab"` + `aria-selected` +
  `aria-controls` to a `tabpanel` is also valid but heavier; the existing
  follow toggles already standardize on the `aria-pressed` shape —
  [players-follow.tsx](../../apps/web/src/app/players/_components/players-follow.tsx),
  [groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)
  — so match those.)

#### A3. Scoreboard modals have no Escape / focus-trap / return-focus / label ✅ (2026-06-03)

- **Where:**
  [apps/web/src/app/tools/scoreboard/[code]/\_components/scoreboard-view.tsx#L559-L617](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx#L559-L617)
  (`ShareModal`) and
  [#L522-L557](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx#L522-L557)
  (`WinnerOverlay`).
- **Issue:** `ShareModal` sets `role="dialog" aria-modal="true"` and closes
  on backdrop click, but: (1) no Escape-to-close — keyboard-only users
  can't dismiss it without tabbing to the Close button; (2) no focus trap,
  so Tab leaks to the scoreboard behind it; (3) focus is neither moved into
  the dialog on open nor returned to the "Remote link" trigger on close;
  (4) the `<h2>` "Remote control link" is not wired via `aria-labelledby`,
  so the dialog has no accessible name. `WinnerOverlay` is a full-screen
  modal (covers the board, owns the Rematch/New-game actions) with **no**
  `role="dialog"`/`aria-modal` and no focus move — when a match ends, an AT
  user gets no announcement and no focus change.
- **WCAG:** 2.1.1 Keyboard, 2.4.3 Focus Order, 4.1.2 Name/Role/Value
- **Fix:** This is the Bundle-6 Radix-Dialog target (AGENTS.md "UI
  primitives — Radix UI"): once `@radix-ui/react-dialog` lands, migrate both
  overlays to it (free Escape + focus trap + return-focus + labelling).
  Interim hand-roll: add an Escape `keydown` handler, an
  `aria-labelledby` on the dialog pointing at the `<h2>` id, focus the
  dialog (or first button) on open, and `triggerRef.current?.focus()` on
  close — the same pattern `datetime-picker.tsx` already uses (Bundle 42).
  Give `WinnerOverlay` `role="dialog" aria-modal="true"` + an
  `aria-label`/labelled heading and focus it on win.

#### A4. Scoreboard score button strips its focus indicator ✅ (2026-06-03)

- **Where:**
  [apps/web/src/app/tools/scoreboard/[code]/\_components/scoreboard-view.tsx#L341-L346](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx#L341-L346)
- **Issue:** The full-panel "Add point to {team}" button — the primary
  scoring control — sets `focus:outline-none` with **no** `focus-visible`
  replacement. A keyboard / switch user tabbing through the scoreboard gets
  zero visible indication of which side is focused before they activate it.
- **WCAG:** 2.4.7 Focus Visible
- **Fix:** Add a `focus-visible:` ring that reads against both the black
  and white scoreboard themes, e.g. `focus-visible:outline-none
focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-current/40`
  (the button already inherits the theme `currentColor`). Same gap, lower
  stakes, on the readonly copy input at
  [share-link.tsx#L114](../../apps/web/src/components/share-link.tsx#L114)
  (`outline-none` + only `focus:border-primary`) — see P3 B4.

#### A5. Chat live message log isn't announced; send errors aren't a live region ✅ (2026-06-03)

- **Where:**
  [apps/web/src/components/conversation-view.tsx#L392-L396](../../apps/web/src/components/conversation-view.tsx#L392-L396)
  (scrolling message list) and
  [#L593](../../apps/web/src/components/conversation-view.tsx#L593)
  (`{error && <p className="text-xs text-red-600">{error}</p>}`).
- **Issue:** Messages arriving over the `chat:{id}` Broadcast topic are
  appended to a plain `<div>` with no `role="log"` / `aria-live`, so a
  screen-reader user in the thread hears nothing when a new message lands.
  Separately, when a send fails the error `<p>` is injected with no
  `role="alert"`/`aria-live`, so the failure is silent to AT (the user
  thinks the message sent).
- **WCAG:** 4.1.3 Status Messages
- **Fix:** Put `role="log" aria-live="polite" aria-relevant="additions"`
  on the message-list container (polite, not assertive — a busy team room
  shouldn't interrupt). Wrap the send-error `<p>` in `role="alert"` (or
  give it `aria-live="assertive"`). The toast system already models the
  foreground/background `aria-live` policy
  ([toast.tsx](../../apps/web/src/components/toast.tsx)) if a toast is
  preferred over inline text for the error.

### P3 findings

#### B1. Live in-place score updates are not announced ✅ (2026-06-03)

- **Where:**
  [apps/web/src/app/events/[id]/\_components/live-score.tsx#L17-L33](../../apps/web/src/app/events/[id]/_components/live-score.tsx#L17-L33)
- **Issue:** The `LiveScore` badge re-renders the rally score as the
  scoreboard broadcasts changes, but has no `aria-live`, so AT users on a
  bracket/standings page don't hear score progress. Lower priority — it's
  ambient secondary info, and a per-point `aria-live` could be noisy.
- **WCAG:** 4.1.3 Status Messages
- **Fix:** If announcing, add `aria-live="polite"` to the score `<span>` and
  give the row an `aria-label` like `"{teamA} {scoreA}, {teamB} {scoreB},
live"` so the whole state reads as one utterance rather than digit-by-digit.
  Acceptable to defer — document as intentional if so.

#### B2. Timeframe "tabs" use `role="tab"` on navigation links ✅ (2026-06-03)

- **Where:**
  [apps/web/src/app/events/\_components/event-timeframe-tabs.tsx#L26-L69](../../apps/web/src/app/events/_components/event-timeframe-tabs.tsx#L26-L69)
- **Issue:** `role="tablist"` + `<Link role="tab" aria-selected>` is applied
  to plain navigation links (each switches the whole page URL). The ARIA tab
  pattern implies arrow-key roving focus + an `aria-controls`'d `tabpanel`,
  none of which exist here, so AT users get a tab affordance that doesn't
  behave like tabs. (Links are still keyboard-reachable, so this is a
  semantics mismatch, not a hard block.)
- **WCAG:** 4.1.2 Name, Role, Value
- **Fix:** Prefer the navigation idiom: drop `role="tablist"`/`role="tab"`,
  wrap in `<nav aria-label="Event timeframe">`, and mark the active link
  with `aria-current="page"`. Keeps the look, drops the false tab contract.

#### B3. No accessibility-statement page (promoted from open question) ✅ (2026-06-03)

- **Where:** site-wide — no `/accessibility` route exists; the footer links
  none.
- **Issue:** 508 / public-accommodation contexts commonly expect a published
  accessibility statement (conformance target, known gaps, contact path).
- **WCAG:** organizational (not a success criterion) but a 508 expectation.
- **Fix:** Add a static `/accessibility` page (conformance goal = WCAG 2.1
  AA, last-reviewed date, a feedback email) and link it from the footer
  alongside the existing legal links.

#### B4. Readonly copy input has a weak (color-only) focus indicator ✅ (2026-06-03)

- **Where:**
  [apps/web/src/components/share-link.tsx#L114](../../apps/web/src/components/share-link.tsx#L114)
- **Issue:** `outline-none` with only `focus:border-primary` — a border
  hue change can fall below 3:1 against the adjacent fill and is easy to
  miss. Minor (it's a copy field), grouped with A4.
- **WCAG:** 2.4.7 Focus Visible, 1.4.11 Non-text Contrast
- **Fix:** Use the standardized `focus-visible:ring-2
focus-visible:ring-offset-2 focus-visible:ring-primary` (or the shared
  `fieldInputClass` from
  [field-styles.ts](../../apps/web/src/components/field-styles.ts)).

### Open questions — status this pass

- **Shared `Combobox` primitive** (user-picker + address-autocomplete): still
  open. Both work post-Bundle-43 but duplicate the WAI-ARIA combobox wiring;
  consolidation remains the right long-term move.
- **End-to-end AT testing** (VoiceOver/NVDA on RSVP + Pro-checkout, and now
  the chat + live-scoring flows): still not done. Static review cannot judge
  announcement quality — the chat `role="log"` choice (A5) in particular
  wants a real VoiceOver pass.
- **Accessibility statement:** promoted to a tracked P3 (B3 above).
- **Contrast tokens — spot-checked this pass:** `--tw-color-muted`
  (`#555F60` light / `#9FBFBE` dark) on the app background computes to
  ~**6.2:1** (light) and ~**8.9:1** (dark) — passes 4.5:1, so the pervasive
  `text-muted` is fine. The opacity-derived ramp is the watch item:
  `text-fg/70`/`/80` stay ≥ ~5:1, but **`text-fg/60` lands at ~4.3:1** on
  `bg-bg` (just under AA for normal text) — avoid it for body copy; reserve
  for ≥ 18.66px/bold. A full Stark/axe sweep is still the way to confirm the
  long tail.

### Verified good (new surface)

- **Bracket format picker** ([format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx))
  — exemplary: real `<fieldset>`/`<legend>`, native `<input type="radio">`
  (sr-only) inside `<label>`, `role="radiogroup"` + `aria-label`, decorative
  SVGs `aria-hidden`, the under-fill warning in `role="alert"`. Model for
  other card-pickers.
- **Chat composer affordances** — the attach-image and remove-attachment
  icon buttons carry `aria-label`, the textarea has `aria-label="Message"`,
  and the file input is correctly hidden-but-labelled. (Only the live
  region / error announce is missing — A5.)
- **Heading structure** on the new pages (`/tools/*`, `/brackets/*`,
  `/messages/*`) — 16 `h1` / 16 `h2` / 6 `h3`, no skips observed.
- **No raw `<img>`** in the new surfaces except the chat composer's local
  object-URL preview, which is correctly `alt`'d and eslint-annotated.

---

## 2026-06-08 re-audit — monetization / chat / media / games surface

Static review (Tailwind-class + JSX inspection; no AT/keyboard runtime testing)
of the UI shipped **after** the 2026-06-03 close-out: passes/memberships
(`pass-panel`), Club payouts + the group analytics dashboard, host referrals,
the liability-waiver e-sign (`event-waiver-section`), sponsor slots
(`event-sponsor-section`, the logo/badge uploads), event media posts + award
voting (`media-card`, `add-media-form`), the shared chat engine in event/group
rooms + DMs (`conversation-view`, `dm-thread`, `room-chat-panel`,
`block-control`), the volley-pong / keepie-uppie / 404 games, and the
off-platform conversion nudge. Same WCAG 2.1 AA / Section 508 bar; grading per
the [audits rubric](README.md).

### P2 findings

#### C1. `text-destructive` is an undefined token — error messages render with no error color, Remove-hover red never fires ✅ (2026-06-08)

- **Where (error text, the real bug):**
  [event-badge-icon-upload.tsx#L97](../../apps/web/src/app/events/[id]/edit/event-badge-icon-upload.tsx#L97),
  [hero-image-upload.tsx#L122](../../apps/web/src/components/hero-image-upload.tsx#L122),
  [avatar-upload.tsx#L169](../../apps/web/src/components/avatar-upload.tsx#L169),
  [avatar-crop-dialog.tsx#L132](../../apps/web/src/components/avatar-crop-dialog.tsx#L132),
  [templates-section.tsx#L86](../../apps/web/src/app/events/new/_components/templates-section.tsx#L86)
  - [#L190](../../apps/web/src/app/events/new/_components/templates-section.tsx#L190).
    **Where (hover-only, cosmetic):** the "Remove" buttons at
    [hero-image-upload.tsx#L96](../../apps/web/src/components/hero-image-upload.tsx#L96),
    [avatar-upload.tsx#L161](../../apps/web/src/components/avatar-upload.tsx#L161),
    [templates-section.tsx#L146](../../apps/web/src/app/events/new/_components/templates-section.tsx#L146).
- **Issue:** `destructive` is **not defined** anywhere in
  [globals.css](../../apps/web/src/app/globals.css) or any theme config — only
  `--color-md-error` is. Under Tailwind v4 an unknown utility emits **no CSS**,
  so `text-destructive` is a silent no-op: the upload / template-save error
  `<p>`/`<span>` inherit the surrounding `text-fg` and render in the **same
  color as normal body text — the only error affordance (red) is missing**, and
  none of these carry `role="alert"`, so AT gets nothing either. A failed
  badge-icon / hero / avatar upload or template save therefore shows a message
  that doesn't read as an error. This is a pre-M3 leftover that survived the
  2026-06-07 semantic-color sweep, and **typecheck / lint / build can't catch
  it** (unknown Tailwind utilities don't error).
- **WCAG:** 1.4.1 Use of Color, 1.4.3 Contrast, 4.1.3 Status Messages.
- **Fix:** Swap `text-destructive` → `text-md-error` and `hover:text-destructive`
  → `hover:text-md-error` (the defined M3 error role; light + dark tuned per
  AGENTS.md §17). Add `role="alert"` to the error `<p>`/`<span>` so the failure
  is announced (the client upload widgets don't go through `useAlertReveal`).
  Consider a `no-restricted-syntax` ratchet on `*-destructive` so the dead token
  can't reappear, same strategy as the `<th scope>` and CTA/field vocab locks.

#### C2. Form-error text uses raw `text-red-500` — fails AA contrast on the light surface ✅ (2026-06-08)

- **Where:**
  [host-broadcast-panel.tsx#L67](../../apps/web/src/app/events/[id]/_components/host-broadcast-panel.tsx#L67),
  [captain-broadcast-panel.tsx#L73](../../apps/web/src/app/teams/[id]/_components/captain-broadcast-panel.tsx#L73),
  [add-media-form.tsx#L82](../../apps/web/src/app/events/[id]/media/_components/add-media-form.tsx#L82),
  [add-profile-video-form.tsx#L59](../../apps/web/src/app/profile/_components/add-profile-video-form.tsx#L59)
  (+ the decorative "expired" pulse at
  [timer-view.tsx#L116](../../apps/web/src/app/tools/timer/_components/timer-view.tsx#L116)).
- **Issue:** `text-red-500` (`#ef4444`) on the warm-sand light surface computes
  to ~**3.8:1** — below the 4.5:1 AA floor for `text-sm` normal-weight body
  text. These are `role="alert"` error messages (so AT hears them), but a
  low-vision sighted user in the default light theme gets sub-threshold error
  copy. They escaped the 2026-06-07 `text-red-600 → text-md-error` sweep because
  they're the `-500` step, not `-600`.
- **WCAG:** 1.4.3 Contrast (Minimum).
- **Fix:** Swap to `text-md-error` (the role token is contrast-tuned for both
  themes). One-token change; completes the semantic-color migration. The
  decorative `timer-view` pulse should also move to `text-md-error` for theme
  correctness (it's a genuine "expired" warning, not a decorative team color).

### P3 findings

#### C3. Weak `focus:ring-1` focus ring regressed in new form inputs ✅ (2026-06-08)

- **Where:**
  [schedule/\_components/match-row.tsx#L40](../../apps/web/src/app/events/[id]/schedule/_components/match-row.tsx#L40)
  (shared `inputClass` for the schedule inputs + team selects);
  [bracket/\_components/walk-in-team-form.tsx#L36](../../apps/web/src/app/events/[id]/bracket/_components/walk-in-team-form.tsx#L36)
  - [#L196](../../apps/web/src/app/events/[id]/bracket/_components/walk-in-team-form.tsx#L196)
  - [#L212](../../apps/web/src/app/events/[id]/bracket/_components/walk-in-team-form.tsx#L212).
- **Issue:** The 2026-05-17 P2 standardized focus rings across 9 inputs
  (`focus:ring-1` → `focus-visible:ring-2 focus-visible:ring-offset-2`). New
  code reintroduced the weak 1 px ring — and `walk-in-team-form` pairs it with
  `focus:outline-none`, **removing the strong UA outline for a 1 px ring** that
  rarely clears 3:1 against the input fill (the original P2's exact failure).
- **WCAG:** 2.4.7 Focus Visible, 2.4.11 Focus Appearance.
- **Fix:** Use the shared `fieldInputClass` from
  [field-styles.ts](../../apps/web/src/components/field-styles.ts) (carries the
  standardized ring), or inline `focus-visible:ring-2
focus-visible:ring-offset-2 focus-visible:ring-primary`. These hand-rolled
  input class strings also sidestep the AGENTS.md §11 field-vocab ratchet
  because they're not named `inputClass`/`selectClass` at the lint-checked
  shape — folding them onto `fieldInputClass` closes both gaps.

#### C4. Hidden file input is `sr-only` (focusable but unlabeled) in 4 upload widgets ✅ (2026-06-08)

- **Where:**
  [sponsor-logo-upload.tsx#L118-L128](../../apps/web/src/app/events/[id]/edit/sponsor-logo-upload.tsx#L118-L128),
  [event-badge-icon-upload.tsx#L100](../../apps/web/src/app/events/[id]/edit/event-badge-icon-upload.tsx#L100),
  [avatar-upload.tsx#L174](../../apps/web/src/components/avatar-upload.tsx#L174),
  [hero-image-upload.tsx#L125](../../apps/web/src/components/hero-image-upload.tsx#L125).
- **Issue:** Each `<input type="file">` is hidden with `className="sr-only"`,
  which keeps it **in the tab order with no accessible name** while a separate
  visible, labeled button (`onClick={inputRef.current?.click()}`) is the real
  control. A keyboard / SR user lands on an extra, nameless "file upload, edit"
  tab stop. The chat composer already does this correctly with
  `className="hidden"` ([conversation-view.tsx#L671-L675](../../apps/web/src/components/conversation-view.tsx#L671-L675)),
  which removes it from the tab order.
- **WCAG:** 1.3.1 Info and Relationships, 4.1.2 Name/Role/Value.
- **Fix:** Either match the chat composer (`className="hidden"`), or keep
  `sr-only` but add `tabIndex={-1}` + `aria-hidden="true"` so AT/keyboard only
  see the visible labeled button.

#### C5. New external links missing the "(opens in new tab)" cue ✅ (2026-06-08)

- **Where:**
  [event-waiver-section.tsx#L52-L60](../../apps/web/src/app/events/[id]/_components/event-waiver-section.tsx#L52-L60)
  ("Read the full waiver ↗"),
  [event-sponsor-section.tsx#L42-L53](../../apps/web/src/app/events/[id]/_components/event-sponsor-section.tsx#L42-L53)
  (whole-card sponsor link),
  [community-listing-article.tsx](../../apps/web/src/app/community/[slug]/_components/community-listing-article.tsx),
  [social-links.tsx#L85-L94](../../apps/web/src/components/social-links.tsx#L85-L94)
  (these carry a per-network `aria-label`/`title`, but no new-tab cue).
- **Issue:** All open in a new tab (`target="_blank"`) with no programmatic
  "opens in new tab" affordance — the recurrence pattern the 2026-05-17 P2 +
  Bundle 42 addressed via `OpenInNewTabButton` / the `share-link` external
  variant. New surfaces re-introduce the bare external link.
- **WCAG:** 2.4.4 Link Purpose, 3.2.2 On Input.
- **Fix:** Append an `sr-only` "(opens in new tab)" span next to the visible
  arrow (the established pattern), or route through `OpenInNewTabButton` where
  it's a button affordance.

#### C6. Tiny text-only tap targets below the WCAG 2.2 §2.5.8 minimum ✅ (2026-06-08)

- **Where:**
  [block-control.tsx#L33-L42](../../apps/web/src/app/messages/[id]/_components/block-control.tsx#L33-L42)
  ("Block" / "Unblock" — `text-xs`, **no padding**, so ~16 px tall);
  the `text-xs px-2.5 py-1` action chips in
  [media-card.tsx#L13-L17](../../apps/web/src/app/events/[id]/media/_components/media-card.tsx#L13-L17)
  (Feature / Remove / Report / vote — ~24 px, borderline).
- **Issue:** WCAG 2.2 added 2.5.8 Target Size (Minimum) at **AA** = 24×24 CSS px
  (with a spacing exception). The block toggle has no padding and clearly falls
  short; the media chips sit right on the line.
- **WCAG:** 2.5.8 Target Size (Minimum) (AA in WCAG 2.2).
- **Fix:** Add the shared `tap-target` utility (Bundle 130) or padding to clear
  24 px. While there, give `BlockControl` `aria-pressed={blocked}` (it's a
  binary state toggle, like the follow buttons) so the state — not just the
  changing label — is exposed; an optional `aria-live` confirmation would also
  announce the optimistic flip.

### Stale code / improvement (open questions, advanced)

#### C7. Hand-rolled dialogs/popovers now have a Radix replacement in-tree

- **Where:** the scoreboard `ShareModal` + `WinnerOverlay` and their local
  `useDialogFocusTrap`
  ([scoreboard-view.tsx](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx));
  the hand-rolled `role="dialog"` popovers in
  [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)
  and [share-link.tsx](../../apps/web/src/components/share-link.tsx).
- **Issue:** The 2026-06-03 A3 fix was explicitly an **interim hand-roll** to be
  superseded "when the Radix Dialog primitive lands." It has landed —
  [form-modal.tsx](../../apps/web/src/components/form-modal.tsx) is
  `@radix-ui/react-dialog` with free Escape / focus-trap / return-focus /
  `aria-labelledby`, and `nav-dropdown` already uses Radix. The interim
  `useDialogFocusTrap` is now duplicated, hand-maintained focus logic where a
  battle-tested primitive exists.
- **Fix:** Migrate the scoreboard overlays to `FormModal` (or a thin
  `RadixDialog` wrapper) and delete `useDialogFocusTrap`; move the
  notification-bell / share-link popovers to `@radix-ui/react-popover` /
  `-dialog`. Pure refactor — preserves behavior, removes hand-rolled a11y. This
  is the AGENTS.md "UI primitives — Radix UI" Bundle-6 target.

#### C8. Combobox primitive + end-to-end AT testing still outstanding

- **Shared `Combobox`:** `address-autocomplete` and `user-picker` still each
  hand-wire the full WAI-ARIA combobox pattern. Consolidating into one
  primitive (now reasonable alongside the Radix adoption) would dedupe the ARIA
  - close-behavior. Unchanged since 2026-05-23.
- **End-to-end AT testing:** still not done. The chat live-region (`role="status"`
  in `conversation-view`, now feeding DMs + the new event/group rooms), the
  scoreboard win announcement, and the games' `role="img"` labels all want a
  real VoiceOver/NVDA pass — static review can't judge announcement quality.

### Verified good (new surface)

- **The games** ([keepie-uppie.tsx](../../apps/web/src/components/keepie-uppie.tsx),
  [volley-pong.tsx](../../apps/web/src/app/play/_components/volley-pong.tsx)) —
  exemplary: `<canvas role="img">` with a descriptive `aria-label`, an
  `aria-live="polite"` score readout, a reduced-motion pause path, keyboard
  controls (space / arrow keys), and `focus-visible:ring-2`. Model for any
  future canvas surface.
- **`FormModal`** is on Radix Dialog with `aria-labelledby` (Title) +
  `aria-describedby` (Description) + a labeled `Close` + automatic focus
  trap/Escape — the right substrate for C7's migration.
- **Chat live region (the 2026-06-03 A5 fix) lives in the shared
  `ConversationView`**, so the new `dm-thread` and `room-chat-panel` (event /
  group rooms) inherit the polite `role="status"` announce + the `role="alert"`
  send error for free.
- **Waiver e-sign** ([event-waiver-section.tsx](../../apps/web/src/app/events/[id]/_components/event-waiver-section.tsx))
  — name input has `aria-label` (not placeholder-only), the agree checkbox is
  wrapped in a `<label>`, success uses `text-md-success`.
- **Media voting** ([media-card.tsx](../../apps/web/src/app/events/[id]/media/_components/media-card.tsx))
  — vote chips carry `aria-pressed`; Live / Featured badges pair an
  `aria-hidden` emoji with a text label.
- **`<th scope>` lint ratchet is holding** — zero bare `<th>` across the
  now-larger table surface (club analytics, receipts, schedule standings all
  compliant). The ratchet-behind-fix strategy worked.
- **Select labeling** — filters, schedule team selects, and the standings tool
  all use a wrapping `<label>` or an explicit `aria-label` (e.g. "Home team").
- **`off-platform-upsell`** — `<aside aria-label>` + an `aria-label`'d Dismiss
  button.

---

## 2026-06-09 re-audit — legal / post-monetization surface

Static review (Tailwind-class + JSX inspection; no AT/keyboard runtime testing)
the day after the 2026-06-08 monetization/chat/media/games pass. Covered the
newly-reworked legal + footer surface (privacy / terms / refunds pages, the
`/legal/accessibility` statement, the `ConsentBanner`, `SiteFooter`) and a fresh
anti-pattern grep across `apps/web`. Same WCAG 2.1 AA / Section 508 bar; grading
per the [audits rubric](README.md).

### What's holding (regression guards + prior fixes verified)

- **`text-destructive` ratchet (C1) is holding** — the only `destructive` hits
  are the `FormModal`/`ConfirmSubmitButton` JSX prop and code comments; **zero**
  dead-token class strings. The `no-restricted-syntax` Literal + TemplateElement
  rules in [eslint.config.mjs](../../apps/web/eslint.config.mjs) are in place.
- **`<th scope>` ratchet (A1) is holding** — a fresh walk of every `<th>` in the
  tree returns **0** without a `scope`, across the now-much-larger table surface
  (club analytics, billing analytics, standings, receipts, schedule).
- **Semantic-color migration effectively complete** — `text-red-600` → **0**.
  The only raw status palette left is the scoreboard save-bar (D1 below) and the
  intentionally-decorative `timer-view` expired pulse (documented in C2).
- **Focus rings** — `focus:ring-1` → **0**, and `focus:outline-none` without a
  `focus-visible` replacement → **0**; the 2026-06-08 C3 regression stayed fixed.
- **Legal / footer surface** — privacy/terms/refunds carry a clean h1→h2→h3
  hierarchy with no skips and real `<ul>` list semantics (the `LegalLayout`
  styles all three heading levels). `ConsentBanner` is a labelled `role="region"`
  with two real `type="button"` controls; `SiteFooter` uses `<h2>` column titles
  and now links the `/legal/accessibility` statement. No positive `tabIndex`
  anywhere in the tree.

### P3 findings

#### D1. Scoreboard match save-bar status isn't announced; success/error use raw palette

- **Where:**
  [scoreboard-view.tsx#L585](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx#L585)
  (`Saved ✓`, `text-emerald-500`) and
  [#L592](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx#L592)
  (`{error && <span … text-red-400>`), inside the plain `<div>` save-bar wrapper
  at [~L566](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx#L566).
- **Issue:** When a host saves a scheduled-match result from this bar (the
  fallback surface that stays after the `WinnerOverlay` is dismissed), the
  "Saved ✓" confirmation and the save-failure error render into a plain `<div>`
  with **no `role="status"`/`role="alert"`/`aria-live`** — so a keyboard / SR
  user gets no spoken confirmation or failure, and can't tell whether the save
  landed. The 2026-06-03 A3 fix gave the **primary** save surface
  (`WinnerOverlay`) a dialog role + focus move, and A5 gave chat a live region,
  but this inline status bar was never covered. Separately the two states use
  raw `text-emerald-500` / `text-red-400` instead of the M3 `text-md-success` /
  `text-md-error` role tokens — and `text-red-400` (`#f87171`) on the **white**
  scoreboard theme is well under the 4.5:1 AA floor for this small-text label.
- **WCAG:** 4.1.3 Status Messages, 1.4.3 Contrast (Minimum).
- **Fix:** Wrap the right-hand status group in a polite live region —
  `role="status" aria-live="polite"` on the success branch, `role="alert"` on
  the error `<span>` — so the save outcome is announced. Swap
  `text-emerald-500` → `text-md-success` and `text-red-400` → `text-md-error`
  (the role tokens are contrast-tuned for both the black and white scoreboard
  themes, per AGENTS.md §17). Low stakes — the `WinnerOverlay` is the primary
  save path — hence P3.

#### D2. Public-profile follow/message toggle skips the `aria-pressed` convention + explicit `type`

- **Where:**
  [player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx)
  — the `✓ Following` / `+ Follow` toggle (~L156–L168) and the `Message` button.
- **Issue:** The follow toggle conveys its state by swapping the label/icon
  (`+ Follow` ↔ `✓ Following`) but exposes **no `aria-pressed`**, unlike the
  binary-toggle convention the 2026-06-02 A2 / 2026-06-08 C6 fixes standardized
  on — `players-follow.tsx`, `groups-follow.tsx`, `block-control.tsx`, and the
  media-card vote chips all carry `aria-pressed`. This newer public-profile CTA
  island (shipped in the public-profile-ux work) didn't pick it up. The three
  buttons (Follow/Unfollow, Message) also omit an explicit `type="button"`;
  they're **not** inside a `<form>` so there's no accidental-submit bug, but it
  diverges from the repo's "buttons set explicit `type`" convention. The visible
  label text does change, so the state isn't fully silent to AT — hence P3, not
  P2.
- **WCAG:** 4.1.2 Name, Role, Value.
- **Fix:** Add `aria-pressed={state.isFollowing}` to the follow/unfollow button
  (match `players-follow.tsx`), and add `type="button"` to all three buttons. No
  `aria-live` needed — the existing `useToast` already announces follow/unfollow
  failures.

### Carried-over backlog (unchanged this pass)

- **C7 — Radix-dialog migration of the hand-rolled overlays.** Confirmed still
  open: **6** hand-rolled `role="dialog"` surfaces remain — the scoreboard
  `ShareModal` + `WinnerOverlay` (and their interim `useDialogFocusTrap`),
  [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx),
  [share-link.tsx](../../apps/web/src/components/share-link.tsx),
  [datetime-picker.tsx](../../apps/web/src/components/datetime-picker.tsx), and
  [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx) — while
  [form-modal.tsx](../../apps/web/src/components/form-modal.tsx)
  (`@radix-ui/react-dialog`, free Escape / focus-trap / return-focus /
  `aria-labelledby`) already exists in-tree. The interim hand-rolled focus logic
  is duplicated, hand-maintained a11y where a battle-tested primitive is
  available. Pure-refactor target — see the 2026-06-08 C7 write-up.
- **C8 — Shared `Combobox` primitive + end-to-end AT testing.** Unchanged:
  `address-autocomplete` and `user-picker` still each hand-wire the full
  WAI-ARIA combobox pattern, and no VoiceOver/NVDA pass has been run against the
  chat live region, the scoreboard win announcement, or the canvas-game
  `role="img"` labels. Static review can't judge announcement quality.

---

## Remediation log

| Date       | Finding                                                                                                                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-08 | C1–C6: dead `text-destructive` token, raw `red-500` error contrast, `focus:ring-1` regression, focusable hidden file inputs, new-tab cues, tap target | 2026-06-08 re-audit remediation (C1–C6; C7–C8 deferred). **C1** — `text-destructive` is defined nowhere (only `--color-md-error` is), so under Tailwind v4 it emits no CSS: upload/template error messages rendered in plain body colour with no `role="alert"`. Swapped all 9 usages → `text-md-error` / `hover:text-md-error`, added `role="alert"` to the 5 error nodes, and added a `*-destructive` `no-restricted-syntax` ratchet in [eslint.config.mjs](../../apps/web/eslint.config.mjs) (Literal + TemplateElement; verified it fires). **C2** — 4 form-error `text-red-500` (~3.8:1 on light) → `text-md-error`; the always-dark `bg-black` `timer-view` expired-pulse left raw (decorative, theme-independent). **C3** — `focus:ring-1` → `focus-visible:ring-2 focus-visible:outline-none` in `match-row` + `walk-in-team-form` (×3). **C4** — `sr-only` file inputs in sponsor-logo / event-badge-icon / avatar / hero uploaders gain `tabIndex={-1}` + `aria-hidden` (operated via the labelled trigger, matching the chat composer's `hidden`). **C5** — `sr-only "(opens in new tab)"` on the waiver / sponsor-card / community-article links; social-links append it to `aria-label`. **C6** — `BlockControl` gains `aria-pressed={blocked}` (follow-button convention) + `px-2 py-1.5` (≥24px); media-card chips already at the 24px floor, left as-is. `pnpm typecheck && lint && test && build` green (1108 unit tests). | [event-badge-icon-upload.tsx](../../apps/web/src/app/events/[id]/edit/event-badge-icon-upload.tsx), [hero-image-upload.tsx](../../apps/web/src/components/hero-image-upload.tsx), [avatar-upload.tsx](../../apps/web/src/components/avatar-upload.tsx), [avatar-crop-dialog.tsx](../../apps/web/src/components/avatar-crop-dialog.tsx), [templates-section.tsx](../../apps/web/src/app/events/new/_components/templates-section.tsx), [host-broadcast-panel.tsx](../../apps/web/src/app/events/[id]/_components/host-broadcast-panel.tsx), [captain-broadcast-panel.tsx](../../apps/web/src/app/teams/[id]/_components/captain-broadcast-panel.tsx), [add-media-form.tsx](../../apps/web/src/app/events/[id]/media/_components/add-media-form.tsx), [add-profile-video-form.tsx](../../apps/web/src/app/profile/_components/add-profile-video-form.tsx), [match-row.tsx](../../apps/web/src/app/events/[id]/schedule/_components/match-row.tsx), [walk-in-team-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/walk-in-team-form.tsx), [sponsor-logo-upload.tsx](../../apps/web/src/app/events/[id]/edit/sponsor-logo-upload.tsx), [event-waiver-section.tsx](../../apps/web/src/app/events/[id]/_components/event-waiver-section.tsx), [event-sponsor-section.tsx](../../apps/web/src/app/events/[id]/_components/event-sponsor-section.tsx), [community-listing-article.tsx](../../apps/web/src/app/community/[slug]/_components/community-listing-article.tsx), [social-links.tsx](../../apps/web/src/components/social-links.tsx), [block-control.tsx](../../apps/web/src/app/messages/[id]/_components/block-control.tsx), [eslint.config.mjs](../../apps/web/eslint.config.mjs) |
| 2026-06-03 | P3 (B1–B4): live-score announce, timeframe nav semantics, a11y statement, copy-input focus ring                                                       | Re-audit P3 sweep — closes the whole P3 backlog. **B1** — [live-score.tsx](../../apps/web/src/app/events/[id]/_components/live-score.tsx) marks the visible badge `aria-hidden` and adds an `sr-only` `aria-live="polite" aria-atomic="true"` region carrying one composed sentence (`"Live score N to M, sets X to Y"`), so AT hears a single clean utterance per update instead of re-reading "Live" + digits + "sets". **B2** — [event-timeframe-tabs.tsx](../../apps/web/src/app/events/_components/event-timeframe-tabs.tsx) dropped the faux `role="tablist"`/`role="tab"`/`aria-selected` (these are full-page nav links, not WAI-ARIA tabs) for `<nav aria-label>` + `aria-current="page"` (spread to satisfy `exactOptionalPropertyTypes`). **B3** — added [legal/accessibility/page.tsx](../../apps/web/src/app/legal/accessibility/page.tsx) (WCAG 2.1 AA conformance target, what's done, known limitations — maps/Stripe/scoreboard, barrier-report contact, last-reviewed date), reusing the legal prose layout, and linked it from the footer's Legal column ([site-footer.tsx](../../apps/web/src/components/site-footer.tsx)). **B4** — [share-link.tsx](../../apps/web/src/components/share-link.tsx) copy input swapped color-only `focus:border-primary` for `focus-visible:ring-2 focus-visible:ring-primary`. `pnpm typecheck && lint && test && build` green (214 web tests).                                        | [live-score.tsx](../../apps/web/src/app/events/[id]/_components/live-score.tsx), [event-timeframe-tabs.tsx](../../apps/web/src/app/events/_components/event-timeframe-tabs.tsx), [legal/accessibility/page.tsx](../../apps/web/src/app/legal/accessibility/page.tsx), [site-footer.tsx](../../apps/web/src/components/site-footer.tsx), [share-link.tsx](../../apps/web/src/components/share-link.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-06-03 | P2 (A3 + A4): scoreboard modal a11y + score-button focus ring                                                                                         | Re-audit A3 + A4 (interim hand-roll; superseded when the Radix Dialog primitive lands). **A3** — added a local `useDialogFocusTrap` hook (mirrors the mobile-menu trap: move focus in on open, cycle Tab/Shift+Tab, restore focus to the opener on close, optional Escape-to-close) and applied it to both [scoreboard-view.tsx](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx) overlays. `ShareModal` now closes on Escape, traps focus, returns focus to the "Remote link" trigger, and carries `role="dialog"` + `aria-modal` + `aria-labelledby` on the **panel** (moved off the backdrop). `WinnerOverlay` gained `role="dialog"` + `aria-modal` + `aria-labelledby` (eyebrow + name) and focus-move/trap (no Escape — the match is over, user picks Rematch/New game). **A4** — the giant "Add point" button swapped `focus:outline-none` for `outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-current/70`, giving a keyboard focus ring that reads on both black and white themes. Ref-sync moved into an effect to satisfy `react-hooks/refs`. `pnpm typecheck && lint && test && build` green (214 web tests).                                                                                                                                                                                                                                                      | [scoreboard-view.tsx](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-06-03 | P2 (A5): chat live messages + send errors not announced                                                                                               | Re-audit A5 — added a visually-hidden polite live region (`role="status" aria-live="polite"`) to [conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx) fed only by Realtime **INSERTs from other people** (skips the viewer's own broadcast echo, edits/deletes, and bulk "load earlier" prepends), and wrapped the send-error `<p>` in `role="alert"`. **Deviation from the finding's suggested fix:** chose a dedicated live region over `role="log"` on the scroll container — `role="log"` carries an implicit `aria-live="polite"` that would re-read the viewer's own messages and the whole history on "load earlier", which is the noise this avoids. Announces `"{sender}: {body}"` (or `"{sender} sent a photo"` for image-only). `pnpm typecheck && lint && test && build` green (214 web tests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-06-03 | P2 (A2): auth sign-in/up toggle exposes no selected state                                                                                             | Re-audit A2 — added `aria-pressed={!signUp}` / `aria-pressed={signUp}` to the two toggle buttons in [auth-mode-tabs.tsx](../../apps/web/src/app/login/_components/auth-mode-tabs.tsx) so the active auth mode is exposed to AT (previously conveyed by `bg-primary` styling only). Matches the existing follow-toggle `aria-pressed` convention (players-follow / groups-follow) rather than the heavier `role="tablist"` shape. `pnpm typecheck && lint && test && build` green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [auth-mode-tabs.tsx](../../apps/web/src/app/login/_components/auth-mode-tabs.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-06-03 | P2 (A1): `scope="col"` regressed on three new tables                                                                                                  | Re-audit A1 — added `scope="col"` to every column `<th>` in the standings tool (7 data headers + the empty "Remove" action column, which gains `scope="col"` + its existing `aria-label`), both billing-analytics tables (Monthly + Recent events, 4 each), and the about/numbers "By city" table (4). **Closed the regression loop with a lint ratchet:** new `no-restricted-syntax` rule `JSXOpeningElement[name.name='th']:not(:has(JSXAttribute[name.name='scope']))` in [eslint.config.mjs](../../apps/web/eslint.config.mjs) now errors on any `<th>` with no `scope` — verified it fires (temporarily stripped one scope → 1 lint error) so it's not a no-op. All existing tables (receipts, earnings, pricing, board-view) already complied. `pnpm typecheck && lint && test && build` green (214 tests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [standings-board.tsx](../../apps/web/src/app/tools/standings/_components/standings-board.tsx), [billing/analytics/page.tsx](../../apps/web/src/app/profile/billing/analytics/page.tsx), [about/numbers/page.tsx](../../apps/web/src/app/about/numbers/page.tsx), [eslint.config.mjs](../../apps/web/eslint.config.mjs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-23 | P3: Placeholder-as-label + icon-only hit-areas + heading sweep                                                                                        | Bundle 50 — closes the P3 cluster. **Placeholder-as-label:** the only `DateTimePicker` callsite without a programmatic label was [event-advanced-details-panel.tsx](../../apps/web/src/components/event-advanced-details-panel.tsx#L121) (registration-close field) — added `htmlFor="registrationClosesAt"` on the `<label>` so SR users hear the field name on focus. All other `DateTimePicker` uses (community new/edit, event new/edit, all using `startsAt`/`endsAt`) already had matching `htmlFor`. `AddressAutocomplete` was verified-stale: it already carries `aria-label="Search for an address or venue"` from Bundle 43. **Icon-only hit-areas:** verified-stale — `alert.tsx` has no close button (the L66 `h-4 w-4` SVG is the decorative variant icon, `aria-hidden`); `mobile-menu.tsx` trigger is `h-11 w-11` since Bundle 2. **Heading sweep:** `grep -rn '<h[1-6]'` across `apps/web/src/app/**/page.tsx` returned 74 `h1` / 153 `h2` / 12 `h3` / zero `h4`-`h6` with no skips; the two pages without a local `h1` (`groups/[id]/page.tsx`, `events/[id]/page.tsx`) emit it from a `_components/` child (`group-header.tsx`, `event-hero.tsx`).                                                                                                                                                                                                                                                                        | [event-advanced-details-panel.tsx](../../apps/web/src/components/event-advanced-details-panel.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-05-23 | P2: Toast close button focus-ring contrast                                                                                                            | Bundle 44 — replaced the inherited `focus:ring-current focus:ring-offset-transparent` on the toast close button with a per-variant `focus-visible` ring map (`VARIANT_RING_CLASSES`): error→red-700 / dark red-200, success→emerald-700 / dark emerald-200, warning→amber-800 / dark amber-200, info→primary. Each entry also pins `ring-offset-<variant-bg>` so the ring reads as a solid 2 px outline against the toast surface rather than bleeding into the page. Closes the last open P2 in the accessibility audit. See [Bundle 44 journal](../journal/2026-05-digest.md#bundle-44).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | [toast.tsx](../../apps/web/src/components/toast.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-05-23 | P2: Combobox ARIA on address + user pickers                                                                                                           | Bundle 43 — `UserPicker` migrated to the WAI-ARIA combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant` keyed on a new `activeIdx`; arrow-key + Enter + Escape navigation; click-outside ref effect replacing the 120 ms blur timeout. Status (Searching… / No matches / N matches) moved into an `aria-live="polite"` sr-only region so the listbox contains only options. `AddressAutocomplete` already had `role="combobox"` + `aria-expanded` + listbox/option roles; added the missing `aria-activedescendant` and parity `aria-live` status region. See [Bundle 43 journal](../journal/2026-05-digest.md#bundle-43).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [user-picker.tsx](../../apps/web/src/components/user-picker.tsx), [address-autocomplete.tsx](../../apps/web/src/components/address-autocomplete.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-05-23 | P2: a11y quick-wins II (datetime / confirm-dialog / new-tab cues)                                                                                     | Bundle 42 — datetime picker now closes on Escape and returns focus to its trigger via a new `triggerRef` + document `keydown` effect; the Done button uses the same close-and-refocus helper. `confirm-submit-button`'s native `<dialog>` sets `aria-modal="true"`. `OpenInNewTabButton` appends `sr-only "(opens in new tab)"` after children so every billing/Stripe-dashboard button announces correctly. `QuickShareButton` in `share-link.tsx` does the same when `external` is set, covering the WhatsApp/X grid items. See [Bundle 42 journal](../journal/2026-05-digest.md#bundle-42).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [datetime-picker.tsx](../../apps/web/src/components/datetime-picker.tsx), [confirm-submit-button.tsx](../../apps/web/src/components/confirm-submit-button.tsx), [open-in-new-tab-button.tsx](../../apps/web/src/components/open-in-new-tab-button.tsx), [share-link.tsx](../../apps/web/src/components/share-link.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-23 | P2: `FieldError` aria wiring (complete)                                                                                                               | Bundle 41 — migrated the remaining 4 forms to the shared `FieldError` + `fieldA11y` primitive. Deleted each form's local shadowing `FieldError` declaration + `errorClass` constant. All inputs with matching `<FieldError>` now spread `{...fieldA11y(name, state.fieldErrors)}` so screen readers get `aria-invalid` + `aria-describedby`. See [Bundle 41 journal](../journal/2026-05-digest.md#bundle-41).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [new-event-form.tsx](../../apps/web/src/app/events/new/new-event-form.tsx), [edit-event-form.tsx](../../apps/web/src/app/events/[id]/edit/edit-event-form.tsx), [community-listing-form.tsx](../../apps/web/src/app/community/new/community-listing-form.tsx), [community-listing-edit-form.tsx](../../apps/web/src/app/community/[slug]/edit/community-listing-edit-form.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-22 | P1: Mobile menu focus trap                                                                                                                            | Added `role="dialog" aria-modal="true" aria-label="Main menu"` to drawer; focuses first focusable on open; Tab/Shift+Tab cycle via `FOCUSABLE` selector. Pathname-change effect now ref-guarded. See [Bundle 2 journal](../journal/2026-05-digest.md#bundle-2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-05-22 | P2: `FieldError` aria wiring (partial)                                                                                                                | Extracted shared `FieldError` + `fieldA11y(name, errors)` helper that returns `{ 'aria-invalid', 'aria-describedby' }`. Migrated 2 of 6 forms. Remaining 4 tracked as follow-up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | new: [field-error.tsx](../../apps/web/src/components/field-error.tsx); migrated: [teams/new/new-team-form.tsx](../../apps/web/src/app/teams/new/new-team-form.tsx), [groups/new/new-group-form.tsx](../../apps/web/src/app/groups/new/new-group-form.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-17 | P1: Tables missing `scope`                                                                                                                            | Added `scope="col"` to every `<th>` in receipts, earnings (main + monthly), pricing comparison, and receipt-detail tables (board-view already had it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx), [earnings/page.tsx](../../apps/web/src/app/profile/billing/earnings/page.tsx), [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx), [receipts/[paymentIntentId]/page.tsx](../../apps/web/src/app/profile/receipts/[paymentIntentId]/page.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-05-17 | P1: Notification popover Escape                                                                                                                       | Verified: existing `useEffect` already registers a document-level `keydown` handler that calls `setOpen(false)` on Escape. No code change needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-05-17 | P1: Mobile menu Escape + return focus                                                                                                                 | Added `useRef` on trigger button; added `keydown` listener that closes drawer + returns focus to trigger on Escape. **Focus trap deferred** (cycling Tab/Shift+Tab through first/last focusable still pending).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-05-17 | P1: Leaflet map missing accessible name                                                                                                               | Added `aria-label="Map showing <title> at <addressLine>"` to `<MapContainer>`. Textual address already rendered above the map on the event page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [event-map.tsx](../../apps/web/src/components/event-map.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-05-17 | P2: Tap target size                                                                                                                                   | Bumped mobile-menu trigger `h-10 w-10` → `h-11 w-11`; notification-bell trigger `h-9 w-9` → `h-11 w-11`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx), [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-17 | P2: Focus-ring contrast                                                                                                                               | Replaced `focus:outline-none focus:ring-1 focus:ring-primary` with `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary` across 9 form/input components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | new-team-form, claim-form, edit-group-form, new-group-form, datetime-picker, user-picker, edit-event-form, guest-signup-form, new-event-form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-05-17 | P2: New-tab link affordance                                                                                                                           | Added `sr-only "(opens in new tab)"` to the "Open in map ↗" link on event page. Other instances (share-link, profile/billing) still pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Verification: `pnpm typecheck && pnpm lint && pnpm build` — all green.

## Still open

- **P1 partial:** Mobile menu focus trap (first/last focusable cycling Tab/Shift+Tab) — Escape + return-focus shipped, full trap deferred. ✅ Resolved 2026-05-22 (Bundle 2).
- **P2:** Address autocomplete combobox ARIA (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`; listbox + options). ✅ Resolved 2026-05-23 (Bundle 43).
- **P2:** User picker combobox ARIA + replace 120 ms blur timeout with `relatedTarget`/click-outside pattern. ✅ Resolved 2026-05-23 (Bundle 43).
- **P2:** Datetime picker `aria-expanded`, Escape handler, return-focus to trigger. ✅ Resolved 2026-05-23 (Bundle 42).
- **P2:** `FieldError` → `aria-describedby` + `aria-invalid` wiring across all forms. ✅ Resolved 2026-05-23 (Bundle 41): all 6 `useFormState` forms migrated to the shared `FieldError` + `fieldA11y` primitive.
- **P2:** `confirm-submit-button` add `aria-modal="true"`. ✅ Resolved 2026-05-23 (Bundle 42).
- **P2:** Toast close button per-variant focus ring contrast. ✅ Resolved 2026-05-23 (Bundle 44).
- **P2:** Remaining "(opens in new tab)" cues on share-link and profile/billing arrow links. ✅ Resolved 2026-05-23 (Bundle 42).
- **All P3** items (placeholder-as-label, icon-only button hit-areas, heading sweep). ✅ Resolved 2026-05-23 (Bundle 50).
- **Open questions** above — shared `Combobox` primitive, end-to-end AT testing, accessibility statement page, theme-token contrast verification.
