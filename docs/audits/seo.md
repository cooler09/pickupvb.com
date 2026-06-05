# SEO audit — 2026-05-17

> **Status update (2026-06-05 — breadcrumb sub-audit + P3 bundle):**
> Read-only sweep of every `BreadcrumbList` on the site, prompted by the
> in-flight JSON-LD XSS-hardening refactor. **The 5 detail-page breadcrumbs
> (events/groups/players/teams/community) were already correctly configured** —
> absolute `item` URLs, 1-indexed `position`, and (the check that actually
> matters) each leaf `item` matches the page's `canonical`: events on the UUID
> form, the rest on slug/handle, so Google won't drop the rich result. No
> P1/P2 found; **all three actioned items are P3**:
> (1) **DRY / footgun** — `BreadcrumbJsonLd` took an `items` array of
> pre-built absolute URLs, so every call site hand-typed
> `https://pickupvb.com/...` (38 literals across the JSON-LD surface); a typo
> or a future domain flip silently voids the breadcrumb with **no typecheck
> error**. Reworked it to a relative-path `trail` API that prepends the
> implicit Home crumb and absolutizes each `path` against
> [`PROD_APP_URL`](../../apps/web/src/lib/app-url.ts#L18) (the pin its own
> docstring mandates for JSON-LD identifiers). All 5 call sites updated.
> (2) **Host tools** — added breadcrumbs (Home → Host tools → _tool_) to the
> 7 nested, sitemapped, indexable tool landing pages (scoreboard,
> team-randomizer, scheduler, seeding, standings, rotation, timer) — the
> strongest gap: genuinely nested **and** in the sitemap.
> (3) **Event spectator pages** — added 4-segment trails
> (Home → Events → _event_ → _surface_) to `/events/[id]/bracket/watch` and
> `/events/[id]/schedule`, linking these (sitemap-omitted, transient) surfaces
> back to the canonical, indexable event page.
> **Intentionally skipped:** the standalone `/brackets/[id]/watch` (no
> indexable parent — only a 2-segment Home→self trail is possible), the
> `/tools` index, `/about/numbers`, and `/legal/*` (all 2-segment Home→self;
> Google rarely renders a breadcrumb for a `[Home, current page]` list, so
> negligible upside). **Noted, not actioned:** the 7 tool pages still emit
> their `WebApplication` + `FAQPage` JSON-LD via a raw inline `<script>` +
> `JSON.stringify` rather than the shared `JsonLd` emitter — safe here (static,
> server-controlled values), so out of scope for the breadcrumb pass. Verify
> quad green. See the **Remediation log** entry below.

