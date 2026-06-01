# Event-card thumbnails (F-13) (2026-06-01)

## Context

Closes **F-13** in [find-events-ux.md](../audits/find-events-ux.md) — the last
"feature" item on the events listing page. Cards were text-only; a discovery
grid scans far faster with a visual anchor. The detail page has hero images, so
the data exists — it just wasn't on the cards.

## Decisions

- **Merge `hero_image_url` from `events_view` by id — don't touch the
  `search_events` RPC.** The original finding assumed adding the column meant
  altering the RPC (a migration). But `events_view` already exposes
  `hero_image_url`, and the RPC's result type is a hand-written cast in the repo
  (not generated), so a second batched `events_view` select keyed by the result
  ids — merged in JS — gets the same data migration-free and avoids rewriting a
  large, hard-to-test SQL function. Matches the repo's existing "fetch then merge
  by collected ids" idiom (e.g. `profiles_public` cards).
- **Thumbnails are cosmetic, so the lookup fails soft.** `loadHeroImageUrls`
  returns an empty map on a query error instead of throwing — a hiccup fetching
  images must not take down discovery. Cards then render the placeholder.
- **`next/image`, not `<img>`.** It's the repo convention and
  `**.supabase.co` (where hero images live) is already in `next.config`
  `remotePatterns`. `fill` + `object-cover` inside an `aspect-video` box, with
  `sizes` matched to the 1/2/3-column grid.
- **Surface-tinted placeholder when no image.** Sand→amber, grass→green,
  indoor→sky, with a faint volleyball glyph — a calmer, on-theme empty state than
  a gray box, and a small visual cue to the surface.
- **Thumbnail sits under the stretched link.** It's earlier in the DOM than the
  title link whose `::after` overlay covers the card, so the image never steals
  the click — the whole card stays one target (F-3).
- **Following feed gets it for free.** Its query already reads `events_view`
  (from F-4), so adding `hero_image_url` to that select + `FollowingFeedItem` was
  a one-line-each change — thumbnails on every tab.

## Changes

- [event-repository.ts](../../packages/domain/src/events/event-repository.ts) /
  [social-graph-queries.ts](../../packages/domain/src/users/social-graph-queries.ts)
  — `heroImageUrl: string | null` on `VolleyballEventSummary` + `FollowingFeedItem`.
- [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
  — `loadHeroImageUrls(ids)` (events_view lookup, fail-soft); `search` merges it in.
- [supabase-social-graph-repository.ts](../../packages/infrastructure/src/supabase-social-graph-repository.ts)
  — `hero_image_url` added to the `events_view` select + result mapping.
- [event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) —
  `CardThumb` (Image or surface-tinted placeholder) + `heroImageUrl` on `EventCardData`.
- [page.tsx](../../apps/web/src/app/events/page.tsx) — `heroImageUrl` threaded
  through both mappings.

## Patterns observed

- **`events_view` keeps paying off as the read-model seam.** Capacity (F-4) and
  now hero images both came from it without an RPC change or migration. When a
  card needs another viewer-independent event field, the cheapest path is an
  `events_view` lookup by id, not a new RPC arg.

## Follow-ups

- **F-11** (collapse the filter card behind a single "Filters (N)" trigger) is
  the only remaining find-events item — held pending a layout/IA decision
  (disclosure vs. modal, and how it coexists with auto-apply). Tracked in
  [find-events-ux.md](../audits/find-events-ux.md).
- Optional: a blur placeholder (`placeholder="blur"`) would need stored
  blurhashes/dimensions — not worth it for a list thumbnail today.
