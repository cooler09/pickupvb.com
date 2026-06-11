# Event page in-page jump nav (EV-4 section sprawl) (2026-06-09)

## Context

Second remediation bundle off the
[events-page-ux re-audit](../audits/events-page-ux.md). **EV-4**: the event
detail page renders ~16 stacked sections; everything below the signup panel
(Description, Rules, Location, Hosts, Players/Teams, Chat, then the
Tip/Media/Badges/Waiver/Sponsor tail) is a flat `space-y-8` stack with no
grouping or in-page nav, so a returning attendee hunting for the roster or chat,
or a host checking media, scrolls the whole tail every time. The audit's primary
option was a section nav / tabs.

## Decisions

- **Jump nav over tabs.** Tabs hide content (weaker SEO for Description/Rules,
  and the page is a mix of server + client + async-gated panels — a tab
  container would have to thread all of them through a client boundary). A
  sticky in-page jump nav keeps the linear scroll/SEO intact and is purely
  additive.
- **Auto-discover rendered sections via `useSyncExternalStore` + a
  `MutationObserver`,** rather than have the page predict which sections show.
  Most below-the-fold sections self-gate to null — chat for non-members, Players
  (open play) vs. Teams (tournament), About when there's no description — and
  the page can't know the chat outcome (it's an async RPC behind RLS). The nav
  reads the live DOM (`document.getElementById(id)?.offsetHeight > 0`) so a chip
  never points at a missing anchor. `useSyncExternalStore` is the blessed
  primitive for an external mutable store (AGENTS pattern 5) — it sidesteps the
  `set-state-in-effect` lint smell that a `useEffect`+`useState` scan would trip
  (the snapshot is a comma-joined id **string**, a value type, so no
  stable-reference cache is needed). `childList`-only observation (no
  `characterData`/`attributes`) keeps live-score text ticks from thrashing the
  scan; it only fires on sections being added/removed (the chat panel settling).
- **`sticky top-0` with no offset** — the site header (`site-header.tsx`) isn't
  sticky, so it scrolls away and the bar pins cleanly to the viewport top once
  the reader scrolls into the below-the-fold region. Placed right after the
  signup panel so the conversion-critical top is untouched.
- **`anchorId` prop on `RoomChatPanel`** instead of a page-level `<div id="chat">`
  wrapper: the panel returns `null` for non-members, so applying the id inside
  the rendered section leaves no empty `#chat` node (and no dead anchor) when
  chat is hidden.
- **Scope — nav links the "hunt-for" destinations only** (About, Where, Hosts,
  Players/Teams, Chat, Media). Left the passive bottom cards (Tip, Badges,
  Waiver, Sponsor) un-nav'd and un-grouped; collapsing them behind `<details>`
  (the audit's option (b)) is a minor nice-to-have, deferred.

## Changes

- New [event-section-nav.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-section-nav.tsx)
  — client jump nav (DOM auto-discovery, sticky, hidden when <2 sections present).
- [page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) — `SECTION_NAV_ITEMS`
  const + `<EventSectionNav>` after the Pass panel; anchor wrappers `#about`
  (Description+Rules), `#where` (Location), `#hosts` (Hosts), `#media` (media link).
- [attendees-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/attendees-panel.tsx),
  [teams-registered-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/teams-registered-section.tsx)
  — `scroll-mt-20` on the existing `#attendees` / `#teams` sections so jumps clear the pinned bar.
- [room-chat-panel.tsx](../../apps/web/src/components/room-chat-panel.tsx) — optional
  `anchorId` prop (+ `scroll-mt-20`), applied to the visible-state section only.

## Patterns observed

- **Auto-discovering nav for self-gating sections.** When a page composes many
  sections that each decide their own visibility (some async), don't make a
  parent predict them — read the rendered DOM through `useSyncExternalStore` +
  `MutationObserver` and key links off real presence. Reusable shape if other
  long pages (group/club dashboards) want the same.

## Follow-ups

Open in [events-page-ux.md](../audits/events-page-ux.md): **EV-5** (3× "Open
bracket" controls on a completed tournament), **EV-6** (sticky CTA non-action
once registered), **EV-7** (team-event "Spots" framing — verify first). Minor
deferral inside EV-4: group/collapse the passive bottom tail.

## Verify

Quad green (`pnpm typecheck && lint && test && build`) — 356 web + 149
application tests pass, 0 lint errors (3 pre-existing scoreboard warnings). The
nav's runtime discovery (chat resolving, Players-vs-Teams, scroll-spy feel) is
**not** exercised by the static quad — wants a real-app / e2e pass, deploy-gated
like the rest of the uncommitted tree.
