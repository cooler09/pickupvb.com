# Accessibility audit — 2026-05-17

> **Status (2026-05-17):** Quick-win bundle landed. P1 #1 (map aria-label + address fallback), #2 (notification popover Escape — already in place), #3 partial (mobile menu Escape + return-focus; full focus trap deferred), #4 (table `scope="col"`), and P2 #1 (tap targets), #5 (focus rings) are ✅. Rest open. See **Remediation log** and **Still open** below.

> **Status update (2026-05-22):** No new accessibility shipments or
> regressions this pass. Still-open list unchanged.

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

## Remediation log

| Date       | Finding                                 | Change                                                                                                                                                                                                          | Files                                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-17 | P1: Tables missing `scope`              | Added `scope="col"` to every `<th>` in receipts, earnings (main + monthly), pricing comparison, and receipt-detail tables (board-view already had it).                                                          | [receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx), [earnings/page.tsx](../../apps/web/src/app/profile/billing/earnings/page.tsx), [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx), [receipts/[paymentIntentId]/page.tsx](../../apps/web/src/app/profile/receipts/[paymentIntentId]/page.tsx) |
| 2026-05-17 | P1: Notification popover Escape         | Verified: existing `useEffect` already registers a document-level `keydown` handler that calls `setOpen(false)` on Escape. No code change needed.                                                               | [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)                                                                                                                                                                                                                                                 |
| 2026-05-17 | P1: Mobile menu Escape + return focus   | Added `useRef` on trigger button; added `keydown` listener that closes drawer + returns focus to trigger on Escape. **Focus trap deferred** (cycling Tab/Shift+Tab through first/last focusable still pending). | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)                                                                                                                                                                                                                                                             |
| 2026-05-17 | P1: Leaflet map missing accessible name | Added `aria-label="Map showing <title> at <addressLine>"` to `<MapContainer>`. Textual address already rendered above the map on the event page.                                                                | [event-map.tsx](../../apps/web/src/components/event-map.tsx)                                                                                                                                                                                                                                                                 |
| 2026-05-17 | P2: Tap target size                     | Bumped mobile-menu trigger `h-10 w-10` → `h-11 w-11`; notification-bell trigger `h-9 w-9` → `h-11 w-11`.                                                                                                        | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx), [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)                                                                                                                                                                               |
| 2026-05-17 | P2: Focus-ring contrast                 | Replaced `focus:outline-none focus:ring-1 focus:ring-primary` with `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary` across 9 form/input components.                                | new-team-form, claim-form, edit-group-form, new-group-form, datetime-picker, user-picker, edit-event-form, guest-signup-form, new-event-form                                                                                                                                                                                 |
| 2026-05-17 | P2: New-tab link affordance             | Added `sr-only "(opens in new tab)"` to the "Open in map ↗" link on event page. Other instances (share-link, profile/billing) still pending.                                                                    | [events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx)                                                                                                                                                                                                                                                          |

Verification: `pnpm typecheck && pnpm lint && pnpm build` — all green.

## Still open

- **P1 partial:** Mobile menu focus trap (first/last focusable cycling Tab/Shift+Tab) — Escape + return-focus shipped, full trap deferred.
- **P2:** Address autocomplete combobox ARIA (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`; listbox + options).
- **P2:** User picker combobox ARIA + replace 120 ms blur timeout with `relatedTarget`/click-outside pattern.
- **P2:** Datetime picker `aria-expanded`, Escape handler, return-focus to trigger.
- **P2:** `FieldError` → `aria-describedby` + `aria-invalid` wiring across all forms.
- **P2:** `confirm-submit-button` add `aria-modal="true"`.
- **P2:** Toast close button per-variant focus ring contrast.
- **P2:** Remaining "(opens in new tab)" cues on share-link and profile/billing arrow links.
- **All P3** items (placeholder-as-label, icon-only button hit-areas, heading sweep).
- **Open questions** above — shared `Combobox` primitive, end-to-end AT testing, accessibility statement page, theme-token contrast verification.
