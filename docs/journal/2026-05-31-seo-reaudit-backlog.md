# SEO re-audit backlog closed — #5–#10 (2026-05-31)

## Context

The 2026-05-30 SEO re-audit ([docs/audits/seo.md § Reevaluation](../audits/seo.md#reevaluation--2026-05-30))
opened **2 P2 + 4 P3** findings against ~6 months of new public surface
(community listings, bracket spectator + league schedule sub-routes, scoreboard
tool, stats, legal pages). The 2026-05-17 backlog was already closed. User asked
to close the whole carry-forward in one bundle.

Two of the findings were headline gaps: a `robots.txt` prefix `Disallow` silently
shadowed the deliberately-built public `bracket/watch` spectator page (all its
canonical/OG/Twitter work dead to crawlers + unfurl bots), and the community
listings aggregate never made it into the sitemap. The four P3s were small
quality gaps.

## Decisions

- **Index `bracket/watch`, don't just unfurl it (P2 #5).** Chose a plain
  longest-match `allow: ['/', '/events/*/bracket/watch']` over the
  allow-plus-page-`noindex` variant — the page already ships a canonical + OG
  image route + Twitter card, so indexing is the clear built intent. The
  `allow` is a longer prefix than the `/events/*/bracket` disallow, so it also
  un-blocks the nested `/watch/og` route (Google/Bing resolve by longest match).
- **Filter the community sitemap query to the page's indexable statuses
  (P2 #6).** `status in (active, claim_pending)` mirrors the detail page's
  `noindex` guard exactly, so the sitemap never advertises a URL that renders
  `noindex`. Same lesson the original P1 #2 (teams/players) encoded.
- **`follow: true` on cancelled/draft events (P3 #8).** Chose
  `{ index: false, follow: true }` over `follow: false` so links on a dead
  event page still pass equity. The guard reads `event.status` (already on the
  public read model + passed to `EventStructuredData`).
- **P3 #7 was half-done already.** The `force-dynamic`/viewer-island removal on
  `/events/[id]/schedule` had landed hours earlier in the 2026-05-31 perf bundle
  ([2026-05-31-bracket-schedule-cacheable.md](2026-05-31-bracket-schedule-cacheable.md)),
  which rewrote the page as a viewer-independent shell over `getEventBracketMeta`
  with host controls client-side. So this bundle only added the missing
  `generateMetadata`. Reused the same `getEventBracketMeta` read (no extra
  query) instead of pulling in the heavier `getEventDetail` just for a title.
- **`status`-based noindex on the schedule, not `visibility`.**
  `EventBracketMetaReadModel` has no `visibility` field; like the sibling
  `bracket/watch`, anon reachability rides RLS + sitemap omission, and the
  available `status` guard keeps cancelled/draft schedules out of the index.
- **`SportsEvent` over bare `Event` for the community JSON-LD (P3 #9).** The
  audit said "minimal `Event`", but community listings represent real volleyball
  events, so matching `event-jsonld.tsx`'s `SportsEvent` + `sport: 'Volleyball'`
  keeps the catalog consistent. Kept it minimal — no `offers`/capacity (these
  are externally-hosted events we don't own registration for). Emitted only on
  indexable statuses so hidden/removed/claimed listings carry no rich signal.

## Changes

- **robots** — `allow` string → array adding `/events/*/bracket/watch`
  ([robots.ts](../../apps/web/src/app/robots.ts)).
- **sitemap** — `/community` + 3 `/legal/*` static routes; `community_listings`
  query → `/community/<slug>` dynamic entries
  ([sitemap.ts](../../apps/web/src/app/sitemap.ts)).
- **events/[id]** — `generateMetadata` indexability guard broadened to status
  ([page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx)).
- **events/[id]/schedule** — added `generateMetadata` (title/canonical/OG,
  status noindex) ([page.tsx](../../apps/web/src/app/events/%5Bid%5D/schedule/page.tsx)).
- **community/[slug]** — new `opengraph-image.tsx` + `_components/community-listing-jsonld.tsx`;
  page renders the JSON-LD + shared `BreadcrumbJsonLd` on indexable statuses
  ([page.tsx](../../apps/web/src/app/community/%5Bslug%5D/page.tsx)).
- **docs** — SEO audit status update + backlog table flip + 5 remediation rows;
  audits README index row.

## Patterns observed

- **A robots `Disallow` is a prefix match.** Blocking a workspace subtree
  (`/events/*/bracket`) silently shadows any public child route under it
  (`/bracket/watch`, `/bracket/watch/og`). When a subtree mixes private +
  public routes, the public ones need an explicit longer-prefix `allow`.
- **Sitemap status filter must equal the page's `noindex` guard.** Any drift
  advertises a URL the page then marks `noindex` — a self-inflicted crawl-budget
  waste. Keep the two in lockstep (here: `active`/`claim_pending`).
- **`opengraph-image.tsx` is wired by file convention** — no `images` entry
  needed in the page's `openGraph` metadata, but an explicit empty/overriding
  `images` would suppress it. Confirm the route registers in the build output
  (`/community/-/opengraph-image`).

## Follow-ups

- Full static CDN caching of the listing pages (events/players/teams) — still
  the standing P2-partial, bounded by viewer/searchParam reads. Tracked in
  [performance.md](../audits/performance.md).
- Slug-based event URLs (P3) — still deferred; non-trivial migration, no
  measured regression. Tracked in [seo.md](../audits/seo.md).
- E2E note: this bundle is metadata/sitemap/robots only (no click-path), so the
  verify quad is sufficient; no new Playwright spec warranted.