> **Status update (2026-05-31 — 2026-05-30 re-audit backlog closed, #5–#10):**
> All six carry-forward findings from the 2026-05-30 re-audit are resolved.
> (P2 #5) [robots.ts](../../apps/web/src/app/robots.ts) now carries a
> longest-match `allow: ['/', '/events/*/bracket/watch']` alongside the
> `/events/*/bracket` disallow, so crawlers + OG-unfurl bots reach the public
> spectator page (and its `/og` route) while the host/captain workspace stays
> blocked. (P2 #6 + P3 #10) [sitemap.ts](../../apps/web/src/app/sitemap.ts)
> gained the `/community` static route, a `community_listings` query (filtered
> to the page's indexable `active`/`claim_pending` statuses), and the three
> `/legal/*` pages. (P3 #8) the event-detail `noindex` guard now keys on
> **status** — public `cancelled`/`draft` events return
> `index:false, follow:true` so previously-indexed dead events deindex while
> still passing link equity. (P3 #7) `/events/[id]/schedule` got a
> `generateMetadata` (title + canonical + OG, status-based noindex); the
> `force-dynamic`/viewer-island half was **already resolved** by the
> 2026-05-31 performance bundle (see
> [docs/journal/2026-05-31-bracket-schedule-cacheable.md](../journal/2026-05-31-bracket-schedule-cacheable.md)),
> so the page reaches `bracket/watch` parity. (P3 #9) community detail pages
> now ship a tailored `opengraph-image.tsx` + a `SportsEvent` + `BreadcrumbList`
> JSON-LD (emitted only on indexable statuses). Verify quad green (web 79
> tests; lint 0 errors; build 8/8; `/community/-/opengraph-image` route
> registered). See the **Remediation log** and the now-cleared
> [§ Re-audit backlog](#re-audit-backlog-carry-forward) below.

> **Status update (2026-05-30 — full re-audit vs ~6 months of growth):**
> Re-ran the audit against the post-May surface (community listings,
> bracket spectator + schedule sub-routes, `/tools/scoreboard`,
> `/about/numbers`, legal pages). The 2026-05-17 → 05-24 backlog is
> closed and the new routes are mostly well-instrumented. Opened
> **2 P2 + 4 P3.** Headline: (P2 #5) `robots.txt` disallows the whole
> `/events/*/bracket` subtree, which **shadows the public
> `/events/[id]/bracket/watch` spectator page** — a route built with a
> canonical, a dedicated OG image route, a Twitter card and per-division
> previews, but crawlers and OG-unfurl bots are told not to fetch it.
> (P2 #6) **Community listings are absent from `sitemap.ts`** despite
> being public + indexable with good per-page metadata. Also notable:
> the 2026-05-17 `force-dynamic` P2 is now **effectively resolved on
> indexable surfaces** — `/events/[id]/schedule` is the only
> public-reachable page still carrying it. See
> [§ Reevaluation — 2026-05-30](#reevaluation--2026-05-30) below.

> **Status (2026-05-17):** Quick-win bundle landed. P1 #1 (noindex on auth-walled pages), #2 (sitemap teams + players), #3 (groups listing metadata) all ✅. P2 #2 (root not-found) and #3 (listing openGraph), #4 (events/new metadata) ✅. P2 #1 (force-dynamic) cross-listed and 🟡 partially shipped in the performance audit. See **Remediation log** and **Still open** below.

> **Status update (2026-05-23, Bundle 54):** Two SEO items closed.
> (1) **www → apex now 308 (permanent)** instead of Vercel's default
> 307 — verified via `curl -I https://www.pickupvb.com/events` returning
> 307 with `location: https://pickupvb.com/...` before the change. Added
> a `redirects()` rule in [next.config.mjs](../../apps/web/next.config.mjs)
> with `permanent: true`, which Next emits as 308 (method-preserving
> permanent). This shadows Vercel's default redirect, preserves link
> equity, and lets crawlers update SERP canonicals. Answers the
> long-standing **Open question** below. (2) **P3 `og:type` = `'website'`
> closed as Wontfix** — `'event'` is not a standard OG type; the
> authoritative rich-results signal is the existing `SportsEvent`
> JSON-LD block, which Google's rich-results parser uses. Documented so
> the finding stops surfacing in audit scans. See the
> [Bundle 54 journal](../journal/2026-05-23-bundle-54.md).
>
> **Status update (2026-05-24):** Bundle 18 shipped — P3 `BreadcrumbList` JSON-LD added to all four detail pages (events/groups/players/teams) via a shared [`BreadcrumbJsonLd`](../../apps/web/src/app/_components/breadcrumb-jsonld.tsx) component. Renders 3-segment trail (Home → listing → entity) with absolute URLs per spec. Bundle 20 shipped — P3 `SportsTeam` JSON-LD on `/teams/[slug]` and `SportsOrganization` JSON-LD on `/groups/[slug]`, co-located alongside the existing `BreadcrumbList` block. Bundle 21 shipped — dropped the `/teams/[slug]` login redirect that was contradicting the page's sitemap inclusion + structured data; anonymous visitors and crawlers now see the team's roster + JSON-LD, with management UI still gated on `isCaptain`.

> **Status update (2026-05-22):** No new SEO shipments this pass. Note from
> the [performance audit](performance.md): `force-dynamic` has re-appeared
> on [app/page.tsx](../../apps/web/src/app/page.tsx),
> [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx), and the
> [claim-link page e/[code]/page.tsx](../../apps/web/src/app/e/%5Bcode%5D/page.tsx).
> The first two are the most SEO-relevant; suppressing CDN caching on the
> home page and pricing page hurts crawl efficiency. Cross-listed.

## Scope

Read-only SEO review of the Next.js 16 App Router app at `apps/web`. Special focus on the recent canonical domain flip from `www.pickupvb.com` to `pickupvb.com` (apex) — verifying every `metadataBase`, JSON-LD URL, sitemap entry, robots.txt host, OG image URL, and absolute link reflects apex. Covered metadata coverage, canonical tags, structured data, sitemap/robots, OG/Twitter cards, indexability flags, URL structure, internal linking, 404/error pages, and stale-www references. Skipped `copilot-skills`.

---

## Stale `www.pickupvb.com` references

**None found** in `apps/web/src/**`, `packages/**`, `next.config.mjs`, `vercel.json`, or `apps/web/public/`. The only `www.*` hit is an external link to OpenStreetMap. Domain flip is clean from a code perspective.

(Open question below: does `vercel.json` issue a 301 from `www` host → apex? Worth verifying separately.)

---

## P1 findings

### Missing `noindex` on auth-only / private pages ✅ (2026-05-17)

- **Where:** [apps/web/src/app/friends/page.tsx](apps/web/src/app/friends/page.tsx), [apps/web/src/app/claim/page.tsx](apps/web/src/app/claim/page.tsx), [apps/web/src/app/teams/new/page.tsx](apps/web/src/app/teams/new/page.tsx), [apps/web/src/app/groups/[id]/members/page.tsx](apps/web/src/app/groups/[id]/members/page.tsx), [apps/web/src/app/events/new/page.tsx](apps/web/src/app/events/new/page.tsx).
- **Issue:** These pages redirect unauthenticated visitors but their `metadata` exports omit `robots`. Bots may receive the pre-redirect HTML (or simply index the URL by reference) before the redirect kicks in, polluting the index with login-walled URLs. Only [apps/web/src/app/profile/page.tsx](apps/web/src/app/profile/page.tsx) sets `noindex` correctly.
- **Fix:** Add `robots: { index: false, follow: false }` to each `metadata` export. `events/new` needs a full metadata export added.

### Sitemap omits `/teams/[id]` and `/players/[id]` ✅ (2026-05-17)

- **Where:** [apps/web/src/app/sitemap.ts](apps/web/src/app/sitemap.ts) (~L30–L60).
- **Issue:** Only events and groups dynamic routes are emitted. Public team and player pages exist and are crawlable, but discovery relies entirely on internal linking.
- **Fix:** Query the team + profile tables (public/non-private only) and append entries following the existing events/groups pattern with `lastmod` from `updated_at`.

### `groups` listing page metadata is bare ✅ (2026-05-17)

- **Where:** [apps/web/src/app/groups/page.tsx](apps/web/src/app/groups/page.tsx) (~L8).
- **Issue:** Only `{ title: 'Groups — PickupVB' }`. No description, no `openGraph`, no canonical. SERP snippet falls back to body text; social shares get no preview card.
- **Fix:** Add a ~140-char description, `alternates.canonical: '/groups'`, and an `openGraph` block (title, description, url, type:'website', siteName, images).

---

## P2 findings

### `force-dynamic` on public listings hurts CWV / LCP, which Google ranks 🟡 Partial (cross-listed; see performance audit)

- **Where:** [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx), [apps/web/src/app/events/page.tsx](apps/web/src/app/events/page.tsx), [apps/web/src/app/players/page.tsx](apps/web/src/app/players/page.tsx), [apps/web/src/app/teams/page.tsx](apps/web/src/app/teams/page.tsx), [apps/web/src/app/groups/page.tsx](apps/web/src/app/groups/page.tsx), [apps/web/src/app/pricing/page.tsx](apps/web/src/app/pricing/page.tsx), [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx).
- **Issue:** `export const dynamic = 'force-dynamic'` defeats the edge cache → every Googlebot fetch hits origin → measurably worse LCP/TTFB → Core Web Vitals demotion. Already P1 in the [performance audit](performance.md); restated here because it has a direct ranking impact.
- **Fix:** Drop `force-dynamic` on public pages. If personalization is required (signed-in nav), move per-user content into a small client island and let the shell ISR/SSG. ISR `revalidate: 60` is a reasonable default for listings.

### No root `not-found.tsx` ✅ (2026-05-17)

- **Where:** [apps/web/src/app/](apps/web/src/app/) — only `global-error.tsx` exists.
- **Issue:** Unmatched routes serve Next's bare default. No internal links to crawl, no branded recovery path, and (worse) Vercel may return 200 + framework HTML in some edge cases producing soft-404s.
- **Fix:** Add `apps/web/src/app/not-found.tsx` with a branded message and links into events, groups, players, teams. Confirm a 404 status is returned (Next does this when `notFound()` triggers).

### Listing pages missing `openGraph` block ✅ (2026-05-17)

- **Where:** [apps/web/src/app/teams/page.tsx](apps/web/src/app/teams/page.tsx) (~L8), [apps/web/src/app/players/page.tsx](apps/web/src/app/players/page.tsx) (~L10), [apps/web/src/app/groups/page.tsx](apps/web/src/app/groups/page.tsx) (~L8 — already called out in P1 for description).
- **Issue:** Title + description present (teams/players), but no `openGraph` object → social shares show no preview card. The infrastructure for per-route OG image generation already exists, so this is wiring.
- **Fix:** Add an `openGraph: { title, description, url, type: 'website', siteName: 'PickupVB', images: [...] }` block; reuse the existing OG image route for each entity type.

### `events/new` exports no metadata at all ✅ (2026-05-17)

- **Where:** [apps/web/src/app/events/new/page.tsx](apps/web/src/app/events/new/page.tsx).
- **Issue:** Falls through to the root template title; no `noindex`. Already covered in P1 for the noindex requirement; the metadata export is the same fix.
- **Fix:** `export const metadata = { title: 'Create event — PickupVB', robots: { index: false, follow: false } };`

### `/teams/[slug]` redirects unauth visitors despite sitemap inclusion ✅ (2026-05-24)

- **Where:** [apps/web/src/app/teams/[id]/page.tsx](apps/web/src/app/teams/[id]/page.tsx).
- **Issue:** Page was listed in [sitemap.ts](../../apps/web/src/app/sitemap.ts) (Bundle 14) and emits `BreadcrumbList` + `SportsTeam` JSON-LD (Bundles 18 + 20), but the page handler redirected unauthenticated visitors to `/login`. Crawlers never reached the structured data — the whole SEO chain on this route was wasted.
- **Resolution:** Removed the `redirect()` and made `user` optional. RLS on `teams` + `team_members` already allows anonymous SELECT (`USING (true)`), so this exposes nothing not already public. Captain-only UI (`AddTeamMemberForm`, `ExtraMembersForm`, `CaptainBroadcastPanel`, member-row management actions) was already gated on `isCaptain`; the viewer-membership / pending-invite computation now short-circuits when `user` is null.

---

## P3 findings

### Event `og:type` is `'website'` not `'event'` — ✅ Closed (2026-05-23, Bundle 54) (Wontfix)

- **Where:** [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) (~L53).
- **Issue:** `'event'` is non-standard in OG; `'website'` is the correct fallback. The authoritative signal for rich event results is the existing JSON-LD SportsEvent block.
- **Decision (Bundle 54):** Leave `'website'`. Google's rich-results pipeline reads `SportsEvent` JSON-LD (see [event-jsonld.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-jsonld.tsx)) — that's the signal carrying `name`, `startDate`/`endDate`, `eventStatus`, `location`, `organizer`, `offers`, `attendeeCapacity`. OG `og:type` only affects how the URL renders in social-share previews (Facebook/LinkedIn/Slack), where `'website'` is the safe fallback for any non-`article`/`video`/`music` content. Promoting to `'event'` would introduce a non-standard value with no upside.

### No `BreadcrumbList` JSON-LD on detail pages ✅ (2026-05-24)

- **Where:** `events/[id]`, `groups/[id]`, `players/[id]`, `teams/[id]`.
- **Issue:** Eligible for breadcrumb rich result in SERPs; minor.
- **Fix:** Add a small `BreadcrumbList` JSON-LD next to the existing structured-data blocks.

### Event URLs are UUIDs, not slugs

- **Where:** `/events/[uuid]` (e.g. `/events/550e8400-…`).
- **Issue:** Not a ranking factor on its own, but human-readable slugs improve CTR from share previews and direct-link sharing. Groups, teams (slug) and players (handle) already do this.
- **Fix:** Discussion-level. If desired, add a `slug` column to `events`, accept both `/events/[id-or-slug]` in the route, and 301 the UUID form to the slug form. Non-trivial migration.

### No `SportsTeam` / `SportsOrganization` JSON-LD on teams/groups pages ✅ (2026-05-24)

- **Where:** [apps/web/src/app/teams/[id]/page.tsx](apps/web/src/app/teams/[id]/page.tsx), [apps/web/src/app/groups/[id]/page.tsx](apps/web/src/app/groups/[id]/page.tsx).
- **Issue:** Optional schema types; would feed Knowledge Graph entries.
- **Fix:** Pattern off [event-jsonld.tsx](apps/web/src/app/events/[id]/_components/event-jsonld.tsx).

---

## Verified good

- `metadataBase: new URL('https://pickupvb.com')` in [apps/web/src/app/layout.tsx](apps/web/src/app/layout.tsx) (~L23).
- Title template `'%s · PickupVB'` in root layout.
- Root layout emits `Organization` + `WebSite` JSON-LD with `SearchAction` (sitelinks search box) — all URLs apex.
- All shareable entity pages use `generateMetadata` ([events/[id]](apps/web/src/app/events/[id]/page.tsx), groups, players, teams).
- Descriptions across audited pages are within the 50–160 char sweet spot.
- Canonicals are relative (`'/events'`), so they always resolve against apex `metadataBase`.
- [apps/web/src/app/robots.ts](apps/web/src/app/robots.ts) disallows `/api/`, `/auth/`, `/profile/`, new/edit pages; sitemap URL + Host both point at apex.
- OG image generation routes produce 1200×630 PNGs ([apps/web/src/lib/og-image.tsx](apps/web/src/lib/og-image.tsx)) for root + entity detail pages.
- `<html lang="en">` set ([apps/web/src/app/layout.tsx](apps/web/src/app/layout.tsx) ~L121).
- Twitter cards (`summary_large_image`) on shareable routes.
- Comprehensive `SportsEvent` JSON-LD on event pages ([event-jsonld.tsx](apps/web/src/app/events/[id]/_components/event-jsonld.tsx)): name, startDate/endDate, eventStatus, location (`PostalAddress` + `GeoCoordinates`), organizer, offers, attendeeCapacity — all URLs apex.
- Sitemap reads fresh data on each crawl and excludes draft/cancelled events.
- Profile page correctly `noindex`.

---

## Quick-win bundle

1. **Add `noindex` to the 5 auth-walled pages** (and add a full metadata export for `events/new`). ~10 min.
2. **Add description + canonical + `openGraph` to `groups/page.tsx`** — and the matching `openGraph` to `teams/page.tsx` and `players/page.tsx`. ~20 min.
3. **Extend `sitemap.ts` with teams and players.** ~20 min, duplicates the events/groups query pattern.
4. **Add `apps/web/src/app/not-found.tsx`** with branded nav. ~15 min.
5. **(Cross-listed with performance audit)** Drop `force-dynamic` on public listings. Biggest SEO-leverage fix in the bundle.

---

## Open questions

- ~~Does the **Vercel project's `www` → apex redirect** return 301 (link-equity preserving) or 307/302?~~ **Answered Bundle 54 (2026-05-23):** was 307 (Vercel default); fixed to 308 (permanent, method-preserving) via `next.config.mjs` `redirects()` rule.
- Should **draft/cancelled events** that were previously indexed get `noindex` on their detail pages (not just be omitted from sitemap)? Once Google has the URL, sitemap removal alone won't deindex it.
- Are there any **paid-event JSON-LD `offers.priceCurrency`** edge cases we should validate (multi-currency events, free events with `price: 0`)?
- Is there interest in **slug-based event URLs**? Note the migration cost vs. CTR upside before committing.
- Should we add a **`<link rel="alternate" hreflang="en">`** even though the site is monolingual? Cheap signal of intentional language scope; safe to skip if no i18n plans.

---

## Remediation log

| Date       | Finding                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                       | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-17 | P1: `noindex` on auth-walled pages                    | Added `robots: { index: false, follow: false }` to friends, claim, teams/new, groups/[id]/members; added full metadata export (title + noindex) to events/new and groups/[id]/members.                                                                                                                                                                                                                                       | [friends/page.tsx](../../apps/web/src/app/friends/page.tsx), [claim/page.tsx](../../apps/web/src/app/claim/page.tsx), [teams/new/page.tsx](../../apps/web/src/app/teams/new/page.tsx), [groups/[id]/members/page.tsx](../../apps/web/src/app/groups/[id]/members/page.tsx), [events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx)                                                                                                                                                                                                    |
| 2026-05-17 | P1: Sitemap omits teams + players                     | Added `teams` (slug) and `profiles` (handle) queries mirroring the groups pattern; both included in `dynamicRoutes`.                                                                                                                                                                                                                                                                                                         | [sitemap.ts](../../apps/web/src/app/sitemap.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-05-17 | P1: Groups listing bare metadata                      | Added description, `alternates.canonical: '/groups'`, and full `openGraph` block.                                                                                                                                                                                                                                                                                                                                            | [groups/page.tsx](../../apps/web/src/app/groups/page.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-17 | P2: Listing pages missing `openGraph`                 | Added `openGraph` to teams + players listings (groups covered above).                                                                                                                                                                                                                                                                                                                                                        | [teams/page.tsx](../../apps/web/src/app/teams/page.tsx), [players/page.tsx](../../apps/web/src/app/players/page.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-17 | P2: No root `not-found.tsx`                           | Added branded 404 page with `noindex` + recovery links to events/groups/players/teams/home.                                                                                                                                                                                                                                                                                                                                  | [app/not-found.tsx](../../apps/web/src/app/not-found.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-17 | P2: `force-dynamic` on public listings (cross-listed) | Already addressed in the [performance audit](performance.md) — 🟡 Partial: flag dropped from 7 listed pages; the per-viewer Suspense refactor for the full CDN win is deferred.                                                                                                                                                                                                                                              | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-24 | P3: `BreadcrumbList` JSON-LD on detail pages          | Added shared `BreadcrumbJsonLd` component and wired it into all four detail routes with a 3-segment trail (Home → listing → entity) using absolute URLs per spec.                                                                                                                                                                                                                                                            | [\_components/breadcrumb-jsonld.tsx](../../apps/web/src/app/_components/breadcrumb-jsonld.tsx), [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx), [groups/[id]/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/page.tsx), [players/[id]/page.tsx](../../apps/web/src/app/players/%5Bid%5D/page.tsx), [teams/[id]/page.tsx](../../apps/web/src/app/teams/%5Bid%5D/page.tsx)                                                                                                                                               |
| 2026-05-24 | P3: `SportsTeam` / `SportsOrganization` JSON-LD       | Added `TeamJsonLd` (SportsTeam: name, sport, url, description, numberOfPlayers) and `GroupJsonLd` (SportsOrganization: name, sport, url, description, optional logo + PostalAddress) co-located in each route's `_components/`. Wired into the team and group detail pages next to the existing `BreadcrumbJsonLd`.                                                                                                          | [teams/[id]/\_components/team-jsonld.tsx](../../apps/web/src/app/teams/%5Bid%5D/_components/team-jsonld.tsx), [groups/[id]/\_components/group-jsonld.tsx](../../apps/web/src/app/groups/%5Bid%5D/_components/group-jsonld.tsx), [teams/[id]/page.tsx](../../apps/web/src/app/teams/%5Bid%5D/page.tsx), [groups/[id]/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/page.tsx)                                                                                                                                                                   |
| 2026-05-24 | P2: `/teams/[slug]` login gate vs. sitemap            | Removed the `redirect()` that sent unauthenticated visitors to `/login`. Made `user` optional throughout the handler. Captain-only sections were already gated on `isCaptain`. RLS allows anonymous SELECT on `teams` + `team_members`, so no new data is exposed; crawlers can now reach the JSON-LD shipped in Bundles 18 + 20.                                                                                            | [teams/[id]/page.tsx](../../apps/web/src/app/teams/%5Bid%5D/page.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-05-23 | Open question: `www` → apex redirect status code      | Verified via `curl -I https://www.pickupvb.com/events` that Vercel was issuing **307** (Temporary). Added a `redirects()` rule with `permanent: true` in `next.config.mjs` matching `host: www.pickupvb.com`; Next emits 308 (Permanent, method-preserving), which preserves link equity and updates SERP canonicals. Shadows Vercel's default. Also closed P3 `og:type` as Wontfix in the same bundle.                      | [apps/web/next.config.mjs](../../apps/web/next.config.mjs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-05-31 | P2 #5: `robots.txt` shadows `bracket/watch`           | Changed the rule's `allow` from the string `'/'` to `['/', '/events/*/bracket/watch']`. Longest-match wins, so the spectator subpath + its `/og` route are crawlable + unfurlable while `/events/*/bracket` (host workspace) stays disallowed. Indexing chosen (no page-level `noindex`).                                                                                                                                    | [robots.ts](../../apps/web/src/app/robots.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-05-31 | P2 #6 + P3 #10: sitemap gaps (community + legal)      | Added `/community` to `staticRoutes`, a `community_listings` query (`status in (active, claim_pending)`, slug non-null) appending `/community/<slug>` with `lastModified` from `updated_at`, and the three `/legal/{privacy,terms,refunds}` static routes. Status filter matches the detail page's indexable set so the sitemap never advertises a `noindex` URL.                                                            | [sitemap.ts](../../apps/web/src/app/sitemap.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-05-31 | P3 #8: cancelled/draft events stay indexable          | Broadened the event-detail `generateMetadata` guard from `visibility`-only to `visibility === 'public' && status !== 'draft' && status !== 'cancelled'`; non-indexable now emits `robots: { index: false, follow: true }` (`follow:true` keeps link equity flowing).                                                                                                                                                         | [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-05-31 | P3 #7: `/events/[id]/schedule` un-optimized           | Added a `generateMetadata` (title `Schedule — <event> · PickupVB`, canonical `/events/<id>/schedule`, `openGraph`) reusing the viewer-independent `getEventBracketMeta` read; status-based noindex mirrors P3 #8 (visibility isn't on that read model — like `bracket/watch`, reachability rides RLS + sitemap omission). The `force-dynamic`/viewer-island removal had already landed in the 2026-05-31 performance bundle. | [events/[id]/schedule/page.tsx](../../apps/web/src/app/events/%5Bid%5D/schedule/page.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-31 | P3 #9: community detail OG image + JSON-LD            | Added a tailored `opengraph-image.tsx` (`brandOgImage`, eyebrow "Community listing", date · place) and a `CommunityListingJsonLd` (`SportsEvent`: name, sport, startDate, optional endDate, Place/PostalAddress/geo when present, url) co-located in `_components/`; wired both + the shared `BreadcrumbJsonLd` (Home → Community → listing) into the page, gated on the indexable statuses.                                 | [community/[slug]/opengraph-image.tsx](../../apps/web/src/app/community/%5Bslug%5D/opengraph-image.tsx), [community/[slug]/\_components/community-listing-jsonld.tsx](../../apps/web/src/app/community/%5Bslug%5D/_components/community-listing-jsonld.tsx), [community/[slug]/page.tsx](../../apps/web/src/app/community/%5Bslug%5D/page.tsx)                                                                                                                                                                                                   |
| 2026-06-05 | P3: breadcrumb DRY/footgun (hand-typed apex)          | Reworked `BreadcrumbJsonLd` from an `items` array of pre-built absolute URLs to a relative-path `trail` API: it prepends the implicit Home crumb and absolutizes each `path` against `PROD_APP_URL`. Removes the hand-typed `https://pickupvb.com/...` literal (and trailing-slash drift) from every call site — a typo or domain flip no longer silently voids the rich result. Migrated all 5 existing call sites.         | [\_components/breadcrumb-jsonld.tsx](../../apps/web/src/app/_components/breadcrumb-jsonld.tsx), [events/[id]/\_components/event-structured-data.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-structured-data.tsx), [groups/[id]/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/page.tsx), [players/[id]/page.tsx](../../apps/web/src/app/players/%5Bid%5D/page.tsx), [teams/[id]/page.tsx](../../apps/web/src/app/teams/%5Bid%5D/page.tsx), [community/[slug]/page.tsx](../../apps/web/src/app/community/%5Bslug%5D/page.tsx) |
| 2026-06-05 | P3: breadcrumbs on host-tool pages                    | Added `BreadcrumbJsonLd` (Home → Host tools → _tool_) to the 7 nested, sitemapped, indexable tool landing pages. Leaf `path` matches each page's `/tools/<slug>` canonical.                                                                                                                                                                                                                                                  | [tools/scoreboard/page.tsx](../../apps/web/src/app/tools/scoreboard/page.tsx), [team-randomizer](../../apps/web/src/app/tools/team-randomizer/page.tsx), [scheduler](../../apps/web/src/app/tools/scheduler/page.tsx), [seeding](../../apps/web/src/app/tools/seeding/page.tsx), [standings](../../apps/web/src/app/tools/standings/page.tsx), [rotation](../../apps/web/src/app/tools/rotation/page.tsx), [timer](../../apps/web/src/app/tools/timer/page.tsx)                                                                                  |
| 2026-06-05 | P3: breadcrumbs on event spectator pages              | Added 4-segment trails (Home → Events → _event_ → _surface_) so the sitemap-omitted, transient spectator surfaces link back to the canonical, indexable event page. Leaf `path` matches each page's canonical. Skipped the standalone `/brackets/[id]/watch` (no indexable parent → only a 2-segment Home→self trail).                                                                                                       | [events/[id]/bracket/watch/page.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/watch/page.tsx), [events/[id]/schedule/page.tsx](../../apps/web/src/app/events/%5Bid%5D/schedule/page.tsx)                                                                                                                                                                                                                                                                                                                                                   |

Verification: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green (web 79 tests; lint 0 errors; build 8/8, `/community/-/opengraph-image` route registered). 2026-05-31 bundle.

Verification (2026-06-05 breadcrumb bundle): `pnpm typecheck && pnpm lint && pnpm test` green (typecheck 15/15; lint 0 errors, 3 pre-existing warnings; web 235 tests, 33 files); `pnpm build` green.

## Still open

- **P2 partial:** `force-dynamic` per-viewer Suspense refactor (deferred in performance audit) — the real CDN win. The bracket/schedule spectator pages reached this posture on 2026-05-31 (perf P2 #14); the remaining straggler is full static CDN caching on the listing pages, bounded by viewer/searchParam reads. Tracked in [performance.md](performance.md).
- **P3:** ~~Add `BreadcrumbList` JSON-LD on detail pages (events, groups, players, teams).~~ ✅ Shipped 2026-05-24 (Bundle 18).
- **P3:** Slug-based event URLs (non-trivial migration; discussion-level) — 🟡 Deferred. Would require a `slug` column on `events`, a dual-route handler accepting `/events/[id-or-slug]`, and a 301 from old UUID URLs. Not worth the migration cost without an observed problem (no SEO regression measured; UUID URLs aren't penalized, just less memorable).
- **P3:** ~~`SportsTeam` / `SportsOrganization` JSON-LD on teams + groups pages.~~ ✅ Shipped 2026-05-24 (Bundle 20).
- **P3:** ~~`og:type = 'website'` on event pages.~~ ✅ Closed 2026-05-23 (Bundle 54, Wontfix — JSON-LD `SportsEvent` is the authoritative rich-result signal).
- **Re-audit backlog #5–#10** — ✅ all closed 2026-05-31 (see top-of-doc status update + remediation log).
- **Open questions** above — ~~`www` → apex redirect status code~~ (✅ answered Bundle 54: was 307, fixed to 308), ~~deindex for previously-indexed draft/cancelled events~~ (✅ resolved 2026-05-31, re-audit P3 #8 — status-based `noindex` guard), multi-currency offer JSON-LD edge cases, optional `hreflang` tag.

---

## Reevaluation — 2026-05-30

Full re-audit of `apps/web` against ~6 months of feature growth since the
2026-05-17 pass. New public surface since the original audit: **community
listings** (`/community`, `/community/[slug]`), the **bracket spectator**
view (`/events/[id]/bracket/watch`) and **league schedule**
(`/events/[id]/schedule`) sub-routes, the **scoreboard tool**
(`/tools`, `/tools/scoreboard`), the **stats page** (`/about/numbers`),
and the **legal** pages (`/legal/{privacy,terms,refunds}`). Method:
route-by-route metadata/caching matrix across all 48 `page.tsx` files,
plus `sitemap.ts`, `robots.ts`, the file-convention OG images, and the
root layout.

**Net:** the original backlog is closed and the canonical/metadataBase/
JSON-LD foundation laid in May still holds. New routes are mostly
well-instrumented (see "Improvements" below). Two real gaps and four
nice-to-haves opened.

### P2 findings

#### #5 — `robots.txt` disallow shadows the public bracket-spectator page

- **Where:** [apps/web/src/app/robots.ts#L42](../../apps/web/src/app/robots.ts#L42)
  (`disallow: '/events/*/bracket'`) vs.
  [apps/web/src/app/events/[id]/bracket/watch/page.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/watch/page.tsx).
- **Issue:** `/events/[id]/bracket/watch` is a deliberately-built
  **public, anonymous-viewable spectator page** — its source comment says
  "Anyone with the link can watch," and it ships a `generateMetadata` with
  a canonical, a dedicated OG image **route**
  ([bracket/watch/og/route.ts](../../apps/web/src/app/events/%5Bid%5D/bracket/watch/og/route.ts)),
  a file-convention
  [opengraph-image.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/watch/opengraph-image.tsx),
  a `summary_large_image` Twitter card, and **per-division** preview URLs.
  But `robots.txt` disallows the entire `/events/*/bracket` subtree to
  block the host/captain workspace at `/events/[id]/bracket`. A robots
  `Disallow` is a **prefix** match, so `/events/<id>/bracket/watch` (and
  its `/og` route) are blocked too. Crawlers can't index it **and**
  OG-unfurl bots that honor `robots.txt` — `facebookexternalhit`,
  `LinkedInBot`, `Slackbot`, `Twitterbot` — won't fetch it, so the
  `ShareLink` button's whole point (a rich preview card when someone
  shares the live bracket) silently renders nothing. All of the
  spectator-page SEO/share work is currently dead.
- **Fix:** Add a more-specific `allow` rule alongside the disallow so the
  workspace stays blocked but the spectator subpath + its OG route stay
  reachable (Google/Bing resolve conflicts by **longest match**, so the
  `allow` wins for `/watch`):

  ```ts
  disallow: [ /* … */ '/events/*/bracket' ],
  allow: ['/', '/events/*/bracket/watch'],
  ```

  If you want share-unfurls but **not** Google indexing of every transient
  watch URL, keep the robots `allow` and add page-level
  `robots: { index: false, follow: true }` in the watch `generateMetadata`
  (the page must be crawlable for a `noindex` to be seen — so the robots
  `allow` is required either way). The existing canonical/sitemap-grade
  metadata suggests indexing **is** intended; default to plain `allow`.

- **Verify:** after the change, `curl https://pickupvb.com/robots.txt`
  shows the `Allow: /events/*/bracket/watch` line; Google Search Console's
  robots tester reports `/events/<id>/bracket/watch` as **Allowed** and
  `/events/<id>/bracket` as **Disallowed**.

#### #6 — Community listings are absent from the sitemap

- **Where:** [apps/web/src/app/sitemap.ts](../../apps/web/src/app/sitemap.ts)
  (`staticRoutes` L22–37 and the dynamic block L39–93) — no `/community`
  entry and no `community_listings` query. Detail pages live at
  [community/[slug]/page.tsx](../../apps/web/src/app/community/%5Bslug%5D/page.tsx).
- **Issue:** Community listings are a **public, indexable** content type
  with correct per-page metadata — canonical, `openGraph` (`type:
'article'`), and a conditional `noindex` that only fires for non-`active`
  / non-`claim_pending` statuses
  ([community/[slug]/page.tsx#L42-L65](../../apps/web/src/app/community/%5Bslug%5D/page.tsx#L42-L65)).
  But the sitemap emits **zero** community URLs (listing **or** detail),
  so discovery relies entirely on internal linking. This is the same gap
  the original P1 (#2) fixed for teams + players — the sitemap simply
  hasn't kept pace with the new aggregate.
- **Fix:** In `sitemap.ts`, (1) add `{ url: \`${BASE}/community\`,
  changeFrequency: 'daily', priority: 0.5 }` to `staticRoutes`; (2) add a
  `community_listings` query inside the `try` block (status `active`,
  mirroring the `teamEntries` shape) and append
  `\`${BASE}/community/${slug}\``entries with`lastModified`from`updated_at`. Filter to the same statuses the page treats as indexable
so the sitemap never advertises a `noindex` URL.

### P3 findings

#### #7 — `/events/[id]/schedule` is crawlable but un-optimized

- **Where:** [apps/web/src/app/events/[id]/schedule/page.tsx](../../apps/web/src/app/events/%5Bid%5D/schedule/page.tsx)
  — `export const dynamic = 'force-dynamic'` (L13), **no** metadata export,
  and the route is **not** in `robots.ts` disallow nor in `sitemap.ts`.
- **Issue:** The league-schedule sub-route renders schedule data to anon
  viewers (host/captain affordances are gated on `isRealUser`) but is in a
  half-state: it's crawlable, yet falls through to the root title template
  (no per-page title/canonical/OG) and opts out of CDN caching. It's now
  the **only public-reachable page still carrying `force-dynamic`** — a
  small CWV/crawl-efficiency drag and a thin, un-shareable result if
  indexed.
- **Fix — pick one based on intent:**
  - **Public spectator surface** (parallels `bracket/watch`): add a
    `generateMetadata` (title, `alternates.canonical:
\`/events/${id}/schedule\``, `openGraph`) and **drop `force-dynamic`**
— it reads the same RLS-public data `bracket/watch` reads without
    opting out of caching.
  - **Host-facing surface:** add `'/events/*/schedule'` to the `robots.ts`
    disallow list and a `robots: { index: false, follow: false }` metadata
    export, matching `/events/*/bracket`.

#### #8 — Public-but-cancelled/draft event pages stay indexable (re-surfaces the standing open question)

- **Where:** [apps/web/src/app/events/[id]/page.tsx#L42-L54](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L42-L54)
  — `const isPublic = event.visibility === 'public'` then
  `...(isPublic ? {} : { robots: { index: false, follow: false } })`.
- **Issue:** The `noindex` guard keys on **visibility only**. A
  `visibility: 'public'` event whose `status` is `cancelled` or `draft` is
  excluded from the sitemap (good) but still returns `index: true`. Sitemap
  removal alone won't deindex a URL Google already has, so a previously-
  indexed (or externally-linked) **cancelled** event lingers in SERPs — a
  poor result: the searcher clicks through to an event that isn't
  happening. This is the long-standing open question, now concrete enough
  to action.
- **Fix:** Broaden the guard to status:

  ```ts
  const indexable =
    event.visibility === 'public' &&
    event.status !== 'draft' &&
    event.status !== 'cancelled';
  // …
  ...(indexable ? {} : { robots: { index: false, follow: true } }),
  ```

  Use `follow: true` so any links on the cancelled page still pass equity.

#### #9 — Community detail pages lack a tailored OG image and Event JSON-LD

- **Where:** [community/[slug]/page.tsx](../../apps/web/src/app/community/%5Bslug%5D/page.tsx)
  — the `openGraph` block sets no `images`, there is **no**
  `opengraph-image.tsx` under `community/`, and the page renders no
  structured data (`grep` for `ld+json` in `community/` → none).
- **Issue:** Every other entity type ships a custom OG card
  ([events/[id]/opengraph-image.tsx](../../apps/web/src/app/events/%5Bid%5D/opengraph-image.tsx),
  teams, groups, players) **and** JSON-LD (`SportsEvent` / `SportsTeam` /
  `SportsOrganization` / `BreadcrumbList`). Community listings — which
  represent real volleyball events — fall back to the generic root
  [opengraph-image.tsx](../../apps/web/src/app/opengraph-image.tsx) card and
  carry no rich-result signal. Functional, just below the bar the rest of
  the catalog sets.
- **Fix:** Add a `community/[slug]/opengraph-image.tsx` (pattern off the
  events one) and a minimal `Event` JSON-LD block (`name`, `startDate`,
  `location`, `url`) co-located in `_components/`, mirroring
  [event-jsonld.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-jsonld.tsx).
  A `BreadcrumbList` (Home → Community → listing) via the shared
  [breadcrumb-jsonld.tsx](../../apps/web/src/app/_components/breadcrumb-jsonld.tsx)
  is a one-liner while you're there.

#### #10 — Legal pages omitted from the sitemap

- **Where:** [sitemap.ts#L22-L37](../../apps/web/src/app/sitemap.ts#L22-L37)
  `staticRoutes` — no entries for
  [legal/privacy](../../apps/web/src/app/legal/privacy/page.tsx),
  [legal/terms](../../apps/web/src/app/legal/terms/page.tsx),
  [legal/refunds](../../apps/web/src/app/legal/refunds/page.tsx).
- **Issue:** Public, stable, indexable pages with proper metadata, but not
  advertised in the sitemap. Minor crawl-discovery gap (they're footer-
  linked, so Google finds them anyway), but trivial to close.
- **Fix:** Append the three `/legal/*` URLs to `staticRoutes` with
  `changeFrequency: 'yearly', priority: 0.2`.

### Improvements since 2026-05-17 (verified good)

- **`force-dynamic` is gone from every primary indexable surface.** Home,
  `/events`, `/players`, `/teams`, `/groups`, `/pricing`, and
  `/events/[id]` no longer opt out of caching (the 2026-05-17 P2, now
  effectively resolved — `/events/[id]/schedule` is the lone straggler,
  see P3 #7). The remaining `force-dynamic` flags sit on `noindex`/private
  routes (new/edit/profile/claim), where they carry no SEO cost.
- **New routes ship correct metadata out of the box:** community listing +
  detail (canonical + `openGraph` + conditional `noindex`), `bracket/watch`
  (canonical + OG image route + Twitter + per-division), `/about/numbers`
  (canonical + OG + `revalidate: 1800` ISR), legal + `/tools` +
  `/tools/scoreboard` (titles + descriptions), `/s/[code]` and `/e/[code]`
  (**308** permanent redirect to the canonical `/events/<id>`, so QR/share
  link equity is preserved).
- **`robots.ts` kept pace with most new private surfaces** — now disallows
  `/login`, `/forgot-password`, `/reset-password`, `/claim`, `/sentry-test`,
  the ephemeral `/tools/scoreboard/*` rooms, `/s/`, and the new/edit/bracket
  per-entity subroutes. (Gaps: the `bracket/watch` over-block in P2 #5 and
  the un-addressed `/events/*/schedule` in P3 #7.)
- **Non-prod hosts are fully walled off** — `sitemap.ts` returns `[]` and
  `robots.ts` returns `Disallow: /` for any non-prod host
  ([sitemap.ts#L20](../../apps/web/src/app/sitemap.ts#L20),
  [robots.ts#L12-L17](../../apps/web/src/app/robots.ts#L12-L17)), so
  `dev.pickupvb.com` / Vercel previews can't leak duplicate content into
  the index.
- **Auth client pages** (`/login`, `/forgot-password`, `/reset-password`)
  are client components that can't export `metadata`, but `robots.txt`
  already disallows all three — the correct mechanism here (a `noindex`
  would require the page to stay crawlable, which we don't want). No action.
- The root layout's `Organization` + `WebSite` JSON-LD (with `SearchAction`),
  `metadataBase`, title template, keywords, and self-referential canonical
  `/` are all intact and apex-correct
  ([layout.tsx](../../apps/web/src/app/layout.tsx)).

### Re-audit backlog (carry-forward)

| #   | Grade | Finding                                                          | Status        |
| --- | ----- | ---------------------------------------------------------------- | ------------- |
| 5   | P2    | `robots.txt` shadows public `bracket/watch` spectator page       | ✅ 2026-05-31 |
| 6   | P2    | Community listings absent from sitemap                           | ✅ 2026-05-31 |
| 7   | P3    | `/events/[id]/schedule` crawlable + `force-dynamic`, no metadata | ✅ 2026-05-31 |
| 8   | P3    | Public cancelled/draft event pages stay indexable                | ✅ 2026-05-31 |
| 9   | P3    | Community detail: no tailored OG image / Event JSON-LD           | ✅ 2026-05-31 |
| 10  | P3    | Legal pages omitted from sitemap                                 | ✅ 2026-05-31 |

> **All cleared 2026-05-31** (see top-of-doc status update + remediation log).
> P3 #7's caching/viewer-island half had already landed in the 2026-05-31
> performance bundle; this bundle added the SEO metadata layer on top.
