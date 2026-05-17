# Performance Audit

**Date:** 2026-05-17
**Scope:** `pickupvb.com` workspace. Next.js 16 App Router, Supabase Postgres,
Vercel runtime. Read-only static review — no profiling, no production
traces. Latency estimates are educated guesses; treat them as relative,
not absolute. Confirm with Vercel Analytics + Supabase slow-query log
before/after each fix.

---

## P1 — biggest impact

### 1. `dynamic = 'force-dynamic'` on public pages disables CDN caching

**Files:**
- [apps/web/src/app/events/page.tsx](../../apps/web/src/app/events/page.tsx#L25)
- [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L26)
- [apps/web/src/app/players/page.tsx](../../apps/web/src/app/players/page.tsx#L10)
- [apps/web/src/app/players/[id]/page.tsx](../../apps/web/src/app/players/[id]/page.tsx#L10)
- [apps/web/src/app/groups/page.tsx](../../apps/web/src/app/groups/page.tsx#L8)
- [apps/web/src/app/groups/[id]/page.tsx](../../apps/web/src/app/groups/[id]/page.tsx#L8)
- [apps/web/src/app/teams/page.tsx](../../apps/web/src/app/teams/page.tsx#L9)

**Category:** Caching / revalidation

Every visitor cold-hits Supabase + does 8–12 parallel queries per pageview.
Public listings and detail pages don't change frequently enough to justify
this.

**Fix:** drop `force-dynamic`; use ISR (`export const revalidate = 60`) and
call `revalidatePath()` from join/leave/edit actions. The auth-aware bits
(viewer's RSVP state, "Manage" button) belong inside a small Suspense
boundary or a Client Component that fetches per-user state separately.

**Caveat:** Next.js 16 already auto-marks routes dynamic when they read
`cookies()` or `headers()`, so the net win on signed-in pageviews is
smaller than it looks. The big win is anonymous visitor pageviews
(SEO crawlers, share-link clicks, OG previews).

### 2. `dynamic = 'force-dynamic'` on private pages

**Files:** [apps/web/src/app/profile/page.tsx](../../apps/web/src/app/profile/page.tsx#L16), [apps/web/src/app/profile/notifications/page.tsx](../../apps/web/src/app/profile/notifications/page.tsx#L7)
**Category:** Caching / revalidation

Profile pages call `getServerSupabase()` → `cookies()`, so they're already
dynamic. The `force-dynamic` flag is redundant. Remove it for clarity;
no behavioral change expected but it makes the codebase's caching story
honest.

### 3. Web-push fanout is sequential

**File:** [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L97)
**Category:** Web push / sequential await

```ts
for (const sub of list) { await sendWebPush(...) }
```

If a user has 3 devices that's 3× the latency. At 100+ devices the worker
hits the `maxDuration = 60s` ceiling and drops notifications.

**Fix:** `await Promise.allSettled(list.map(sub => sendWebPush(...)))`.
Collect errors after; still prune dead subscriptions on 404/410. Reduces
per-notification latency from O(n) to O(1).

### 4. Event detail page does ~14 DB roundtrips

**Files:**
- [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L115)
- [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts#L303)

**Category:** N+1 queries

`getDetail()` does two rounds of `Promise.all()`: 6 queries, then 8 more
(co-hosts, attendees, teams, captains). Parallelized within each round but
the round-trip count itself is high. Estimated ~300–800 ms total when
Postgres is warm.

**Fix:** collapse co-host + profile fetch into one query with `JOIN
profiles`, batch captain fetches by team id list, consider a view or RPC
for the whole detail bundle. Aim for ≤3 queries.

---

## P2 — important

### 5. Missing composite index on `event_attendees(event_id, payment_status)`

**File:** scan of [supabase/migrations/](../../supabase/migrations/)
**Category:** Missing DB index

Event detail filters `event_attendees` by `(event_id, payment_status)`. Only
`event_id` is indexed. Sequential scan over a few hundred attendees on
large paid events.

**Fix:**

```sql
CREATE INDEX event_attendees_event_payment_idx
  ON event_attendees (event_id, payment_status);
```

### 6. Leaflet marker icons loaded from `unpkg.com`

**File:** [apps/web/src/components/event-map.tsx](../../apps/web/src/components/event-map.tsx#L7-L13)
**Category:** External call latency

Marker icon PNGs fetched cross-origin from `https://unpkg.com/leaflet@1.9.4/...`
on every map render. No control over caching headers.

**Fix:** copy the three marker PNGs into `apps/web/public/leaflet/` and
point Leaflet's `iconUrl` / `iconRetinaUrl` / `shadowUrl` there.

### 7. Push subscriptions queried per notification

**File:** [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L82)
**Category:** N+1

Worker iterates up to 50 outbox rows; for each, queries
`push_subscriptions` by `user_id`. If 30 of those go to the same user it's
30 redundant lookups.

**Fix:** pre-fetch `push_subscriptions` for the distinct user-id set at
worker startup, then look up in a `Map<userId, subs[]>` during the loop.

### 8. Payment-status map built in JS instead of SQL

**File:** [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L140)
**Category:** N+1 / DB inefficiency

Fetches the entire `event_attendees` row set for the event, then loops in
JS to build `Map<userId, status>`. Wasted bandwidth + JS time.

**Fix:** narrow the select to `(user_id, payment_status)` and do the
lookup directly off the returned array. For very large events, push the
join into the same query that fetched attendees in the first place.

### 9. Stripe webhook dedupe relies on unique-violation exception

**File:** [apps/web/src/app/api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts#L60)
**Category:** External call latency

Insert-then-catch `23505` works but the exception path costs ~5–20 ms each
retry.

**Fix:** use `upsert({ ... }, { onConflict: 'id', ignoreDuplicates: true })`
or a `SELECT … FOR UPDATE` check first. Minor but cheap.

### 10. Geocode fallback waits for Photon before trying Nominatim

**File:** [apps/web/src/app/api/geocode/autocomplete/route.ts](../../apps/web/src/app/api/geocode/autocomplete/route.ts#L159)
**Category:** External call latency

When Photon is slow, users wait the full Photon timeout before the
Nominatim fallback fires.

**Fix:** add a 1–2 s `AbortSignal.timeout()` to the Photon call. Optionally
race both with `Promise.any` and return the first success; cancel the
loser.

---

## P3 — nice to have

### 11. OG-image routes query DB synchronously, uncached

**Files:**
- [apps/web/src/app/events/[id]/opengraph-image.tsx](../../apps/web/src/app/events/[id]/opengraph-image.tsx)
- [apps/web/src/app/players/[id]/opengraph-image.tsx](../../apps/web/src/app/players/[id]/opengraph-image.tsx)
- [apps/web/src/app/teams/[id]/opengraph-image.tsx](../../apps/web/src/app/teams/[id]/opengraph-image.tsx)
- [apps/web/src/app/groups/[id]/opengraph-image.tsx](../../apps/web/src/app/groups/[id]/opengraph-image.tsx)

**Category:** External call latency / caching

When a link gets shared, Discord/Slack/Twitter all fetch the OG image in
parallel — that's a cache-miss thundering herd against Supabase.

**Fix:** set `Cache-Control: public, max-age=3600, immutable` on the OG
route responses, or precompute and store in Supabase Storage. Easy win
once the route is opted out of dynamic.

### 12. `isPro()` checked per event-detail render

**File:** [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L120)
**Category:** External call latency

Single query per pageview, ~5–10 ms. Multiply by event popularity.

**Fix:** memoize per request via React `cache()` so repeated calls during
the same render share a result. Long-term, surface `is_pro` on the
profile join.

### 13. Notification worker `maxDuration = 60s` + cold start

**File:** [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L23)
**Category:** Cold start

Cron fires every minute; Node cold start eats ~500 ms; once push fanout is
parallelized (P1 #3) the worker has plenty of headroom, but worth a
follow-up: monitor execution time and split into queue tasks if backlog
grows.

---

## ✅ Verified good

- **Existing indexes** — [20260520000000_perf_indexes.sql](../../supabase/migrations/20260520000000_perf_indexes.sql)
  covers `host_id`, `captain_id`, `home_city`, etc.
- **Parallelization** — pages do `Promise.all()` for independent fetches;
  `getDetail()` batches in tiers. Just too many tiers (see P1 #4).
- **Image optimization** — `next/image` with proper `width`/`height`
  everywhere checked; remote-pattern allowlist set in
  [next.config.mjs](../../apps/web/next.config.mjs).
- **Leaflet map SSR** — wrapped in `dynamic({ ssr: false })`
  ([event-map-lazy.tsx](../../apps/web/src/app/events/[id]/_components/event-map-lazy.tsx)).
- **Runtime selection** — Stripe webhook correctly forces
  `runtime = 'nodejs'`; edge-incompatible APIs (`crypto`) aren't used in
  edge routes.
- **`search_events` RPC** — single CTE with `st_dwithin`, no N+1.
- **Bundle hygiene** — no lodash / moment / chart libs. `date-fns` + a
  small day-picker is the date footprint.
- **Client boundaries** — `'use client'` appears in ~43 files, all of them
  legitimately interactive (forms, maps, toggles). Root layout stays
  server-component.
- **Fonts** — system stack only, no font-file requests, no FOIT/FOUT.
- **Stripe idempotency** — dedup table + unique constraint correct.
- **Push subscription cleanup** — worker prunes on 404/410 ([worker:108](../../apps/web/src/app/api/notifications/worker/route.ts#L108)).

---

## Quick-win bundle

These four together would shave the most measurable latency:

1. **(P1 #1, #2)** Drop `dynamic = 'force-dynamic'` from public + private
   pages. Set `revalidate = 60` on public listings and call
   `revalidatePath()` from mutating actions.
2. **(P1 #3)** Parallelize web-push fanout in the worker.
3. **(P2 #5)** Add the `(event_id, payment_status)` composite index.
4. **(P2 #6)** Self-host Leaflet marker PNGs in `public/leaflet/`.

The architectural one — **(P1 #4)** collapsing `getDetail()`'s query count
— deserves its own PR with before/after timings from Supabase's slow-query
log.

---

## Open questions

1. Is there a target page-weight or LCP budget you want me to optimize
   toward? (e.g. "<1.5 s LCP at p75 on 4G").
2. Should public event pages be fully static between mutations (ISR), or
   do you want fresh attendee counts on every view? ISR with a 60 s
   revalidate + `revalidatePath` on join/leave is a reasonable middle.
3. Any push subscriber count we should plan for before #3 becomes urgent?
   (Today it's a quality fix; at 1k+ subs/user it becomes correctness.)
</content>
</invoke>