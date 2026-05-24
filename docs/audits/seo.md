# SEO audit — 2026-05-17

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

| Date       | Finding                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                  | Files                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-17 | P1: `noindex` on auth-walled pages                    | Added `robots: { index: false, follow: false }` to friends, claim, teams/new, groups/[id]/members; added full metadata export (title + noindex) to events/new and groups/[id]/members.                                                                                                                                                                                                                  | [friends/page.tsx](../../apps/web/src/app/friends/page.tsx), [claim/page.tsx](../../apps/web/src/app/claim/page.tsx), [teams/new/page.tsx](../../apps/web/src/app/teams/new/page.tsx), [groups/[id]/members/page.tsx](../../apps/web/src/app/groups/[id]/members/page.tsx), [events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx)                                                      |
| 2026-05-17 | P1: Sitemap omits teams + players                     | Added `teams` (slug) and `profiles` (handle) queries mirroring the groups pattern; both included in `dynamicRoutes`.                                                                                                                                                                                                                                                                                    | [sitemap.ts](../../apps/web/src/app/sitemap.ts)                                                                                                                                                                                                                                                                                                                                                    |
| 2026-05-17 | P1: Groups listing bare metadata                      | Added description, `alternates.canonical: '/groups'`, and full `openGraph` block.                                                                                                                                                                                                                                                                                                                       | [groups/page.tsx](../../apps/web/src/app/groups/page.tsx)                                                                                                                                                                                                                                                                                                                                          |
| 2026-05-17 | P2: Listing pages missing `openGraph`                 | Added `openGraph` to teams + players listings (groups covered above).                                                                                                                                                                                                                                                                                                                                   | [teams/page.tsx](../../apps/web/src/app/teams/page.tsx), [players/page.tsx](../../apps/web/src/app/players/page.tsx)                                                                                                                                                                                                                                                                               |
| 2026-05-17 | P2: No root `not-found.tsx`                           | Added branded 404 page with `noindex` + recovery links to events/groups/players/teams/home.                                                                                                                                                                                                                                                                                                             | [app/not-found.tsx](../../apps/web/src/app/not-found.tsx)                                                                                                                                                                                                                                                                                                                                          |
| 2026-05-17 | P2: `force-dynamic` on public listings (cross-listed) | Already addressed in the [performance audit](performance.md) — 🟡 Partial: flag dropped from 7 listed pages; the per-viewer Suspense refactor for the full CDN win is deferred.                                                                                                                                                                                                                         | n/a                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-05-24 | P3: `BreadcrumbList` JSON-LD on detail pages          | Added shared `BreadcrumbJsonLd` component and wired it into all four detail routes with a 3-segment trail (Home → listing → entity) using absolute URLs per spec.                                                                                                                                                                                                                                       | [\_components/breadcrumb-jsonld.tsx](../../apps/web/src/app/_components/breadcrumb-jsonld.tsx), [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx), [groups/[id]/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/page.tsx), [players/[id]/page.tsx](../../apps/web/src/app/players/%5Bid%5D/page.tsx), [teams/[id]/page.tsx](../../apps/web/src/app/teams/%5Bid%5D/page.tsx) |
| 2026-05-24 | P3: `SportsTeam` / `SportsOrganization` JSON-LD       | Added `TeamJsonLd` (SportsTeam: name, sport, url, description, numberOfPlayers) and `GroupJsonLd` (SportsOrganization: name, sport, url, description, optional logo + PostalAddress) co-located in each route's `_components/`. Wired into the team and group detail pages next to the existing `BreadcrumbJsonLd`.                                                                                     | [teams/[id]/\_components/team-jsonld.tsx](../../apps/web/src/app/teams/%5Bid%5D/_components/team-jsonld.tsx), [groups/[id]/\_components/group-jsonld.tsx](../../apps/web/src/app/groups/%5Bid%5D/_components/group-jsonld.tsx), [teams/[id]/page.tsx](../../apps/web/src/app/teams/%5Bid%5D/page.tsx), [groups/[id]/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/page.tsx)                     |
| 2026-05-24 | P2: `/teams/[slug]` login gate vs. sitemap            | Removed the `redirect()` that sent unauthenticated visitors to `/login`. Made `user` optional throughout the handler. Captain-only sections were already gated on `isCaptain`. RLS allows anonymous SELECT on `teams` + `team_members`, so no new data is exposed; crawlers can now reach the JSON-LD shipped in Bundles 18 + 20.                                                                       | [teams/[id]/page.tsx](../../apps/web/src/app/teams/%5Bid%5D/page.tsx)                                                                                                                                                                                                                                                                                                                              |
| 2026-05-23 | Open question: `www` → apex redirect status code      | Verified via `curl -I https://www.pickupvb.com/events` that Vercel was issuing **307** (Temporary). Added a `redirects()` rule with `permanent: true` in `next.config.mjs` matching `host: www.pickupvb.com`; Next emits 308 (Permanent, method-preserving), which preserves link equity and updates SERP canonicals. Shadows Vercel's default. Also closed P3 `og:type` as Wontfix in the same bundle. | [apps/web/next.config.mjs](../../apps/web/next.config.mjs)                                                                                                                                                                                                                                                                                                                                         |

Verification: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green (Bundle 54).

## Still open

- **P2 partial:** `force-dynamic` per-viewer Suspense refactor (deferred in performance audit) — the real CDN win.
- **P3:** ~~Add `BreadcrumbList` JSON-LD on detail pages (events, groups, players, teams).~~ ✅ Shipped 2026-05-24 (Bundle 18).
- **P3:** Slug-based event URLs (non-trivial migration; discussion-level) — 🟡 Deferred. Would require a `slug` column on `events`, a dual-route handler accepting `/events/[id-or-slug]`, and a 301 from old UUID URLs. Not worth the migration cost without an observed problem (no SEO regression measured; UUID URLs aren't penalized, just less memorable).
- **P3:** ~~`SportsTeam` / `SportsOrganization` JSON-LD on teams + groups pages.~~ ✅ Shipped 2026-05-24 (Bundle 20).
- **P3:** ~~`og:type = 'website'` on event pages.~~ ✅ Closed 2026-05-23 (Bundle 54, Wontfix — JSON-LD `SportsEvent` is the authoritative rich-result signal).
- **Open questions** above — ~~`www` → apex redirect status code~~ (✅ answered Bundle 54: was 307, fixed to 308), deindex for previously-indexed draft/cancelled events, multi-currency offer JSON-LD edge cases, optional `hreflang` tag.
