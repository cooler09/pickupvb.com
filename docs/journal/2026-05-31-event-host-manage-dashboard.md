# Consolidate event host tools into a `/manage` dashboard (2026-05-31)

## Context

User feedback: the way host tools were structured on the event detail page
felt cluttered and unclear. An audit of the page confirmed it — host
affordances were **8 fragments across 5 visual languages** with no shared
home:

- Hero top-right faint **Edit** text link.
- Off-platform upsell banner.
- Mid-page **Bracket** / **Schedule** cards (shown to everyone but written
  in host voice — "Set up the bracket and report results").
- **Co-host** add/remove inline inside the "Hosted by" credit.
- A single collapsed `<details>` labeled just **"Host tools"** holding
  divisions, broadcast, ad-hoc registrations, winners, and league teams.
- **Export CSV** as a tiny text link under the roster.
- **Manage payments** buttons inline in attendee rows.
- **Cancel event** buried on the `/edit` page.

Two specific smells: the "Host tools" `<details>` was an unlabeled junk
drawer with no information scent (and a nested `<details>` inside it for
broadcast), and nothing conveyed event _phase_ — setup, day-of, and
wrap-up tasks were all jumbled together.

User chose, from three mocked options, a **dedicated host dashboard** at
`/events/[id]/manage`, with the **pragmatic-hybrid** scope (genuinely
contextual affordances stay inline).

## Decisions

- **Chose a dedicated `/manage` sub-page over an inline grouped panel or a
  sticky host bar.** It matches the repo's existing host sub-page pattern
  (`bracket`, `schedule`, `edit`, `media` are already sub-pages) and keeps
  the public event page a clean attendee-facing read.
- **Chose pragmatic-hybrid over purist full-separation.** Per-row "mark
  paid" stays in the roster (you act on the player right where you see
  them), the "Hosted by" credit chips stay (read-only) for everyone, and
  the Bracket/Schedule cards stay as public spectator entry points
  (reworded to neutral voice). Everything else moved to `/manage`.
- **Reused `loadEventDetail` for the manage page instead of a new lean
  loader.** It already runs every host side-load gated on `canManage`
  (`adHocHostRows`, `eligibleTeamsByDivision`, `leagueTeamsByDivision`,
  `payments`) and the caches are shared with the public page. A bespoke
  loader would be premature optimization.
- **`notFound()` (not `redirect`) for non-managers** so a private event's
  existence stays opaque, matching the rest of the codebase's fail-safe
  posture.
- **`force-dynamic` is correct here.** The "no force-dynamic on public
  pages" pitfall is about CDN-cached marketing pages; `/manage` is
  host-only and viewer-dependent (`canManage`), so it must not be cached
  and must be `noindex`.
- **Derived `paidAttendeeCount` for the cancel panel from the existing
  `payments` map** rather than re-running the edit page's admin
  `count: 'exact'` query — same numbers, one fewer round-trip.
- **Added `showCoHostControls` to `HostsSection`** (default `true`) instead
  of forking the component. Public page passes `false` (display-only); the
  manage dashboard renders it with controls.
- **`returnPath` for every panel is `/events/[id]/manage`** so their
  `revalidatePath` refreshes this surface; their `updateTag(eventCacheTag)`
  already busts the public page's cached side-loads, and the public page is
  dynamic so it's always fresh on next view.

## Changes

- **New** `apps/web/src/app/events/[id]/manage/page.tsx` — host-only,
  UUID-guarded, `force-dynamic`, `robots: noindex`. Gates on `canManage`.
- **New** `apps/web/src/app/events/[id]/manage/_components/manage-dashboard.tsx`
  — phase-grouped composition (**Setup** → **Run the event** → **Wrap up**
  → **Danger zone**) reusing the existing host panels; groups render only
  when they have visible content. Local `ManageGroup` + `ManageLinkCard`
  helpers.
- `_components/host-tools-section.tsx` — **deleted** (the junk drawer; its
  panels now live in the dashboard).
- `page.tsx` — dropped `HostToolsSection`; added the host **"Manage event"**
  entry strip under the back-link; reworded Bracket/Schedule cards to
  viewer-neutral voice; `HostsSection` now `showCoHostControls={false}`;
  removed the CSV `viewerIsPro` prop pass-through; pruned now-unused
  destructured vars.
- `_components/event-hero.tsx` — removed the `canManage` prop + the faint
  hero "Edit" link (Edit now reached from `/manage`).
- `_components/hosts-section.tsx` — added `showCoHostControls` prop.
- `_components/attendees-panel.tsx` — removed the CSV-export block + the
  `viewerIsPro` prop (moved to the dashboard's Wrap-up group).
- `edit/page.tsx` — removed the `CancelEventPanel` render + its
  `paidAttendeeCount` admin query (panel now rendered from the dashboard's
  Danger zone; the `edit/cancel-event-panel.tsx` + `cancel-actions.ts`
  files stay put and are imported cross-route).

## Patterns observed

- **`showCoHostControls`-style display/manage split.** When a
  display-and-manage component needs a read-only variant after a host
  surface is extracted, add a boolean prop defaulting to the existing
  behaviour rather than forking — the single call-site cost is one prop.
- **Reusing a heavy page loader for a sibling host route is fine when the
  side-loads are already permission-gated and cache-shared.** No need to
  invent a lean loader; the `unstable_cache` tags dedupe across the two
  pages.
- A **dedicated host sub-page is the established home for host workflows**
  in this repo (bracket/schedule/edit/media). New host tooling should land
  on `/manage` (or its own sub-page), not as another inline section on the
  public event page.

## Follow-ups

- **Cross-route component location.** `CancelEventPanel` + `cancel-actions`
  still live under `edit/`; they're now consumed by `/manage`. Left in
  place to avoid churn — could move under `manage/` (or a shared
  `_components/`) in a later pass if more cancel-adjacent tooling lands.
- **E2E coverage.** No Playwright spec exercises `/manage` yet. Add a host
  journey (open `/manage` → edit, message, record a winner, cancel) when
  the e2e host-onboarding suite is next touched — see the e2e coverage game
  plan in memory.
- **Off-platform upsell banner** still renders on the public page for
  hosts; could fold into the dashboard later, but it's a one-time nudge so
  it was left in the host's primary read path intentionally.
