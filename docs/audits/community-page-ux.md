# Community page UX audit

_Last updated: 2026-06-10_

UX/UI evaluation of the **community-listings surface** — the directory
([apps/web/src/app/community/page.tsx](../../apps/web/src/app/community/page.tsx)),
the detail page
([community/[slug]/page.tsx](../../apps/web/src/app/community/[slug]/page.tsx)

- its client viewer-chrome islands), and the submit / edit forms. Community
  listings are the off-platform discovery surface: any signed-in real user can
  post an external volleyball event (Facebook / Meetup / Eventbrite link) so
  others in their area can find it; organizers can later **claim** a listing to
  redirect it to their on-platform event.

Goal: same lens as the sibling directory audits — close broken/misleading
feedback, converge the page with its siblings, and trim duplication. **This file
is the UX complement to — not a duplicate of:**

- [community-listings.md](community-listings.md) — the full-stack **feature**
  audit (visibility leak, claim redirect, JSON-LD XSS, geo search, pagination,
  auto-approve cron). All 14 of its findings (CL-1…CL-14) were resolved
  2026-06-05; the items below are **new UX findings** that pass left untouched.
- [persona-ux.md](persona-ux.md) — CTA/field vocabulary; CU-10 is the same CC-2
  field-vocab drift.
- [m3-alignment.md](m3-alignment.md) — `rounded-md` / `bg-highlight` on this
  page are the audit's deferred decorative items, **out of scope here.**

> **Status (2026-06-10): ✅ initial UX audit fully remediated — 0 P1 · 3 P2 ·
> 7 P3, all 10 fixed quad-green (uncommitted).**
>
> Bundle 1 (feedback/stale): **CU-1** the `submitted` flash now renders a real
> success banner; **CU-2** Delete uses a `ConfirmSubmitButton` modal (the
> misleading "Something went wrong" path is gone); **CU-3** the dead `claimed`
> notice code is deleted; **CU-8** the report-reason select got an `aria-label`.
> Bundle 2 (consolidation): **CU-5** the submit + edit forms now share one
> `CommunityListingFields` body + `CommunityListingFormFooter` and one
> `parseCommunityListingForm` helper — the submit form gained the edit form's
> card layout, progressive address disclosure, and sticky mobile CTA, and
> **CU-4** (`new Date()` in render) is resolved via a lazy `useState` floor.
> Bundle 3 (directory + detail polish): **CU-7** result count in the heading;
> **CU-6** a "Clear filters" affordance (next to the form + in the filtered
> empty states) — auto-submit was deliberately **not** added, to stay consistent
> with `/players` `/groups` `/teams`, which all keep an explicit submit button;
> **CU-10** the filter selects moved onto `fieldInputClass`; **CU-9** the
> signed-in action panel now reserves space via a skeleton (new `authed-loading`
> phase so the anonymous majority never see a flash). See the remediation log.

---

## P2 — schedule next sprint

### CU-1 · Submitting a listing shows no confirmation (the `submitted` flash renders nothing)

