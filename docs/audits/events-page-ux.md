# Events Page UX Audit

_Last updated: 2026-05-28_

Audit of [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx).
Goal: prioritize the most important information and CTAs for visitors landing
from a share link, while keeping the page useful for hosts and attendees.

> **Status:** Quick-win bundle + larger-changes bundle both shipped
> (2026-05-18). Remaining open items live in the "Won't-do / explicit
> deferrals" section.

> **Status update (2026-05-28, Bundle 128):** Walk-in team form converted
> from inline `<details>` to a modal dialog at all three call sites
> (no-bracket / setup-view / host-ad-hoc-teams-panel) to give the host a
> focus-isolated subtask with unambiguous Save/Cancel terminal CTAs.
> Findings + fixes:
>
> 1. **Inline disclosure leaked context for focused subtasks.** The
>    walk-in team form was revealed inline via `<details open={!ready}>`,
>    which (a) pushed the bracket setup / payment table around when
>    opened, (b) let the host accidentally interleave with format
>    selection or seeding, (c) had no clear Cancel CTA — the "secondary
>    becomes primary in a known state" pattern was good but the wrong
>    container. Fix: new
>    [apps/web/src/components/form-modal.tsx](../../apps/web/src/components/form-modal.tsx)
>    primitive built on native `<dialog>` (`aria-modal`, focus trap,
>    Escape-to-close, backdrop scrim). API: `<FormModal trigger={(open) =>
…} title="…" description="…">{(close) => <form>…</form>}</FormModal>`,
>    plus a `<CloseOnSettled onSettled={close} />` helper that watches
>    `useFormStatus().pending` and dismisses on settle. Reuses the
>    established pattern from
>    [report-bug-button.tsx](../../apps/web/src/components/report-bug-button.tsx)
>    - [confirm-submit-button.tsx](../../apps/web/src/components/confirm-submit-button.tsx)
>      instead of pulling in Radix / HeadlessUI.
>
>    Converted call sites:
>    - [bracket/\_components/no-bracket-view.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/no-bracket-view.tsx)
>    - [bracket/\_components/setup-view.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/setup-view.tsx)
>    - [\_components/host-ad-hoc-teams-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/host-ad-hoc-teams-panel.tsx)
>
>    Trigger is promoted to primary fill when the walk-in is the
>    unblocking action (`teamCount < 2` or no teams registered), demoted
>    to dashed-border secondary once registered teams cover the case.
>    [WalkInTeamForm](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/walk-in-team-form.tsx)
>    gained an optional `onSettled` prop — when present it renders the
>    `<CloseOnSettled>` plus a Cancel/Submit footer; when absent it
>    keeps its old standalone styling (no other call sites today, but
>    the prop keeps it composable).
>
> Carry-overs (next UX bundles per the modal-conversion plan):
>
> - **P2** — ✅ **done 2026-06-01f** (via persona-ux.md H-2/CC-5).
>   [host-divisions-manager.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/host-divisions-manager.tsx)
>   per-row Edit + "+ Add division" now open the `DivisionForm` in a
>   `FormModal` (`CloseOnSettled` + `ModalActions`); the `editingId`/`adding`
>   inline state machine is gone. Row actions also moved to
>   `secondaryButtonClass` + `tap-target` with Remove demoted.
> - **P2** — [sponsor-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/edit/sponsor-panel.tsx)
>   editor → `FormModal`. Lets us collapse the awkward "Additional
>   settings" wrapper added in Bundle 127.5 since hero image would be
>   the only inline panel left.
> - **P3** — moderate-strength candidates ([captain-broadcast-panel.tsx](../../apps/web/src/app/teams/%5Bid%5D/_components/captain-broadcast-panel.tsx),
>   [host-division-winners-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/host-division-winners-panel.tsx))
>   — only convert if usage data shows confusion; inline acceptable.

