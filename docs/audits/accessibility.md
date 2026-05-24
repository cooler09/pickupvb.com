# Accessibility audit — 2026-05-17

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
> [Bundle 41 journal](../journal/2026-05-23-bundle-41.md).

> **Status update (2026-05-23, Bundle 42):** Three small P2 a11y wins
> bundled together: (1) datetime picker now closes on Escape and returns
> focus to its trigger; (2) `confirm-submit-button`'s native `<dialog>`
> sets `aria-modal="true"`; (3) `OpenInNewTabButton` and the external
> `QuickShareButton` variant in `share-link.tsx` now append an
> `sr-only "(opens in new tab)"` cue, closing the remaining new-tab
> link affordance gap on billing/share surfaces. All three P2 entries
> ✅. See [remediation log](#remediation-log) and the
> [Bundle 42 journal](../journal/2026-05-23-bundle-42.md).

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
>   [Bundle 43 journal](../journal/2026-05-23-bundle-43.md).

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
> remain. See [Bundle 50 journal](../journal/2026-05-23-bundle-50.md).

> **Status update (2026-05-23, Bundle 44):** Last accessibility P2
> closed. Toast close button now uses a per-variant `focus-visible`
> ring (red-700 / emerald-700 / amber-800 / primary, each with a
> matching `ring-offset-<variant-bg>`) instead of the inherited
> `focus:ring-current`, which previously dropped below 3:1 contrast on
> info/warning surfaces. With this in, **every P1 and P2 in the
> accessibility audit is resolved** — only the P3 backlog and the
> open questions remain. See [remediation log](#remediation-log) and
> the [Bundle 44 journal](../journal/2026-05-23-bundle-44.md).

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

| Date       | Finding                                                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Files                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-23 | P3: Placeholder-as-label + icon-only hit-areas + heading sweep    | Bundle 50 — closes the P3 cluster. **Placeholder-as-label:** the only `DateTimePicker` callsite without a programmatic label was [event-advanced-details-panel.tsx](../../apps/web/src/components/event-advanced-details-panel.tsx#L121) (registration-close field) — added `htmlFor="registrationClosesAt"` on the `<label>` so SR users hear the field name on focus. All other `DateTimePicker` uses (community new/edit, event new/edit, all using `startsAt`/`endsAt`) already had matching `htmlFor`. `AddressAutocomplete` was verified-stale: it already carries `aria-label="Search for an address or venue"` from Bundle 43. **Icon-only hit-areas:** verified-stale — `alert.tsx` has no close button (the L66 `h-4 w-4` SVG is the decorative variant icon, `aria-hidden`); `mobile-menu.tsx` trigger is `h-11 w-11` since Bundle 2. **Heading sweep:** `grep -rn '<h[1-6]'` across `apps/web/src/app/**/page.tsx` returned 74 `h1` / 153 `h2` / 12 `h3` / zero `h4`-`h6` with no skips; the two pages without a local `h1` (`groups/[id]/page.tsx`, `events/[id]/page.tsx`) emit it from a `_components/` child (`group-header.tsx`, `event-hero.tsx`). | [event-advanced-details-panel.tsx](../../apps/web/src/components/event-advanced-details-panel.tsx)                                                                                                                                                                                                                                                                             |
| 2026-05-23 | P2: Toast close button focus-ring contrast                        | Bundle 44 — replaced the inherited `focus:ring-current focus:ring-offset-transparent` on the toast close button with a per-variant `focus-visible` ring map (`VARIANT_RING_CLASSES`): error→red-700 / dark red-200, success→emerald-700 / dark emerald-200, warning→amber-800 / dark amber-200, info→primary. Each entry also pins `ring-offset-<variant-bg>` so the ring reads as a solid 2 px outline against the toast surface rather than bleeding into the page. Closes the last open P2 in the accessibility audit. See [Bundle 44 journal](../journal/2026-05-23-bundle-44.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [toast.tsx](../../apps/web/src/components/toast.tsx)                                                                                                                                                                                                                                                                                                                           |
| 2026-05-23 | P2: Combobox ARIA on address + user pickers                       | Bundle 43 — `UserPicker` migrated to the WAI-ARIA combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant` keyed on a new `activeIdx`; arrow-key + Enter + Escape navigation; click-outside ref effect replacing the 120 ms blur timeout. Status (Searching… / No matches / N matches) moved into an `aria-live="polite"` sr-only region so the listbox contains only options. `AddressAutocomplete` already had `role="combobox"` + `aria-expanded` + listbox/option roles; added the missing `aria-activedescendant` and parity `aria-live` status region. See [Bundle 43 journal](../journal/2026-05-23-bundle-43.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [user-picker.tsx](../../apps/web/src/components/user-picker.tsx), [address-autocomplete.tsx](../../apps/web/src/components/address-autocomplete.tsx)                                                                                                                                                                                                                           |
| 2026-05-23 | P2: a11y quick-wins II (datetime / confirm-dialog / new-tab cues) | Bundle 42 — datetime picker now closes on Escape and returns focus to its trigger via a new `triggerRef` + document `keydown` effect; the Done button uses the same close-and-refocus helper. `confirm-submit-button`'s native `<dialog>` sets `aria-modal="true"`. `OpenInNewTabButton` appends `sr-only "(opens in new tab)"` after children so every billing/Stripe-dashboard button announces correctly. `QuickShareButton` in `share-link.tsx` does the same when `external` is set, covering the WhatsApp/X grid items. See [Bundle 42 journal](../journal/2026-05-23-bundle-42.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [datetime-picker.tsx](../../apps/web/src/components/datetime-picker.tsx), [confirm-submit-button.tsx](../../apps/web/src/components/confirm-submit-button.tsx), [open-in-new-tab-button.tsx](../../apps/web/src/components/open-in-new-tab-button.tsx), [share-link.tsx](../../apps/web/src/components/share-link.tsx)                                                         |
| 2026-05-23 | P2: `FieldError` aria wiring (complete)                           | Bundle 41 — migrated the remaining 4 forms to the shared `FieldError` + `fieldA11y` primitive. Deleted each form's local shadowing `FieldError` declaration + `errorClass` constant. All inputs with matching `<FieldError>` now spread `{...fieldA11y(name, state.fieldErrors)}` so screen readers get `aria-invalid` + `aria-describedby`. See [Bundle 41 journal](../journal/2026-05-23-bundle-41.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [new-event-form.tsx](../../apps/web/src/app/events/new/new-event-form.tsx), [edit-event-form.tsx](../../apps/web/src/app/events/[id]/edit/edit-event-form.tsx), [community-listing-form.tsx](../../apps/web/src/app/community/new/community-listing-form.tsx), [community-listing-edit-form.tsx](../../apps/web/src/app/community/[slug]/edit/community-listing-edit-form.tsx) |
| 2026-05-22 | P1: Mobile menu focus trap                                        | Added `role="dialog" aria-modal="true" aria-label="Main menu"` to drawer; focuses first focusable on open; Tab/Shift+Tab cycle via `FOCUSABLE` selector. Pathname-change effect now ref-guarded. See [Bundle 2 journal](../journal/2026-05-22-bundle-2.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)                                                                                                                                                                                                                                                                                                               |
| 2026-05-22 | P2: `FieldError` aria wiring (partial)                            | Extracted shared `FieldError` + `fieldA11y(name, errors)` helper that returns `{ 'aria-invalid', 'aria-describedby' }`. Migrated 2 of 6 forms. Remaining 4 tracked as follow-up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | new: [field-error.tsx](../../apps/web/src/components/field-error.tsx); migrated: [teams/new/new-team-form.tsx](../../apps/web/src/app/teams/new/new-team-form.tsx), [groups/new/new-group-form.tsx](../../apps/web/src/app/groups/new/new-group-form.tsx)                                                                                                                      |
| 2026-05-17 | P1: Tables missing `scope`                                        | Added `scope="col"` to every `<th>` in receipts, earnings (main + monthly), pricing comparison, and receipt-detail tables (board-view already had it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx), [earnings/page.tsx](../../apps/web/src/app/profile/billing/earnings/page.tsx), [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx), [receipts/[paymentIntentId]/page.tsx](../../apps/web/src/app/profile/receipts/[paymentIntentId]/page.tsx)                                                   |
| 2026-05-17 | P1: Notification popover Escape                                   | Verified: existing `useEffect` already registers a document-level `keydown` handler that calls `setOpen(false)` on Escape. No code change needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)                                                                                                                                                                                                                                                                                                   |
| 2026-05-17 | P1: Mobile menu Escape + return focus                             | Added `useRef` on trigger button; added `keydown` listener that closes drawer + returns focus to trigger on Escape. **Focus trap deferred** (cycling Tab/Shift+Tab through first/last focusable still pending).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)                                                                                                                                                                                                                                                                                                               |
| 2026-05-17 | P1: Leaflet map missing accessible name                           | Added `aria-label="Map showing <title> at <addressLine>"` to `<MapContainer>`. Textual address already rendered above the map on the event page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [event-map.tsx](../../apps/web/src/components/event-map.tsx)                                                                                                                                                                                                                                                                                                                   |
| 2026-05-17 | P2: Tap target size                                               | Bumped mobile-menu trigger `h-10 w-10` → `h-11 w-11`; notification-bell trigger `h-9 w-9` → `h-11 w-11`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx), [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)                                                                                                                                                                                                                                 |
| 2026-05-17 | P2: Focus-ring contrast                                           | Replaced `focus:outline-none focus:ring-1 focus:ring-primary` with `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary` across 9 form/input components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | new-team-form, claim-form, edit-group-form, new-group-form, datetime-picker, user-picker, edit-event-form, guest-signup-form, new-event-form                                                                                                                                                                                                                                   |
| 2026-05-17 | P2: New-tab link affordance                                       | Added `sr-only "(opens in new tab)"` to the "Open in map ↗" link on event page. Other instances (share-link, profile/billing) still pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx)                                                                                                                                                                                                                                                                                                            |

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
