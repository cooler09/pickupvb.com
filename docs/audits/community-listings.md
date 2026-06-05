# Community listings — feature audit

Scope: the public community-listings surface (`/community`, `/community/[slug]`,
submit/edit forms) and the admin bulk importer (`/admin/community-import`),
down through the application handlers, the `CommunityListing` aggregate, the
Supabase adapter, and the migrations.

**Status: 2026-06-05 — initial audit. 3 P1 · 6 P2 · 5 P3.**
The feature is well-built end-to-end (typed errors, idempotent importer,
timezone anchoring, SEO/OG/JSON-LD, belt-and-suspenders claim index), but it
shipped the same class of visibility leak as the (now-fixed) event-detail read,
the claim feature's advertised outcome was a no-op, and the JSON-LD embed was a
stored-XSS vector that arbitrary users could reach.

**Remediation update — 2026-06-05 (verified quad-green: typecheck/lint/test/build):**
Fixed **all 3 P1** + **CL-5 / CL-6 / CL-8 / CL-9** (P2) + **CL-10 / CL-11 /
CL-13 / CL-14** (P3). Still open: **CL-4** (claim notifications + auto-approve —
Stage B feature), **CL-7** (location / near-me discovery — new UI), **CL-12**
(anonymous CDN caching — P3). Remediation log at the bottom of this file.

---

## P1 — fix before next deploy

### CL-1 · Hidden / removed listings are fully readable by anyone via the detail URL