> **Status update (2026-05-27, Bundle 127):** Site-wide CTA-vocabulary
> sweep triggered by a quick UX scan after the bracket creator polish
> (Bundle 127 first half). Findings + fixes:
>
> 1. **Primary-CTA styling had forked.** Two button vocabularies
>    coexisted for the same role — the canonical
>    `rounded-md px-3 py-1.5 text-sm font-semibold hover:opacity-90`
>    used by site-header / share-link, and an older
>    `rounded px-3 py-1 text-sm` (no `-md`, no `font-semibold`, smaller
>    hit target) scattered across the events surface. Fix: extracted
>    [apps/web/src/components/primary-button.tsx](../../apps/web/src/components/primary-button.tsx)
>    (`primaryButtonClass(size?)` helper + thin `<PrimaryButton>`
>    wrapper for the `<button>` case). Two sizes: `'sm'` (default,
>    table-row / list / header CTA) and `'md'` (headline panel CTA).
>    Migrated five divergent sites:
>    [page.tsx#L268](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L268)
>    "Open bracket",
>    [off-platform-upsell.tsx#L42](../../apps/web/src/app/events/%5Bid%5D/_components/off-platform-upsell.tsx#L42)
>    "Switch",
>    [external-registration-card.tsx#L27](../../apps/web/src/app/events/%5Bid%5D/_components/external-registration-card.tsx#L27)
>    "Register on the host's site",
>    [host-division-winners-panel.tsx#L91](../../apps/web/src/app/events/%5Bid%5D/_components/host-division-winners-panel.tsx#L91)
>    "Record winner" (bumped from `text-xs`),
>    [board-view.tsx#L164](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/board-view.tsx#L164)
>    "Generate playoff" (bumped from `text-xs`). Future call sites
>    should `import { primaryButtonClass } from '@/components/primary-button'`
>    instead of hand-rolling — the audit catches drift fast.
> 2. **Empty-state lists shipped muted gray text instead of CTAs.**
>    [/groups](../../apps/web/src/app/groups/page.tsx#L86) and
>    [/teams](../../apps/web/src/app/teams/page.tsx#L126) both rendered
>    `"No X yet — be the first to create one."` as a plain `<p>` with
>    no button. Fix: empty states now render a centered card with the
>    headline copy, a one-line nudge, and the actual create CTA
>    inline. `NewGroupButton` self-hides for signed-out viewers so the
>    button only appears to people who can act on it; `/teams` links
>    directly to `/teams/new` (the page handles unauth redirect). Also
>    added a "+ Create your first team" inline CTA to
>    [my-teams-panel.tsx#L127](../../apps/web/src/app/teams/_components/my-teams-panel.tsx#L127)
>    "You don't captain any teams yet."
> 3. **Filter-form "Search" buttons read as secondary** on
>    [/groups](../../apps/web/src/app/groups/page.tsx) and
>    [/teams](../../apps/web/src/app/teams/page.tsx) — bordered-gray
>    style next to the primary search input. Promoted both to
>    `primaryButtonClass()`.
> 4. **Bracket creator UX** (Bundle 127 first half, separate from the
>    site-wide sweep): headline CTAs in
>    [no-bracket-view.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/no-bracket-view.tsx),
>    [setup-view.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/setup-view.tsx),
>    and [format-picker-form.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/format-picker-form.tsx)
>    got bumped to the standard primary size + new sticky bottom
>    action bar on the format picker, walk-in form collapsed into a
>    readiness-aware `<details>`, readiness chip ("8 teams · ready" /
>    "1 team · need ≥ 2") added to the no-bracket header, top action
>    card with "Generate bracket" hoisted above seeding in setup-view.
>
> Carry-overs noted in the quick scan but **not** in this bundle:
> position-rsvp-panel tap targets (P3), pending-label coverage on
> long-running submits (P3), sticky mobile action bar on event-detail
> (P2). All recorded in the journal entry; pick up when the events
> page UX is re-opened.
>
> See the [Bundle 127 journal](../journal/2026-05-digest.md#bundle-127).

> **Status update (2026-05-23, Bundle 66):** **2026-05-22 architectural
> regression notes both verified-stale and cleared.** The two follow-ups
> the prior note flagged for "the next page-diet pass" have already
> landed in their parent audits:
>
> 1. **Page LOC regression (architecture P1).** [page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx)
>    is **296 LOC** today (was 837 when the 2026-05-22 note went in,
>    against a ~520 baseline at the original audit). Closed by
>    Architecture audit Bundles 23 + 24: Bundle 23 extracted data
>    loading into [\_loaders/load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
>    (887 → 566 LOC); Bundle 24 followed with six render-branch
>    components under [\_components/](../../apps/web/src/app/events/%5Bid%5D/_components/)
>    (566 → 294 LOC). 64% cut overall; well under the ~150 LOC
>    aspirational target the architecture audit asks for orchestrator
>    pages.
> 2. **`Date.now()` in render (performance P1 #0).** Grep for
>    `Date.now()` across `apps/web/src` returns **zero** matches.
>    Closed by Performance audit Bundle 2: introduced [render-now.ts](../../apps/web/src/lib/render-now.ts)
>    (`renderNowMs()`) and lifted `EventHero`'s time-derived booleans
>    to the page boundary as a `closingSoon` prop. The specific
>    `page.tsx#L115` site the prior note named is gone with the
>    page-diet refactor.
>
> No new UX work in this bundle — audit-doc reconciliation only.
> The events page UX audit itself remains closed; remaining items are
> the explicit Won't-do deferrals further down. See the
> [Bundle 66 journal](../journal/2026-05-digest.md#bundle-66).
>
> **Status update (2026-05-22):** UX findings still closed. Architectural
> note: the page is now 837 LOC (was ~520 when this audit ran) — see the
> [architecture audit](architecture.md) P1 regression and the
> [performance audit](performance.md) new P1 #0 (`Date.now()` in render at
> [page.tsx#L115](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L115)).
> Both belong in the next page-diet pass.## Render order (current)

```
Back link
Flash alerts (created / tip)

EventHero
  ├─ Tags row
  ├─ Title
  ├─ Sub-line: date · city · spots · price
  ├─ Closing-soon pill (when registration closes ≤72h)
  ├─ Primary CTA (RSVP / Buy / Register / Open bracket / View attendees)
  └─ Secondary: Share, Edit (host)

When / Spots grid
EventMetaSection (dl: series · fundraiser · sanctioning · closes · payment notes)
ExternalRegistrationCard (when external)
DivisionsSection

Signup (id="signup")
  - open_play: PaidTicketPanel | PositionRsvpPanel | RsvpPanel
  - tournament: TournamentRegistrationTabs (Register team / Free agent)

EventClosedState (cancelled / completed / hasStarted pivot)

Description
Rules
Bracket card (tournament)

Where (address + map + osm link)
Hosts
Host tools <details> (host-only)
  ├─ HostDivisionsManager
  └─ HostBroadcastPanel
Teams registered (tournament, id="teams")
Players signed up (open_play, id="attendees")
Tip jar (non-hosts)

EventStickyCta (mobile-only, hides when #signup is in view)
```

## Quick wins shipped (2026-05-18, first bundle)

- **Hero sub-line** with date · city · spots · price (free vs `$X.XX`
  derived from `attendeeChargeBreakdownAsync`).
- **Description + Rules** moved up to immediately after the signup panel.
- **Bracket card** promoted out of the page-bottom slot.
- **Host tools disclosure** — `HostDivisionsManager` + `HostBroadcastPanel`
  collapsed into a single `<details>` block.

## Larger changes shipped (2026-05-18, second bundle)

### 1. `EventHero` with primary CTA + countdown — **shipped**

[apps/web/src/app/events/[id]/\_components/event-hero.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-hero.tsx).
Renders the tags row, title, meta sub-line, closing-soon pill (visible
only when `registrationClosesAt` is within 72h), the primary CTA, and the
Share / Edit secondary actions. CTA selection lives at the page level
(`getPrimaryCta` IIFE in `page.tsx`) so it can read `event.status`,
`hasStarted`, viewer auth, paid/free, and `isAttending`.

### 2. Tabbed tournament registration — **shipped**

[tournament-registration-tabs.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/tournament-registration-tabs.tsx).
Client wrapper that takes the existing `TournamentSignupPanel` and
`FreeAgentSignupPanel` server components as children and switches between
them. Tab labels carry count badges ("Register team (3) · Free agent (2)").
The wrapper carries `id="signup"` so hero and sticky CTAs anchor to it.

### 3. Sticky mobile bottom CTA bar — **shipped**

[event-sticky-cta.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-sticky-cta.tsx).
Mobile-only (`sm:hidden`). Mirrors the hero CTA and uses an
`IntersectionObserver` against `#signup` to fade out once the inline panel
scrolls into view. Pads for `safe-area-inset-bottom` for iOS notches.

### 4. Closed-state pivot — **shipped**

[event-closed-state.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-closed-state.tsx).
Replaces the bare "Signups are closed" `<p>`. Three branches:

- `status === 'cancelled'` → red notice, no CTA.
- `status === 'completed'` → "View bracket" (tournament) or "View attendees" (open play).
- `hasStarted` (still published) → same pivot + a host-only "Manage event" button.

### 5. `EventMetaSection` as a `<dl>` — **shipped**

[event-meta-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-meta-section.tsx).
Two-column definition list (`grid-cols-[max-content_1fr]`) on `sm+`,
stacked on mobile. The `Row` helper handles the term/description pairing.
`hideRegistrationCloses` prop is wired in but not currently set — the dl
keeps the precise date while the hero shows the urgency pill, so the two
are complementary rather than duplicative.

### 6. "Teams registered (N)" section — **shipped**

[teams-registered-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/teams-registered-section.tsx).
Always-visible read-only roster for tournaments, mirroring the open-play
"Players signed up" section. Renders under `id="teams"`.

### 7. Bracket promotion when status ≥ ready — **shipped (partial)**

The hero CTA now resolves to **Open bracket** when `hasStarted` or
`status === 'completed'` on tournaments, and `EventClosedState` repeats
the same CTA inside the closed-state notice. No new domain field added —
we read `hasStarted` and `status` directly. The original Bracket card
still renders in-flow below Description/Rules; promoting it visually into
the hero would require duplicating the card shell and isn't justified
given the hero CTA already covers the primary click target.

## Won't-do / explicit deferrals

- **Removing the When/Spots grid**: the grid still adds value for at-a-glance
  scanning; replacing it with a single dense card was considered and felt
  worse on mobile.
- **Moving Hosts above signup**: hosts are decision context but not as
  important as price/date/spots; current order is correct.
- **Auto-collapsing Description above ~N characters**: nice-to-have, not
  worth the complexity for now.
