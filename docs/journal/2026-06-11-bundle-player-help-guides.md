# Player how-to guides — completing the `/help` route (C2) (2026-06-11)

## Context

Same-day follow-on to the [host guides bundle](2026-06-11-bundle-host-help-guides.md),
which shipped the `/help` route host-first and left the player track as a flagged
one-entry-per-guide addition. This lands that track, closing **C2**
([feature-education.md](../feature-education.md)) for both personas. The player
journey is short by design (time-to-value is minutes — the persona model says
players get hooked first and discover teams/brackets/chat _after_), so the player
set is tighter and lighter than the host set.

## Decisions

- **No new scaffolding — the catalog already supported it.** Adding four
  `audience: 'player'` entries to
  [help-meta.ts](../../apps/web/src/app/help/help-meta.ts) was the whole data
  change; the hub's "For players" section (`helpGuidesFor('player')`) and the
  sitemap (`HELP_GUIDES.map(...)`) auto-render them. This is exactly the contract
  the host bundle set up.
- **Audience-aware footer CTA.** The one behavioural change: `GuidePage`'s
  closing call-to-action was a hardcoded "Host an event →," wrong for a player.
  It now keys off `guide.audience` — host → "Host an event →" (`/events/new`),
  player → "Browse events →" (`/events`) — via a small `CTA` record in
  [guide-page.tsx](../../apps/web/src/app/help/_components/guide-page.tsx).
- **Four player guides**, mirroring the host set's spine: `find-and-join`
  (discover · RSVP · waitlist · guest sign-up · positions), `paying-for-events`
  (checkout · refund window · tips · passes/memberships — buyer side),
  `teams-and-free-agents` (full-team / partner / pair-draw sign-up · free-agent
  pool · standing teams), `your-account` (profile · claim a guest sign-up ·
  friends · groups · notifications — maps to the B1 player checklist). Content
  from [features.md](../features.md) §2–§15.
- **No `/pricing` link from player guides.** That page is host/Pro-facing; the
  buyer-side fee is described generically ("may show as a separate line item, or
  baked into the ticket price — the checkout total is what you're charged") so it
  needs no number and can't drift.

## Changes

- [help-meta.ts](../../apps/web/src/app/help/help-meta.ts) — four player catalog
  entries (orders 1–4 within the player audience).
- [guide-page.tsx](../../apps/web/src/app/help/_components/guide-page.tsx) —
  audience-keyed footer CTA (`CTA` record; imports `HelpGuideMeta`).
- New `apps/web/src/app/help/{find-and-join,paying-for-events,teams-and-free-agents,your-account}/page.tsx`
  — each thin: `metadata = guideMetadata(slug)` + authored JSX inside `<GuidePage>`.

The hub, footer, sitemap, and onboarding-checklist wiring from the host bundle
needed no edits — the player section and sitemap entries appeared on their own.

## Verify

Quad green (`pnpm typecheck && lint && test && build`) — 380 web tests pass, 0
lint errors (3 pre-existing scoreboard warnings); all ten `/help` routes build (5
host + 4 player + hub). Content pages, no domain logic → no new unit tests.
Visual rendering in both themes + the player-CTA on the footer are **not**
exercised by the static quad — wants a quick real-app pass, deploy-gated like the
rest of the uncommitted tree.
