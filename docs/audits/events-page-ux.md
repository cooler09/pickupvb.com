# Events Page UX Audit

_Last updated: 2026-06-09_

Audit of [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx).
Goal: prioritize the most important information and CTAs for visitors landing
from a share link, while keeping the page useful for hosts and attendees.

> **Status (2026-06-09 re-audit + first remediation bundle):** This pass
> re-walked the page after ~8 sections were appended since the last audit (Pass
> panel, Event chat, Teams, Tip, Media, Badges, Waiver, Sponsor, hero image,
> manage banner) and the host console moved to `/manage`. Findings tagged
> **EV-1 … EV-9** below.
>
> **Fixed (quad-green, uncommitted):** **bundle 1** — EV-1 (league CTA), EV-2
> (stale `/edit` link → `/manage`), EV-3 (sticky-CTA `inert` a11y), EV-8 (token
> bleed — bordered neutral buttons → `neutralButtonClass`, validation
> `text-secondary` → `text-md-error`, fuchsia theme chip made dark-aware), EV-9
> (render-map refreshed). **bundle 2** — EV-4 (section sprawl → sticky
> auto-discovering in-page jump nav). **Remaining backlog — 0 P2 · 3 P3:** EV-5
> (redundant bracket/schedule CTAs), EV-6 (sticky CTA non-action once
> registered), EV-7 (team-event "Spots" framing — verify first). See the
> remediation logs at the foot of this section.

## 2026-06-09 re-audit — findings (EV-1 … EV-9)

| ID   | Sev | Theme            | One-line                                                                                    |
| ---- | --- | ---------------- | ------------------------------------------------------------------------------------------- |
| EV-1 | P2  | Bug / CTA        | Leagues fall through `buildCta` → hero+sticky read "RSVP"/"Buy ticket" (not "Register").    |
| EV-4 | P2  | IA / streamline  | ~16 flat stacked sections; secondary content has no grouping/anchors — long scroll tail.    |
| EV-9 | P2  | Doc hygiene      | "Render order (current)" map in this file was ~8 sections stale. Refreshed below.           |
| EV-2 | P3  | Stale link       | `EventClosedState` "Manage event" → `/edit`; canonical host console is now `/manage`.       |
| EV-3 | P3  | A11y             | `EventStickyCta` hides via `opacity-0`+`aria-hidden` but link stays focusable in tab order. |
| EV-5 | P3  | Redundancy       | Started tournament shows 3 "Open bracket" controls (hero + closed-state + subpage card).    |
| EV-6 | P3  | Streamline       | Sticky mobile CTA persists "You're in — view details" once registered — a non-action.       |
| EV-7 | P3  | Gap (verify)     | "Spots" cell + hero use per-player framing on team events (tournament/league).              |
| EV-8 | P3  | M3 / token bleed | `text-secondary` validation error, hard-coded fuchsia chip, hand-rolled neutral buttons.    |

**Remediation log — 2026-06-09 (bundle 2):** EV-4 — sticky in-page jump nav.
Quad-green, uncommitted. New
[event-section-nav.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-section-nav.tsx)
(client; `useSyncExternalStore` + `MutationObserver` DOM discovery). Wired in
[page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) with `#about` /
`#where` / `#hosts` / `#media` anchor wrappers + `SECTION_NAV_ITEMS`;
`scroll-mt-20` added to the `#attendees` / `#teams` sections; `RoomChatPanel`
gained an optional `anchorId` (applied only when the panel is visible, so a
non-member leaves no dead `#chat` anchor). Deferred within EV-4: grouping the
passive bottom tail (Tip/Badges/Waiver/Sponsor) — minor nice-to-have.