The create action redirects to the new listing with a success flash —
`redirect(\`/community/${result.slug}?notice=submitted\`)`([new/actions.ts#L135](../../apps/web/src/app/community/new/actions.ts#L135)) —
but`CommunityNoticeBanner`'s message map has **no `submitted`key**
([community-notice-banner.tsx#L8-L40](../../apps/web/src/app/community/[slug]/_components/community-notice-banner.tsx#L8-L40)),
so`if (!m) return null` swallows it. A user who just completed the **primary
funnel action** lands on their listing with zero acknowledgement. (`grep`for`notice=submitted`confirms the redirect is the only producer and nothing
consumes it.) The listing itself does render (it's`active`), so it's degraded
feedback rather than a broken submit — but it's the moment that most deserves a
confirmation.

**Fix:** add a `submitted` entry (tone `ok`) to the message map, e.g. _"Listing
submitted — it's live now. Thanks for helping the community find this event."_
Consider echoing the one-line "may be hidden after multiple reports" caveat the
new-listing page already shows.

### CU-2 · Forgetting the Delete "Confirm" checkbox shows a misleading system error

`ManageSection` renders Delete as an inline `confirm` checkbox + submit button
([community-action-sections.tsx#L213-L222](../../apps/web/src/app/community/[slug]/_components/community-action-sections.tsx#L213-L222)).
If the manager clicks **Delete** without ticking Confirm,
`deleteListingFromForm` does `if (field(formData,'confirm') !== 'on') back(slug,
'error')`
([listing-actions.ts#L155-L163](../../apps/web/src/app/community/[slug]/listing-actions.ts#L155-L163)),
which renders the `error` banner — _"Something went wrong. Please try again."_
On a destructive action that's actively misleading: nothing went wrong, the user
just didn't confirm, and "try again" invites them to re-click the same broken
path. The checkbox is also easy to miss next to the button.

**Fix:** prefer the repo's Radix `ConfirmDialog` (added in the messages-page-UX
bundle — see [messages-page-ux.md](messages-page-ux.md) MU `ConfirmDialog`) so
Delete opens a real confirm modal instead of a same-line checkbox. Minimum: gate
the submit button `disabled` on the checkbox (client), or add a dedicated
`notconfirmed` notice code with copy like _"Tick the box to confirm deletion."_

### CU-5 · The submit form has diverged from — and is less polished than — the edit form, with ~400 lines duplicated

The two forms render the same fields but have drifted, and the **higher-traffic
first-touch (submit) form is the worse one**:

|                | Submit ([community-listing-form.tsx](../../apps/web/src/app/community/new/community-listing-form.tsx)) | Edit ([community-listing-edit-form.tsx](../../apps/web/src/app/community/[slug]/edit/community-listing-edit-form.tsx))                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Address fields | All 6 shown at once (Search, Street, City, Region, Postal, Country)                                    | Progressive: "Add city, state, postal, country" reveals the extras ([#L219-L226](../../apps/web/src/app/community/[slug]/edit/community-listing-edit-form.tsx#L219-L226)) |
| Layout         | Bare `<fieldset>`/`<legend>`                                                                           | Card-per-section (`cardClass`)                                                                                                                                            |
| Mobile CTA     | Static footer                                                                                          | Sticky bottom action bar ([#L353](../../apps/web/src/app/community/[slug]/edit/community-listing-edit-form.tsx#L353))                                                     |

A first-time submitter is dropped into the most overwhelming version of the
form. On top of the UX gap, the duplication is large and drift-prone: the two
**actions** repeat ~60 lines of identical geocode/location-assembly + parse
logic ([new/actions.ts#L36-L99](../../apps/web/src/app/community/new/actions.ts#L36-L99)
≈ [edit/actions.ts#L37-L100](../../apps/web/src/app/community/[slug]/edit/actions.ts#L37-L100)),
and the two form components repeat ~250 lines of field JSX.

**Fix:** extract a shared `CommunityListingFields` form body (the edit form's
progressive-disclosure + card layout is the better baseline — adopt it for
submit) and a shared `parseCommunityListingForm(formData)` helper used by both
actions. Bring submit up to edit's interaction model.

---

## P3 — opportunistic

### CU-3 · Dead `claimed` notice code

`CommunityNoticeBanner` still maps `claimed` → _"Listing claimed and linked to
your event."_
([community-notice-banner.tsx#L17-L20](../../apps/web/src/app/community/[slug]/_components/community-notice-banner.tsx#L17-L20)),
but since claims became a two-step **pending** flow (CL-4), no action emits
`notice=claimed` — the claim path now produces `claimproposed` → `claimapproved`
(`grep` for `notice=claimed` / `back(slug, 'claimed')` returns zero producers).
The dead entry implies a one-click claim that no longer exists.

**Fix:** delete the `claimed` entry.

### CU-4 · `new Date()` called in the submit form's render body (React Compiler purity)

The submit form passes `minDate={new Date()}` and `minDate={startsAt ?? new
Date()}` directly in render
([community-listing-form.tsx#L139](../../apps/web/src/app/community/new/community-listing-form.tsx#L139),
[#L152](../../apps/web/src/app/community/new/community-listing-form.tsx#L152)) —
the exact impure-read-in-render anti-pattern from AGENTS pattern #4. (The edit
form avoids it: it only passes `minDate` from `startsAt` state,
[#L196](../../apps/web/src/app/community/[slug]/edit/community-listing-edit-form.tsx#L196).)

**Fix:** hoist a single `const now = useMemo(() => new Date(), [])` (or compute
the floor once) and reuse it for both pickers.

### CU-6 · Filter selects need an explicit "Apply"; no "Clear filters"

Tabs (Upcoming/Past) and the location controls navigate **on click**, but
surface/format/skill live in a GET `<form>` that only applies via the **Apply**
button
([page.tsx#L193-L263](../../apps/web/src/app/community/page.tsx#L193-L263)) — two
interaction models on one page. A user who changes "Surface → Sand" and scrolls
expects the grid to update; it won't until they find Apply. There's also **no
reset** once filters are set (you must set each back to "Any" and Apply).

**Fix:** either auto-submit the selects on change (client filter-row island, as
`/players` and `/find-events` do) or add a "Clear filters" link that renders
when any of surface/format/skill is active.

### CU-7 · No result count on the directory

The `/community` heading is a bare "Community listings"
([page.tsx#L146](../../apps/web/src/app/community/page.tsx#L146)) with no `(N)`,
unlike the sibling directories (`/players` · `/groups` · `/teams` all show a
count — pattern #12). `total` is already computed for `Pagination`
([page.tsx#L121](../../apps/web/src/app/community/page.tsx#L121)).

**Fix:** surface the count (e.g. _"Community listings · 37 upcoming"_), labelling
the FETCH_CAP ceiling as "120+" so a windowed count doesn't read as exact.

### CU-8 · Report-reason `<select>` has no accessible label

In `ReportSection` the reason dropdown
([community-action-sections.tsx#L168-L177](../../apps/web/src/app/community/[slug]/_components/community-action-sections.tsx#L168-L177))
relies on the nearby "See a problem?" heading for meaning but carries no
`<label>` / `aria-label`, so assistive tech announces an unlabelled combobox
with a bare "Spam or misleading" value.

**Fix:** add `aria-label="Reason for report"` (or a visually-hidden `<label
htmlFor>`).

### CU-9 · Manager/claim/report panels pop in with no reserved space

The detail article is server-rendered (good — no body jump), but the
claim/report/**manage** strip resolves in a client island after
`auth.getUser()` + a `getCommunityViewerChrome` round-trip
([community-viewer-chrome.tsx#L40-L62](../../apps/web/src/app/community/[slug]/_components/community-viewer-chrome.tsx#L40-L62))
— the ISR-cacheable design (CL-12 / performance P2 #16). During `phase:
'loading'` the components render `null`
([#L91](../../apps/web/src/app/community/[slug]/_components/community-viewer-chrome.tsx#L91),
[#L118](../../apps/web/src/app/community/[slug]/_components/community-viewer-chrome.tsx#L118)),
so for a signed-in manager the action panel appears a beat after paint with a
layout shift.

**Fix:** render a low-profile skeleton / reserved-height placeholder for the
loading phase so the strip doesn't shift in. Low severity (the article never
jumps; only the bottom action strip does).

### CU-10 · List-page filter selects bypass the field vocabulary

The three directory filter `<select>`s hand-roll
`border-border-base mt-1 w-full rounded-md border px-2 py-1.5`
([page.tsx#L214](../../apps/web/src/app/community/page.tsx#L214),
[#L231](../../apps/web/src/app/community/page.tsx#L231),
[#L248](../../apps/web/src/app/community/page.tsx#L248)) instead of
`fieldInputClass` (pattern #11). They dodge the `no-restricted-syntax` ratchet
because they're inline literals, but they drift from the shared focus-ring /
dark-mode chassis the submit/edit forms already use.

**Fix:** route through `fieldInputClass` (or a compact filter-select variant with
the documented `eslint-disable` opt-out if a smaller control is wanted).

---

## What's solid (don't regress)

- **Cookie-free ISR shell** on both list and detail — the viewer-conditional
  chrome resolves in client islands so the public render is CDN-cacheable
  (CL-12 / perf P2 #16). Keep new server-side reads off `cookies()`/`searchParams`.
- **`?notice=` flash banners are read client-side** via `useSearchParams` in a
  Suspense boundary so the route stays static — the CU-1 fix is a one-line map
  entry, not a server-side `searchParams` read.
- **Submitter recovery for auto-hidden listings** — `<MyHiddenCommunityListings>`
  is the only in-app path back to a listing the report trigger hid (no
  notification), correctly resolved in a client island.
- **Claim guidance is genuinely good** — the two-step empty state, the day+city
  eligibility filter on the event dropdown, and the "awaiting review" banner all
  set correct expectations.
- **Forms use the field/CTA vocabulary, `useAlertReveal`, and `FieldError`**
  (the CU-10 directory selects are the one exception).

---

## Remediation log

### 2026-06-10 — feedback/stale + form consolidation (quad-green, uncommitted)

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass (lint: 0 errors;
the 3 standing warnings are the unrelated scoreboard-remote effect).

- **CU-1** — added a `submitted` entry to the notice-banner message map
  ([community-notice-banner.tsx](../../apps/web/src/app/community/[slug]/_components/community-notice-banner.tsx)),
  so the post-submit redirect finally shows a success banner.
- **CU-2** — Delete in `ManageSection` now uses `ConfirmSubmitButton` (a focus-
  trapped confirm modal) with a hidden `confirm=on` input that keeps the server
  action's defensive guard satisfied; the misleading "Something went wrong"
  no-confirm path is unreachable from the UI
  ([community-action-sections.tsx](../../apps/web/src/app/community/[slug]/_components/community-action-sections.tsx)).
- **CU-3** — removed the dead `claimed` notice entry (no producer since the
  two-step pending-claim flow).
- **CU-8** — `aria-label="Reason for report"` on the report-reason select.
- **CU-5 + CU-4** — extracted a shared `parseCommunityListingForm` helper
  ([\_lib/parse-community-listing-form.ts](../../apps/web/src/app/community/_lib/parse-community-listing-form.ts))
  used by both actions, and a shared `CommunityListingFields` body +
  `CommunityListingFormFooter`
  ([\_components/community-listing-fields.tsx](../../apps/web/src/app/community/_components/community-listing-fields.tsx))
  used by both forms. The submit form adopts the edit form's card layout,
  progressive address disclosure, and sticky mobile CTA; `new Date()` no longer
  runs in a render body (lazy `useState(() => new Date())` floor, gated by a
  `floorStartToToday` prop so edit still allows past-dated edits). Net: the two
  form components dropped from ~300/~360 LOC to ~33/~40, and the two actions from
  ~136/~142 to ~50 each.

### 2026-06-10 (later) — directory + detail polish (quad-green, uncommitted)

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass.

- **CU-7** — the `/community` heading now carries a count
  (`Community listings · {total}`, rendered `120+` at the fetch-window ceiling),
  matching `/players` ([page.tsx](../../apps/web/src/app/community/page.tsx)).
- **CU-6** — a "Clear filters" link renders next to the filter form and inside
  the filtered (non-location) empty states when any of surface/format/skill is
  active; it drops the three dropdowns but preserves the tab + any active
  location (which keeps its own "Clear location"). Auto-submit was **not**
  added — `/players` `/groups` `/teams` all keep an explicit submit button, so a
  community-only auto-submit would be the inconsistency, not the fix.
- **CU-10** — the three filter `<select>`s now use `fieldInputClass`; the Apply
  button moved from a hand-tuned `h-[34px]` to the standard `primaryButtonClass('md')`
  to match the taller fields (also clears a stale canonical-class lint hint).
- **CU-9** — `CommunityViewerProvider` gained an `authed-loading` phase (set once
  a real session is confirmed, before the chrome server action resolves);
  `CommunityViewerActions` renders an `ActionPanelSkeleton` during it, and
  `CommunityRestrictedView` waits it out so it can't flash "not available". The
  anonymous majority resolve straight to `anon` and never see the skeleton
  ([community-viewer-chrome.tsx](../../apps/web/src/app/community/[slug]/_components/community-viewer-chrome.tsx)).

**All 10 findings (CU-1…CU-10) resolved.**
