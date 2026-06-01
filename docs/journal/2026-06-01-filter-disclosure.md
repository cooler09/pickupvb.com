# Filter-chrome consolidation (F-11) (2026-06-01)

## Context

Closes **F-11** in [find-events-ux.md](../audits/find-events-ux.md) — the last
open finding on the events listing page. Four stacked strips (header → tabs +
location row → filter card → chips) pushed the first result well down the page,
especially on mobile. The filter form now collapses behind a single
"Filters (N)" trigger, with the active-filter chips staying visible as the
summary.

## Decisions

- **Disclosure, not a modal.** A modal/drawer would be a redesign of the
  apply/close flow and a bigger mobile bet. A native `<details>` disclosure is
  the lowest-risk move: it hides the chrome by default, keeps the existing
  auto-apply form exactly as-is, and — being native — **preserves the no-JS
  path** (the summary toggles and the Apply button submits without any client
  JS). This is the option the audit's own fix note led with.
- **Native `<details>`, uncontrolled (default closed).** No `open` prop, so the
  open state lives in the DOM. That matters with auto-apply: opening the panel,
  changing a select fires `router.push` (soft nav) → the page re-renders, but
  React preserves the `<details>` node, so it **stays open across a filtering
  session**. Setting `open` declaratively would fight the user (a re-render
  after apply would force it back to the prop value). Default-closed is fine
  because the chips below carry the active-filter state.
- **Count mirrors the chips, computed in the page.** `activeFilterCount` counts
  the same eight inputs the chips render (price gated to non-Following, sort
  excluded — it's ordering, not filtering), so the badge never disagrees with
  the chips.
- **Named Tailwind group to stop nested-`group` leakage.** The form already has
  an inner unnamed `group` "More filters" `<details>` whose children use
  `group-open:`. An unnamed outer group would make those children react to the
  _outer_ open state (Tailwind's `group-open:` matches any ancestor `.group`).
  Naming the outer group `group/panel` (and the chevron `group-open/panel:`)
  scopes them independently — the element carries the literal `group/panel`
  class, not `.group`, so the inner `group-open:` selector can't match it.

## Changes

- [page.tsx](../../apps/web/src/app/events/page.tsx) — `activeFilterCount`; wrap
  `<EventFilterForm>` in a `<details className="group/panel">` with a
  `secondaryButtonClass` "Filters (N)" summary (funnel icon + count badge +
  rotating chevron). Chips remain in their existing position below.

(No domain/infra/test changes — pure page composition.)

## Patterns observed

- **Nested native `<details>` + Tailwind groups → always name the outer group.**
  Any time a `group`-based disclosure wraps another `group` disclosure, the
  outer must be a named group or its open state bleeds into the inner one's
  `group-*` utilities. Worth remembering wherever the `<details className="group">`
  pattern nests.

## Follow-ups

- This closes the find-events UX audit — **no open findings** remain. The only
  carry-over is the F-4 note (project the primary division's price onto
  `FollowingFeedItem` so the price chip + filter work on the Following tab);
  it's small and tracked there. Re-audit if the page changes materially.