The adapter reads through the **service-role admin client**
(`createSupabaseAdminClient()`), so RLS never applies; status scoping is purely
whatever the query asks for. `getDetail()` applies **no status filter**
([supabase-community-listing-repository.ts#L386-L462](../../packages/infrastructure/src/supabase-community-listing-repository.ts#L386-L462)),
and the detail page only branches on status _for managers_
(`showHiddenWarning = (hidden||removed) && canManage`) — there is no
`notFound()` for a non-manager
([page.tsx#L156-L183](../../apps/web/src/app/community/[slug]/page.tsx#L156-L183)).

Result: a listing auto-hidden after 3 reports (the spam/abuse path) — or one an
admin explicitly `remove()`d — still renders in full (title, description,
outbound link) to anyone who has or guesses the slug. The list view is safe
(`search` defaults to `['active']`), so "hide" _looks_ like it works while doing
nothing against direct access. Same class as the fixed event-detail leak
(security P1 #14).

**Fix:** gate by status in the read path. Compute `canManage` first and return
`null` (→ `notFound()`) for `hidden`/`removed` rows when the viewer can't manage
them. Keep `active` and `claim_pending` public; handle `claimed` per CL-2.

### CL-2 · Approving a claim never redirects the listing to the PickupVB event

The whole claim flow promises "We'll point visitors at your event page … instead
of the external site"
([page.tsx#L406](../../apps/web/src/app/community/[slug]/page.tsx#L406)) and
"Approve to redirect this listing to that event"
([page.tsx#L291](../../apps/web/src/app/community/[slug]/page.tsx#L291)). But the
detail page has **no `claimed` branch**: it never redirects to `/events/{slug}`,
and the outbound-link section still renders the _external_ URL. `claimedEventId`
is stored and returned in the read model but is consumed nowhere for navigation.

A claimed listing is therefore strictly worse than an active one — it's
`noindex`'d ([generateMetadata#L67-L71](../../apps/web/src/app/community/[slug]/page.tsx#L67-L71)),
offers no path to the event, and still sends visitors off-platform. The
advertised result of approving a claim does not happen.

**Fix:** when `detail.status === 'claimed'` and `claimedEventId` resolves to an
event slug, `redirect('/events/{slug}')` (308 permanent) from the detail page —
or, at minimum, replace the external CTA with the on-platform event link.
File: [page.tsx#L152-L242](../../apps/web/src/app/community/[slug]/page.tsx#L152-L242).

### CL-3 · Stored XSS via `</script>` in JSON-LD (community title is attacker-controllable)

`CommunityListingJsonLd` embeds `JSON.stringify(data)` directly into a
`<script type="application/ld+json">` via `dangerouslySetInnerHTML`
([community-listing-jsonld.tsx#L68-L74](../../apps/web/src/app/community/[slug]/_components/community-listing-jsonld.tsx#L68-L74)).
`JSON.stringify` does **not** escape `<` / `>`, so a community title like

```
Beach night </script><script>alert(document.cookie)</script>
```

closes the ld+json block early and executes attacker script in the victim's
`pickupvb.com` session. Titles pass through `maskPublicText` (profanity masking
only — **not** HTML-escaping). Community listings are the lowest-friction
injection vector on the platform: any signed-in non-anon user can submit one,
and the script renders for every visitor of the (indexable) detail page.

This is a **repo-wide pattern** — `event-jsonld.tsx`
([#L106](../../apps/web/src/app/events/[id]/_components/event-jsonld.tsx#L106))
and `breadcrumb-jsonld.tsx`
([#L29](../../apps/web/src/app/_components/breadcrumb-jsonld.tsx#L29)) serialize
the same unescaped way — so fix it once and reuse.

**Fix:** add a shared `jsonLdScript(data)` helper that escapes `<` (and the
line/paragraph separators U+2028 / U+2029) to their `\uXXXX` forms before
embedding — `JSON.stringify(data).replace(/</g, '\\u003c')` (plus the two
separators) — and route all JSON-LD components through it.
(Cross-reference: also log in [security.md](security.md).)

---

## P2 — schedule next sprint

### CL-4 · No pending-claim notification + no auto-approve → claims stall; importer makes the admin the approver for everything

Stage B (notification kinds + 7-day auto-approve cron) was explicitly deferred
in the migration preamble
([20260613000000](../../supabase/migrations/20260613000000_community_listings_claim_pending_status.sql#L19)).
Today a host files a claim → the listing goes `claim_pending` → **the submitter
is never notified**; they only discover it by revisiting the page. Worse, every
admin-bulk-imported listing has `submitter_user_id = <admin>`, so _every_ claim
on an imported listing requires the admin to manually notice and approve it. At
import-hundreds scale that queue is invisible and unworkable.

**Fix:** implement Stage B — emit a notification to the submitter on
`proposeClaim`, plus a cron that auto-approves claims older than N days (and/or
auto-approves claims on admin-submitted listings, since the admin has no
organizer stake). Minimum viable: an admin review queue listing all
`claim_pending` rows. Files:
[listing-actions.ts#L148-L168](../../apps/web/src/app/community/[slug]/listing-actions.ts#L148-L168),
[community-listing.handler.ts#L215-L256](../../packages/application/src/commands/community-listing.handler.ts#L215-L256).

### CL-5 · `search`'s `viewerId` is dead code; submitters can't find their own hidden listings

The port documents `viewerId` as "so submitters can see their own hidden
listings"
([community-listing-repository.ts#L61](../../packages/domain/src/community-listings/community-listing-repository.ts#L61)),
and the page plumbs `user.id` through
([page.tsx#L59](../../apps/web/src/app/community/page.tsx#L59)) — but
`SupabaseCommunityListingRepository.search` **never reads `query.viewerId`**
(neither the table query nor the geo RPC), and statuses always default to
`['active']`
([supabase-community-listing-repository.ts#L266-L342](../../packages/infrastructure/src/supabase-community-listing-repository.ts#L266-L342)).
So a submitter whose listing was auto-hidden has no list affordance to find it.
The port comment "Admins see all via RLS" is also misleading — the admin
_client_ bypasses RLS, so status scoping is the explicit `.in('status', …)`,
not a policy.

**Fix:** either delete the unused param + comment, or honor it — when
`viewerId` is set, widen the predicate to
`status = 'active' OR submitter_user_id = viewerId` so owners see their own
hidden rows.

### CL-6 · `/community` list has no pagination and is hard-capped at 60

`CommunityListingsPage` loads `limit: 60` and renders every row with no
`Pagination`
([page.tsx#L58-L68](../../apps/web/src/app/community/page.tsx#L58-L68)),
violating pattern #12 (paginate unbounded lists). The 61st upcoming/past listing
silently disappears, and the "Past" tab grows without bound over time.

**Fix:** page via the shared `Pagination` component. The port already exposes
`limit`/`cursor`, though `cursor` is currently unimplemented in the adapter
([supabase-community-listing-repository.ts#L266](../../packages/infrastructure/src/supabase-community-listing-repository.ts#L266))
— add offset or keyset paging there.

### CL-7 · No location / "near me" / keyword discovery, despite full backend support

The list page filters only by surface / format / skill / when
([page.tsx#L132-L193](../../apps/web/src/app/community/page.tsx#L132-L193)). The
geo search RPC and `near` / `distanceKm` plumbing are fully built
([search RPC](../../supabase/migrations/20260601000000_search_community_listings_rpc.sql),
[adapter geo branch](../../packages/infrastructure/src/supabase-community-listing-repository.ts#L273-L330))
but unreachable from the UI. Community listings are inherently a "find pickup
near me" product; with no location filter the page doesn't deliver that, and
there's no title/keyword search either.

**Fix:** add a location/radius filter (reuse the events find-page "near me" UI)
wired to the `near` query, and optionally a text search.

### CL-8 · Rate-limit count includes removed/hidden listings

`countByUserSince` counts **all** of a user's rows in the window regardless of
status
([supabase-community-listing-repository.ts#L235-L242](../../packages/infrastructure/src/supabase-community-listing-repository.ts#L235-L242)),
while the port comment says "how many **active** submissions"
([repository.ts#L34-L35](../../packages/domain/src/community-listings/community-listing-repository.ts#L34-L35)).
A user whose spam was removed still burns their 5/day quota and can't resubmit a
wrongly-removed listing.

**Fix:** decide intent and align comment + query (likely `.neq('status','removed')`).

### CL-9 · Hand-rolled button classes on the detail page bypass the CTA vocabulary (pattern #11)

Approve (`border-green-300 bg-green-100…`,
[page.tsx#L296-L298](../../apps/web/src/app/community/[slug]/page.tsx#L296-L298)),
Reject (`border-red-300 bg-red-50…`,
[#L301-L303](../../apps/web/src/app/community/[slug]/page.tsx#L301-L303)), and
Claim (`border-primary/40 bg-primary/10…`,
[#L467-L469](../../apps/web/src/app/community/[slug]/page.tsx#L467-L469)) hand-roll
class strings instead of the shared CTA helpers. They're inline literals so they
dodge the `no-restricted-syntax` ratchet, but they drift from M3. (Report
already uses `errorTonalButtonClass` — match that.)

**Fix:** route through `primaryButtonClass` / `neutralButtonClass` /
`errorTonalButtonClass` (+ a success variant for Approve).

---

## P3 — opportunistic

### CL-10 · Notice banner uses `role="status"` even for errors

`noticeBanner` always renders `role="status"` (polite), including
`claimfail` / `notallow` / `notfound` / `error`
([page.tsx#L117-L121](../../apps/web/src/app/community/[slug]/page.tsx#L117-L121)).
Error tones should be `role="alert"` (assertive) for screen-reader users.

### CL-11 · Claimed listings can be hard-deleted, orphaning the claim

`DeleteCommunityListingHandler` → `repo.delete()` is a hard `DELETE` that
bypasses the aggregate's `remove()` guard ("Claimed listings cannot be
removed")
([community-listing.handler.ts#L149-L162](../../packages/application/src/commands/community-listing.handler.ts#L149-L162),
[community-listing.ts#L313-L318](../../packages/domain/src/community-listings/community-listing.ts#L313-L318)).
Low impact (FK is `on delete set null`) but inconsistent with the stated
invariant.

**Fix:** block delete (or downgrade to `remove()`) when status is `claimed`,
admin override aside.

### CL-12 · Public list + detail pages are fully dynamic (no CDN caching)

Both read `cookies()` via `getCurrentUser`, so every anonymous visitor gets an
uncached SSR render of largely public, SEO-targeted content. Consider an
anonymous cached path (`revalidate` + tag-bust from the mutating actions, which
already call `revalidatePath('/community')` and `…/[slug]`). Aligns with the
spirit of pattern #3.

### CL-13 · Filtered list permutations are indexable

`?when=past&surface=sand` etc. render indexable HTML that all canonicalize to
`/community`
([page.tsx#L21-L33](../../apps/web/src/app/community/page.tsx#L21-L33)) — good
de-dup, but crawlers can still spend budget on thin filter permutations.
Consider `noindex` on any filtered/paged variant.

### CL-14 · Importer "updated" result doesn't say the row is still hidden

`importAction` updates `hidden` listings in place and reports
`action: 'updated'` with no hint that the listing remains hidden (it won't
reappear publicly until unhidden)
([actions.ts#L54-L75](../../apps/web/src/app/admin/community-import/actions.ts#L54-L75)).
Add a flag (like the existing `geocoded` one) so the admin sees "updated — still
hidden".

---

## What's solid (don't regress)

- **Typed domain errors throughout** — `RateLimitError`, `ConflictError`,
  `UnauthorizedError`, `NotFoundError`, `ValidationError` map cleanly at the
  boundary; no string-throwing.
- **Admin re-check on every importer action** — `requireAdmin()` re-verifies
  platform-admin per action, not just the page guard
  ([actions.ts#L27-L31](../../apps/web/src/app/admin/community-import/actions.ts#L27-L31)).
- **Idempotent importer** — upsert-on-`external_url` so re-running one
  `community-listings.json` converges instead of duplicating; non-editable
  (claimed/removed/pending) rows are skipped, not clobbered.
- **Geocode-miss is non-fatal for bulk import** — keeps the text address, stores
  no point, flags the row; the manual form still forces a fix.
- **Timezone anchoring** — `zonedWallClockToUtc` + `timeZoneForCoords` avoid the
  naive-wall-clock-in-UTC bug; the same-day/same-city claim match compares in the
  venue zone.
- **Claim integrity** — unique partial index on `claimed_event_id` is
  belt-and-suspenders behind the app-layer match check; server enforces the
  match independent of the UI filter.
- **SEO** — canonical, `SportsEvent` JSON-LD, tailored OG card, breadcrumbs, and
  `noindex` on non-public statuses (modulo the CL-3 escaping bug).

---

## Remediation log

### 2026-06-05 — P1s + quick-win P2/P3 (quad-green)

Bundle landed uncommitted; `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass.

- **CL-1** — `getDetail` now returns `null` for `hidden`/`removed` rows unless
  the viewer can manage them, closing the service-role read leak across the
  detail page, `generateMetadata`, and the OG image in one place.
  [supabase-community-listing-repository.ts](../../packages/infrastructure/src/supabase-community-listing-repository.ts).
- **CL-2** — the detail page `permanentRedirect`s a `claimed` listing to its
  linked event (`/events/{slug}`, id fallback). Side effect: the manage/delete
  UI for claimed listings is now unreachable from the community side (intended —
  they live as events).
  [community/[slug]/page.tsx](../../apps/web/src/app/community/[slug]/page.tsx).
- **CL-3** — new shared `JsonLd` / `jsonLdString` escaping the `<` and U+2028 /
  U+2029 break-out sequences; all five JSON-LD components route through it.
  Regression test in
  [json-ld.test.ts](../../apps/web/src/components/json-ld.test.ts).
  [components/json-ld.tsx](../../apps/web/src/components/json-ld.tsx).
- **CL-5** — non-geo `search` honors `viewerId`: active listings + the viewer's
  own `hidden` rows (UUID-guarded `.or()`), with a "Hidden — only you" card
  badge. (Geo RPC path still active-only; not UI-wired — folded into CL-7.)
- **CL-6** — `/community` paginates via the shared `Pagination` (24/page,
  in-memory slice of a 120-row window). Removes the silent 60-row cap; keyset
  paging deferred until volume exceeds the window.
- **CL-8** — `countByUserSince` excludes `removed` rows (port doc updated).
- **CL-9** — Approve/Reject/Claim buttons route through `primaryButtonClass` /
  `errorTonalButtonClass`.
- **CL-10** — error-tone notice banner uses `role="alert"`.
- **CL-11** — `DeleteCommunityListingHandler` blocks hard-deleting a `claimed`
  listing for non-admins (`ConflictError`, mapped to a flash notice).
- **CL-13** — list page `generateMetadata` noindexes filtered / paged / past-tab
  permutations (still `follow: true`, canonical `/community`).
- **CL-14** — importer reports `hidden: true` on updates to an already-hidden
  row and the client renders a "still hidden" note.

### Still open

- **CL-4** — needs the notification subsystem + a cron + likely a migration, and
  carries product decisions (auto-approve after N days? auto-approve
  admin-submitted listings?). Deferred pending direction.
- **CL-7** — backend (`near` / geo RPC) exists; needs the location-picker UI and
  the page→handler wiring. Should reuse the events find-page "near me" control.
- **CL-12** — P3; anonymous CDN caching of the cookie-dependent list/detail
  pages carries read-your-own-writes risk for a nice-to-have. Deferred.