**Remediation log — 2026-06-09 (bundle 1):** EV-1, EV-2, EV-3, EV-8, EV-9
fixed; quad-green (`pnpm typecheck && lint && test && build`), uncommitted.
Files touched:
[load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
(EV-1 — league branch in `buildCta`: "Register" while open, "View schedule"
once started/completed),
[event-closed-state.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-closed-state.tsx)
(EV-2 `/edit`→`/manage` + EV-8 neutral button),
[event-sticky-cta.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-sticky-cta.tsx)
(EV-3 `inert` when hidden),
[tip-jar.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/tip-jar.tsx) +
[event-meta-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-meta-section.tsx) +
[rsvp-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/rsvp-panel.tsx) +
[position-rsvp-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/position-rsvp-panel.tsx)
(EV-8). Deferred from EV-8: tip-jar's filled toggle/preset group kept as-is
(distinct surface-filled control set, not standard CTAs). **Open: EV-4, EV-5,
EV-6, EV-7.**

### EV-1 (P2) ✅ FIXED 2026-06-09 — League hero/sticky CTA is mislabeled (and missing once started)

[`buildCta`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts#L726-L767)
has branches for `external`, `tournament`, and `open_play` but **no `league`
branch**. An upcoming league therefore falls through to the tail
(`paid ? 'Buy ticket' : 'RSVP'`), so the hero **and** the mirrored
[mobile sticky bar](../../apps/web/src/app/events/%5Bid%5D/_components/event-sticky-cta.tsx)
read "RSVP" / "Buy ticket" while the inline panel below says **"Register your
team for the season."** Worse, once the season starts (`!signupsOpen`) the
function returns `null`, so an in-progress league has **no hero CTA at all**
even though the page still wants to point at the schedule.
**Fix:** add a league branch — `{ kind:'anchor', hash:'#signup', label:'Register' }`
while `signupsOpen`, and `{ kind:'internal', href:` `` `/events/${id}/schedule` `` `, label:'View schedule' }`
once `hasStarted || status==='completed'` (mirroring the tournament/bracket branch).

### EV-2 (P3) ✅ FIXED 2026-06-09 — "Manage event" closed-state link points at the old `/edit` target

[event-closed-state.tsx#L80-L87](../../apps/web/src/app/events/%5Bid%5D/_components/event-closed-state.tsx#L80-L87)
renders a host-only "Manage event" button linking to `/events/{id}/edit`. Since
the host console landed, the canonical entry is `/events/{id}/manage` — that's
where [`EventManageBanner`](../../apps/web/src/app/events/%5Bid%5D/_components/event-manage-banner.tsx)
sends hosts, and the hero comment notes "Host management… lives on the dedicated
/manage dashboard." This one button still drops the host on the raw edit form.
**Fix:** point it at `/events/{id}/manage` (or relabel to "Edit details" if the
edit form is genuinely the intent).

### EV-3 (P3) ✅ FIXED 2026-06-09 — Sticky CTA keeps a focusable link inside an `aria-hidden` subtree

[event-sticky-cta.tsx#L41-L69](../../apps/web/src/app/events/%5Bid%5D/_components/event-sticky-cta.tsx#L41-L69)
hides the bar with `opacity-0` and sets `aria-hidden={hidden}` on the wrapper,
but the inner `<Link>/<a>` keeps `pointer-events-auto` and stays in the tab
order. A keyboard user can focus an invisible button, and a focusable node
inside an `aria-hidden` subtree is a WCAG 4.1.2 / 2.4.3 violation. **Fix:** when
`hidden`, also apply the `hidden` attribute / `inert` (or swap `opacity` for
`visibility:hidden` / `display:none`) so the element leaves both the a11y tree
and the tab order. Cross-ref [accessibility.md](accessibility.md) C7.

### EV-4 (P2) ✅ FIXED 2026-06-09 (bundle 2) — Page section sprawl; secondary content is an undifferentiated tail

**Fix shipped:** a sticky, auto-discovering in-page jump nav
([event-section-nav.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-section-nav.tsx))
sits where the below-the-fold content begins (after the signup panel) and pins
to the viewport top as the reader scrolls into it (the site header isn't
sticky, so `top-0` needs no offset). It links the destinations people actually
hunt for — **About · Where · Hosts · Players/Teams · Chat · Media** — so a
returning attendee reaches the roster or chat in one click instead of scrolling
the engagement tail. Because most of these sections self-gate to null (chat for
non-members, Players vs. Teams by type, About when there's no description), the
nav discovers what actually rendered via `useSyncExternalStore` over a
`MutationObserver` (AGENTS pattern 5 — no set-state-in-effect) and re-scans when
the async chat panel settles, so a chip never points at a missing anchor.
**Deliberately left:** the passive bottom cards (Tip, Badges, Waiver, Sponsor)
stay un-nav'd and un-grouped — they're one-time/passive, not "hunt-for"
destinations; collapsing them behind `<details>` (the audit's option (b)) is a
minor nice-to-have, not done. _Original finding:_

### EV-4 (original finding) — Page section sprawl; secondary content is an undifferentiated tail

The page now renders ~16 visible sections in a flat vertical stack (see the
refreshed map below). Everything after the signup panel — Description, Rules,
sub-page link, Location, Hosts, Attendees, **Event chat**, Teams, **Tip jar**,
**Media**, **Badges**, **Waiver**, **Sponsor** — is appended with no grouping or
in-page nav. A returning attendee hunting for chat or the roster, or a host
checking media, scrolls past a long monetization/engagement tail every time.
**Fix (incremental):** (a) group the post-RSVP content and add a light
section-nav or tabs ("Details · Players/Teams · Chat · Media"); or at minimum
(b) collapse the low-frequency tail sections (Tip, Media, Badges, Waiver,
Sponsor) behind `<details>` the way [`SignupSection`](../../apps/web/src/app/events/%5Bid%5D/_components/signup-section.tsx)
already does, and re-order so the high-traffic returning-user destinations
(chat, roster) aren't buried beneath one-time sections. Page composition:
[page.tsx#L298-L409](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L298-L409).

### EV-5 (P3) — Redundant "view bracket / schedule" affordances on closed events

On a started/completed **tournament** the page surfaces the destination three
times: the hero CTA "Open bracket", the
[`EventClosedState`](../../apps/web/src/app/events/%5Bid%5D/_components/event-closed-state.tsx#L61-L79)
"View bracket", and the standalone
[`EventSubpageLink`](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L320-L336)
"Open bracket" card. Leagues show "View schedule" (closed-state) + "Open
schedule" (subpage) — two. **Fix:** suppress the standalone subpage card once
the closed-state already carries the same CTA (or fold the subpage link into the
closed-state), so there's one obvious next click.

### EV-6 (P3) — Mobile sticky CTA is a non-action once the viewer is registered

When `isAttending`, [`buildCta`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts#L757-L758)
returns "You're in — view details" (anchor to `#signup`), and
[`EventStickyCta`](../../apps/web/src/app/events/%5Bid%5D/_components/event-sticky-cta.tsx)
mirrors it — so a signed-up mobile user gets a persistent bottom bar whose only
job is to scroll to the (now-collapsed) panel. **Fix:** suppress the sticky bar
for already-registered viewers, or repoint it at a real next action ("Open event
chat" / "View roster").

### EV-7 (P3, verify) — "Spots" framing assumes individual attendees on team events

[`EventWhenSpotsSection`](../../apps/web/src/app/events/%5Bid%5D/_components/event-when-spots-section.tsx#L57-L70)
and the hero spots chip render capacity as players ("N open · M signed up" /
"N spots left"). For tournaments/leagues, registration is by **team** and
event-level `capacity` is usually null → the Spots cell reads **"Unlimited"**
even when the (single) division has a team cap; and if a host sets an event-level
capacity it reads "X open · **0 signed up**" (player framing for a team event).
Single-division team events never reach
[`DivisionsSection`](../../apps/web/src/app/events/%5Bid%5D/_components/divisions-section.tsx#L68)
(`length <= 1` returns null), which already knows how to say "registered / cap
teams". **Fix:** for `teamRegistrationMode != null` events, surface division
team-capacity in the Spots cell (or hide the per-player framing) and reconcile
with `DivisionsSection`. _Verify against a real single-division tournament before
implementing — behaviour depends on whether the host set event-level capacity._

### EV-8 (P3) ✅ FIXED 2026-06-09 — Token bleed against AGENTS pattern 11 / 17

Event-page components still carry raw-palette / hand-rolled strings:

- **Validation error uses `text-secondary`** instead of `text-md-error` —
  [tip-jar.tsx#L115](../../apps/web/src/app/events/%5Bid%5D/_components/tip-jar.tsx#L115).
- **Theme-tag chip hard-codes `bg-fuchsia-100 text-fuchsia-900` with no dark
  variant** → a fixed light chip on dark surfaces —
  [event-meta-section.tsx#L82-L84](../../apps/web/src/app/events/%5Bid%5D/_components/event-meta-section.tsx#L82-L84).
  (Decorative, so no ratchet, but unlike the sanctioned scoreboard team colors
  this one has zero dark handling.)
- **Neutral buttons hand-rolled** as `rounded-md border px-… text-… font-medium`
  instead of `neutralButtonClass` —
  [rsvp-panel.tsx#L73,L104](../../apps/web/src/app/events/%5Bid%5D/_components/rsvp-panel.tsx#L73),
  [position-rsvp-panel.tsx#L74,L123](../../apps/web/src/app/events/%5Bid%5D/_components/position-rsvp-panel.tsx#L74),
  [event-closed-state.tsx#L83](../../apps/web/src/app/events/%5Bid%5D/_components/event-closed-state.tsx#L83),
  [tip-jar.tsx#L79,L91,L109](../../apps/web/src/app/events/%5Bid%5D/_components/tip-jar.tsx#L79).
  (`rsvp-panel` already imports `neutralButtonClass` for "Leave waitlist" — the
  others in the same file just weren't migrated.)

### EV-9 (P2) ✅ FIXED 2026-06-09 — Stale render-order map (fixed in this edit)

The "Render order (current)" block below was last updated 2026-05-28 and was
missing the Pass panel, Event chat, Teams, Tip, Media, Badges, Waiver, Sponsor,
hero image, and manage banner. Refreshed map follows.

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
> Both belong in the next page-diet pass.## Render order (current — refreshed 2026-06-09)

Host-management controls moved off this page to the dedicated
`/events/[id]/manage` console (reached via the `EventManageBanner` strip); the
hero no longer carries an Edit button. Source:
[page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx).

```
EventStructuredData (JSON-LD, head-only)
Back link
EventManageBanner            (host/co-host only → /manage)
EventFlashBanners            (created / tip / cohost flash params)
OffPlatformUpsell            (host + paymentsOffPlatform + not dismissed)
HeroImage

EventHero
  ├─ Tags row + Share link (Edit removed → /manage)
  ├─ Title
  ├─ Sub-line: date · city · spots
  ├─ "Live now" pill (active stream) · Closing-soon pill (≤72h)
  └─ Primary CTA + price chip

EventWhenSpotsSection        (When/Season · Spots)
EventMetaSection             (dl: series · fundraiser · sanctioning · closes · payment notes)
DivisionsSection             (2+ divisions only)

EventSignupArea (id="signup")
  - external:    ExternalRegistrationCard
  - open_play:   PaidTicketPanel | PositionRsvpPanel | RsvpPanel (+ waitlist)
  - tournament:  TournamentRegisterPanel (ad-hoc + roster + free-agent)
  - league:      TournamentRegisterPanel (roster + free-agent)
  - else:        EventClosedState (cancelled / completed / hasStarted pivot)

PassPanel                    (Suspense; gated host-pass read)
Description
Rules
EventSubpageLink             (Bracket — tournament / Schedule — league)
EventLocationSection         (address + lazy map + OSM link)
HostsSection
AttendeesPanel               (open_play, on-platform; id="attendees", paged via apage)
RoomChatPanel                (event chat; members only, self-hides for non-members)
TeamsRegisteredSection       (tournament, on-platform; id="teams")
TipJar                       (non-hosts)
EventMediaLink               (photo/video sub-page; "live" badge)
EventBadgesEarnSection       (on_attend badges)
EventWaiverSection           (Suspense; click-wrap sign, soft/non-blocking)
EventSponsorSection
EventStickyCta               (mobile-only; hides when #signup is in view)
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
