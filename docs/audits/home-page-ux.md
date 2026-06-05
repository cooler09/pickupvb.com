# Home / Landing Page UX Audit

_Last updated: 2026-06-05_

UX/UI evaluation of the **home / landing page**
([apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx)) — the front door
every visitor and shared `pickupvb.com` link lands on, and the top of the
discovery funnel that feeds `/events` → `/events/[id]`.

Goal: make the first screen earn the click — give a **visitor** an honest,
scannable "is this for me / what's happening near me" answer, and stop the
highest-traffic page from being the **least** capable surface for the event
cards it renders.

This file is complementary to — not a duplicate of:

- [find-events-ux.md](find-events-ux.md) — the events **listing** page
  (`/events`). The homepage reuses that page's `EventCard`; H-1 below is about
  the homepage feeding it a degraded shape (the listing page does not).
- [events-page-ux.md](events-page-ux.md) — the event **detail** page
  (`/events/[id]`).
- [persona-ux.md](persona-ux.md) — the site-wide persona model + CTA/field
  vocabulary. The homepage's anon-host-CTA gap is already tracked there as
  **V-4**; H-5 cross-references it rather than re-grading.
- [seo.md](seo.md) — the homepage's `<head>`/OG/canonical metadata comes from
  the **root layout** ([layout.tsx#L43-L90](../../apps/web/src/app/layout.tsx#L43-L90),
  `alternates: { canonical: '/' }`), so SEO is **not** a finding here — it's
  already covered.

> **Status update (2026-06-01):** File created from a full persona-lens
> evaluation of the landing page. **The headline shipped the same day: H-1 ✅** —
> the homepage now maps the full `EventCardData` like the listing page, so the
> price chip, capacity/`Full` badge, relative dates, and hero thumbnail render on
> the landing page (render-only, zero new query). **Since then: H-4 ✅** (the
> group card was extracted into a shared `GroupCard` via groups-page-ux G-5) and
> **H-5 ✅** (anon host CTAs gated via persona-ux V-4). Remaining open: **H-2**
> (near-me CTA honesty), **H-3** (empty-peek fallback), **H-6** (signed-in
> personalization, optional). **No P1**: the page works and is SEO-covered by the
> layout. See **Remediation log** + journal
> [2026-06-01-home-card-parity.md](../journal/2026-06-01-home-card-parity.md).
>
> Grounding facts that shaped grading:
>
> - The homepage's "Upcoming events" peek calls the **same** `handlers.searchEvents`
>   query the listing page does ([page.tsx#L32-L42](../../apps/web/src/app/page.tsx#L32-L42)),
>   and its result type `VolleyballEventSummary`
>   ([event-repository.ts#L377-L402](../../packages/domain/src/events/event-repository.ts#L377-L402))
>   **already carries** `heroImageUrl`, `divisions`, `spotsRemaining`,
>   `distanceKm`, `timeZone`, series, and `isFundraiser`. So H-1 is render-only —
>   the data is in hand and thrown away.
> - The page already computes `now` at the server boundary
>   ([page.tsx#L27](../../apps/web/src/app/page.tsx#L27)), so `relativeEventDay`
>   can be threaded without re-introducing `Date.now()` in render.

> **Status update (2026-06-05):** Re-audit pass at the user's request — bugs /
> gaps / stale data / improvements. No new P1; the page renders and is
> SEO-covered by the root layout. Three **new** findings added below: **H-7**
> (the "waitlists" host claim overstates what the product does — only over-fill
> _flagging_ exists, no host-side promotion/management; see the
> `waitlist-not-implemented` note and the **Hannah** persona gap), **H-8** (the
> "Groups & organizations" peek is ordered `name ASC`, so it shows the same six
> alphabetically-first groups forever — it contradicts the page's own "fresh
> content … running events" framing), and **H-9** (the highest-traffic page is
> fully dynamic, yet both anon peek reads are viewer-independent and trivially
> cacheable). Verified the **"Real-time spot updates"** hero claim is _honest_ —
> [use-event-attendees.ts#L32](../../apps/web/src/hooks/use-event-attendees.ts#L32)
> subscribes to per-event `postgres_changes`, so it is **not** flagged. H-2 / H-3
> / H-6 from the prior pass remain open and unchanged.
>
> Grounding facts that shaped grading:
>
> - **Waitlist is over-fill flagging, not a managed queue.** The domain raises
>   `SpotFilled(..., waitlist)` when a position goes over its configured count
>   ([volleyball-event.ts#L686-L688](../../packages/domain/src/events/volleyball-event.ts#L686-L688)),
>   and the RSVP panel shows a "Join waitlist" CTA / "Waitlist" badge
>   ([position-rsvp-panel.tsx#L98](../../apps/web/src/app/events/[id]/_components/position-rsvp-panel.tsx#L98)).
>   There is **no** host-side waitlist roster, promotion, or auto-fill — so
>   "run waitlists" / "Waitlists & capacity rules" promise host capability the
>   product doesn't have.
> - **The groups peek is `name ASC`, capped at 6**
>   ([supabase-group-query-repository.ts#L112-L121](../../packages/infrastructure/src/supabase-group-query-repository.ts#L112-L121)),
>   with no "has upcoming events" filter. The `groups` row has `created_at`, so a
>   "fresh / active" ordering is available without a schema change.
> - **The page reads `cookies()`** (`getCurrentUser` + `getServerSupabase`,
>   [page.tsx#L26-L27](../../apps/web/src/app/page.tsx#L26-L27)), so it renders
>   dynamically on every hit. For an anonymous viewer both peek reads
>   (`searchEvents` with `viewerId: null`; `listCards`) are **identical across
>   all anon visitors** — a perfect `unstable_cache` candidate.

---

## Persona model

See the table in [persona-ux.md](persona-ux.md#the-persona-model-as-the-nav-encodes-it).
What each persona needs from **this** page specifically:

| Persona               | What the landing page must make obvious                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Visitor** (no auth) | "Is this for me + what's happening near me" in one screen; one clear "find events" + one "sign up" |
| **Anonymous user**    | A nudge toward claiming before host depth (the host CTA currently funnels them to a mid-form wall) |
| **Player / attendee** | Ideally their own next event / Following peek — today they get the visitor's generic marketing     |
| **Host / organizer**  | A credible "run your league here" pitch with a real CTA (already present and in good shape)        |

---

## Findings

### A. The event peek (visitor / player — the page's most important content)

#### H-1 — Homepage cards render a degraded shape vs. the listing page · **P2** (headline) · ✅ resolved 2026-06-01

The "Upcoming events" peek reuses `EventCard` but maps a **stripped**
`EventCardData`
([page.tsx#L116-L130](../../apps/web/src/app/page.tsx#L116-L130)):
`spotsRemaining: null`, `distanceKm: null`, and **no** `heroImageUrl`,
`divisions`, `priceCents`/`priceUnit`, `relativeDay`, `timeZone`, `isFundraiser`,
or series. But the data is already in hand — the peek calls the same
`handlers.searchEvents` whose `VolleyballEventSummary` result carries every one
of those fields
([event-repository.ts#L377-L402](../../packages/domain/src/events/event-repository.ts#L377-L402)),
and the listing page maps them all
([events/page.tsx#L201-L220](../../apps/web/src/app/events/page.tsx#L201-L220)).

Net effect: **every** card improvement shipped to the discovery grid _today_ —
price chip (F-2), capacity/`Full` badge (F-4), relative dates (F-10), hero
thumbnail (F-13) — is **invisible on the highest-traffic page**. Two concrete
costs:

- The homepage always renders the surface-tinted placeholder (never a hero
  thumbnail), so the page that most needs to look alive looks the most bare.
- `spotsRemaining: null` means a visitor can click a **Full** event straight off
  the homepage with no "Full" warning the listing page would have shown — a mild
  correctness gap, not just polish.

**Fix (done):** map the full shape exactly like the listing page, computing
the relative-day label from the `now` the page already has:

```tsx
// apps/web/src/app/page.tsx — in the upcomingEvents.map(...)
event={{
  id: e.id,
  title: e.title,
  surface: e.surface,
  skillLevel: e.skillLevel,
  type: e.type,
  startsAt: e.startsAt,
  timeZone: e.timeZone,
  city: e.city,
  region: e.region,
  heroImageUrl: e.heroImageUrl,
  relativeDay: relativeEventDay(e.startsAt, e.timeZone, now),
  spotsRemaining: e.spotsRemaining,
  distanceKm: e.distanceKm,
  seriesName: e.seriesName,
  seriesPosition: e.seriesPosition,
  seriesSize: e.seriesSize,
  isFundraiser: e.isFundraiser,
  divisions: e.divisions,
}}
```

Zero new query; `relativeEventDay` is already imported on the listing page
([date-formats.ts](../../apps/web/src/lib/date-formats.ts)). Graded **P2** to
match how the equivalent listing-page card findings were graded (F-2/F-4/F-10/
F-13) — but it's the **highest-leverage P2** in the page, since it's render-only
and lights up four shipped features on the busiest screen at once.

### B. Location honesty (visitor)

#### H-2 — Hero "Find events near me" promises proximity the page never delivers · **P3**

The hero's primary CTA reads **"Find events near me"**
([page.tsx#L57-L59](../../apps/web/src/app/page.tsx#L57-L59)) but links to bare
`/events` with no location, and the peek itself is fetched with **no `near`**
([page.tsx#L32-L42](../../apps/web/src/app/page.tsx#L32-L42)) — so it surfaces
arbitrary events platform-wide, not near the viewer. The visitor taps "near me",
lands on an unscoped list, and has to tap "Near me" _again_ on the listing page.

**Recommended fix (pick one):**

- (a) Cheapest + honest: change the hero CTA copy to **"Find events"** /
  **"Browse events"**, and the peek heading from a proximity implication to
  **"Latest events"** (it's currently "Upcoming events" / "A peek at what's on
  the schedule", which is acceptable but pairs with the misleading button).
- (b) Keep the near-me promise: link to `/events?near=prompt` and have the
  listing page auto-trigger the geolocation prompt on that param. More work
  (geolocation needs a user gesture on the target page), but preserves intent.

Recommend (a) for the button now; (b) only if we want the homepage to be a true
near-me entry point. P3.

#### H-3 — The peek section vanishes entirely in an empty/sparse market · **P3**

The whole "Upcoming events" block is gated on `upcomingEvents.length > 0`
([page.tsx#L103](../../apps/web/src/app/page.tsx#L103)). In a brand-new metro —
or an anonymous viewer whose RLS visibility is thin — the single most valuable
above-the-fold proof ("here's what's happening") just **disappears**, leaving a
visitor with marketing copy and no events. The listing page never does this: it
renders a helpful `EmptyState` (host nudge / clear-filters)
([events/page.tsx#L542-L602](../../apps/web/src/app/events/page.tsx#L542-L602)).

**Recommended fix:** when the peek is empty, render a lightweight empty card in
its place — _"No events scheduled near you yet — be the first to host one"_ with
the existing host CTA — rather than dropping the section, so the page never
looks dead. P3.

### C. Consistency / DRY

#### H-4 — The group card is hand-rolled twice and already drifting · **P3** · ✅ resolved 2026-06-01

The homepage reimplements the group tile
([page.tsx#L181-L208](../../apps/web/src/app/page.tsx#L181-L208)) that
`/groups` also hand-rolls
([groups/page.tsx#L87-L121](../../apps/web/src/app/groups/page.tsx#L87-L121)).
They've already diverged: the homepage uses a **1-char** avatar fallback in a
`<div>` and shows **no description**; `/groups` uses a **2-char** fallback in an
`aria-hidden <span>` and renders a 2-line `line-clamp` description. There is no
shared component (`groups/_components/` holds only `new-group-button.tsx`). Two
copies of one widget guarantee future drift — the same problem the shared
`EventCard` solved for events.

**Fix (done — via groups-page-ux G-5, 2026-06-01):** extracted a shared
`GroupCard` server component
([group-card.tsx](../../apps/web/src/app/groups/_components/group-card.tsx)) and
used it on both the home peek and the `/groups` directory, deleting both
hand-rolled copies; the home `Image` import was dropped (now unused). The home
card now also shows the group description. See
[groups-page-ux.md](groups-page-ux.md) G-5 + journal
[2026-06-01-groups-directory.md](../journal/2026-06-01-groups-directory.md).

### D. Persona coverage

#### H-5 — Home host CTAs surface to anonymous users → tracked by persona-ux **V-4** (not re-graded)

The hero, "What you can do" Host card, and host-pitch CTAs
([page.tsx#L61](../../apps/web/src/app/page.tsx#L61),
[#L159](../../apps/web/src/app/page.tsx#L159),
[#L253](../../apps/web/src/app/page.tsx#L253)) route `is_anonymous` users
straight to `/events/new`, where the submit action rejects them
([events/new/actions.ts#L46-L49](../../apps/web/src/app/events/new/actions.ts#L46-L49))
— a mid-form wall. This is documented as persona-ux **V-4**, which names the
homepage explicitly. **Not re-graded here.**

**Resolved via V-4 (2026-06-01):** `/events/new` now redirects anonymous users to
`/claim?next=/events/new` (mirroring `/teams/new`). Since all three home host
CTAs funnel there, an anon user who taps them lands on the claim flow instead of
the bare form — no home-local change was needed. See persona-ux V-4 + journal
[2026-06-01-anon-host-gate.md](../journal/2026-06-01-anon-host-gate.md).

#### H-6 — A returning signed-in player sees the visitor's marketing page · **P3** (optional / product call)

For an authed user the page differs from a visitor's only in that the guest
sign-in nudge ([page.tsx#L67-L74](../../apps/web/src/app/page.tsx#L67-L74)) and
footer CTA ([page.tsx#L266-L281](../../apps/web/src/app/page.tsx#L266-L281)) are
hidden — everything else is the same generic marketing + host pitch. The listing
page personalizes (defaults to the **Following** tab at ≥3 follows); the homepage
has no equivalent. There's no "your next event / you're going to X tonight" or
Following peek for the player who already has a session.

**Recommended fix (optional, larger):** for authed users, lead with a compact
"Your upcoming events" / Following peek (reuse the same `EventCard` +
`getFollowingFeed`/RSVP query) above the generic sections, or at minimum swap the
marketing footer for a player-relevant block. Flagged **P3** and called out as a
**product decision**, not a defect — the header + bottom-nav already give players
their primary surfaces, so this is upside, not a gap.

### E. Marketing-copy honesty (stale claims)

#### H-7 — The homepage advertises "waitlists" the product doesn't actually run · **P2** · ✅ resolved 2026-06-05

The page sells **waitlists as a host feature** in three places:

- the "Host" value card body — _"Collect signups, **run waitlists**, take payment…"_
  ([page.tsx#L166](../../apps/web/src/app/page.tsx#L166)),
- the host-pitch prose — _"signups, **waitlists**, online payments…"_
  ([page.tsx#L204](../../apps/web/src/app/page.tsx#L204)),
- the host-pitch checklist — _"**Waitlists** & capacity rules"_
  ([page.tsx#L218](../../apps/web/src/app/page.tsx#L218)).

But there is **no waitlist feature** in the host sense. What exists is over-fill
_flagging_: when a position goes past its configured count the aggregate raises
`SpotFilled(..., waitlist: true)`
([volleyball-event.ts#L686-L688](../../packages/domain/src/events/volleyball-event.ts#L686-L688)),
the RSVP panel shows a "Join waitlist" CTA / "Waitlist" badge
([position-rsvp-panel.tsx#L98](../../apps/web/src/app/events/[id]/_components/position-rsvp-panel.tsx#L98)),
and the join CTA reads "Join waitlist" when full
([load-event-detail.ts#L683](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts#L683)).
There is **no waitlist queue a host manages, no auto-promotion when a spot frees
up, and no separate waitlist roster** — confirmed by the `waitlist-not-implemented`
note (the **Hannah** persona gap). A host who signs up because of this copy will
look for a "promote from waitlist" control that isn't there. Stale/overstated
public claim on the highest-traffic page → graded **P2** (honesty, not polish:
it sets a host expectation the product fails).

**Recommended fix (pick one):**

- (a) Cheapest + honest: soften the three strings to what's real —
  e.g. "**over-capacity signups flagged**" / "capacity & over-fill rules" rather
  than "run waitlists" / "Waitlists & capacity rules". The "Join waitlist" CTA on
  the detail page is accurate for the _player_ side, so the player-facing framing
  can stay; only the **host-capability** framing on the homepage overstates.
- (b) Build the feature (waitlist roster + host promotion / auto-fill on a freed
  spot), then the copy becomes true. That's the real **Hannah** gap; tracked
  separately — don't gate the copy fix on it.

Recommend (a) now; (b) is its own initiative.

### F. Content curation (visitor / stale-feel)

#### H-8 — The groups peek is alphabetical, contradicting its "fresh / running events" framing · **P3** · ✅ resolved 2026-06-05

The page comment says it pulls _"a small slice of **fresh** content to make the
landing page feel alive"_ ([page.tsx#L30](../../apps/web/src/app/page.tsx#L30)),
and the section subtitle reads _"Clubs, leagues, and crews **running events**"_
([page.tsx#L179](../../apps/web/src/app/page.tsx#L179)). But `listCards(6)` orders
by **`name` ascending**
([supabase-group-query-repository.ts#L112-L121](../../packages/infrastructure/src/supabase-group-query-repository.ts#L112-L121)),
with no "has upcoming events" filter. Net effect: the peek shows the **same six
alphabetically-first groups forever** — a brand-new empty group named "A-Town VB"
outranks an active club, and the slice never changes, so the page does **not**
feel alive and the "running events" claim isn't enforced. (The "Upcoming events"
peek above it _is_ time-ordered and fresh; only groups is static.)

**Recommended fix (pick one):**

- (a) Cheap: add an ordering param to `listCards` (or a dedicated
  `listFreshCards`) and order by **`created_at DESC`** — the `groups` row already
  has `created_at`, so no schema change. At least the slice rotates as new groups
  appear, and matches "fresh".
- (b) Honest to the subtitle: surface groups that actually **host upcoming
  events** (join `events` on `host_group_id` with `starts_at > now`, order by
  soonest / count). More work; truest to the copy. If not done, soften the
  subtitle to "Clubs, leagues, and crews on PickupVB".

Recommend (a) for the quick win; (b) if we want the section to mean what it says.
P3 (the section works; it's curation quality).

### G. Performance

#### H-9 — The highest-traffic page is fully dynamic, though the anon peek is viewer-independent and cacheable · **P3** · ✅ resolved 2026-06-05

The home page reads `cookies()` via `getCurrentUser()` + `getServerSupabase()`
([page.tsx#L26-L27](../../apps/web/src/app/page.tsx#L26-L27)), so Next renders it
**dynamically on every request** — no CDN/full-route cache on the busiest public
page, and two DB round-trips (`searchEvents` RPC + `listCards`) per hit including
every anonymous visitor and crawler. For an **anonymous** viewer both reads are
_viewer-independent_: `searchEvents` runs with `viewerId: null` and `listCards`
is identical for everyone. So the data is shared across all anon hits but
re-fetched each time.

This isn't `force-dynamic` abuse (the page never sets it — pitfall #3 is clean);
it's an unrealized caching opportunity, hence **P3**, but high-leverage given the
traffic.

**Recommended fix:** wrap the two anon-branch reads in `unstable_cache` with a
short `revalidate` (e.g. 60–300s) and tags, invalidated by the existing event /
group mutators (`eventCacheTag` / a new groups tag). Keep the **authed** branch
dynamic (it personalizes via `viewerId`). Per the repo pitfall _"Never call
`cookies()` inside `unstable_cache`"_, the cached callback must use
`getAdminSupabase()` (via dynamic `import()`) rather than the session client —
which is correct here because the cached payload is the **public** (anon) view of
events/groups. Mirrors the `loadAdHocRowsCached` pattern in
[load-event-detail.ts](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts).
Belongs in the [performance.md](performance.md) sweep too.

**Resolved 2026-06-05:** both peek reads moved into a single `loadHomePeek`
`unstable_cache` (60s `revalidate`) in [page.tsx](../../apps/web/src/app/page.tsx),
running on the admin client (the search RPC takes no viewer arg and returns only
public events, and `searchEvents`'s repo already self-builds the admin client, so
the cache callback is cookie-free and the service-role read is safe). The route
stays dynamic (`getCurrentUser` still reads `cookies()` to branch guest vs. authed
UI), but every render now shares one cached data result instead of re-running two
DB round-trips. Used a short time-based `revalidate` rather than tags because the
peek is a denormalized cross-entity list that doesn't fit `unstable_cache`'s
static per-id tag model — see the journal entry for the trade-off. No `Date`
revival needed: `relativeEventDay` / `EventCard` already accept `Date | string`.

> **Minor (noise, not graded):** `upcomingEvents.slice(0, 6)`
> ([page.tsx#L116](../../apps/web/src/app/page.tsx#L116)) is redundant — the
> `searchEvents` query already passes `limit: 6`. Harmless; drop it if touching
> the block.

---

## Remediation log

### 2026-06-01 — Card parity (H-1)

Shipped the headline render-only fix the same day the file was created. Verified
`pnpm typecheck && lint && test && build` (all green). Journal:
[2026-06-01-home-card-parity.md](../journal/2026-06-01-home-card-parity.md).

- **H-1 ✅** — the homepage "Upcoming events" peek now maps the full
  `EventCardData` (`heroImageUrl`, `divisions`, `priceCents`-via-divisions,
  `spotsRemaining`, `distanceKm`, `timeZone`, `relativeDay`, series,
  `isFundraiser`) instead of the stripped subset, so the price chip, capacity/
  `Full` badge, relative-date label, and hero thumbnail render on the landing
  page. `relativeDay` is computed with `relativeEventDay(e.startsAt, e.timeZone,
now)` off the `now` the page already had (stays a pure server component). Zero
  new query — the peek's existing `searchEvents` result (`VolleyballEventSummary`)
  already carried every field.
  [page.tsx](../../apps/web/src/app/page.tsx).

_Open: H-2 (location honesty), H-3 (empty-peek), H-4 (shared `GroupCard`),
H-6 (signed-in personalization). H-5 lives with persona-ux V-4._

### 2026-06-05 — Re-audit pass + H-7 / H-8 shipped

Bugs / gaps / stale-data sweep at the user's request, then shipped the two
copy/curation fixes. Verified `pnpm typecheck && lint && test && build` (all
green; the only lint warnings are pre-existing `set-state-in-effect` in unrelated
files).

- **H-7 ✅ (P2)** — removed the overstated "waitlists" host claim from all three
  homepage spots: the Host value-card body now reads "set capacity" (was "run
  waitlists"), the host-pitch prose reads "capacity limits" (was "waitlists"),
  and the checklist reads "Capacity & over-fill rules" (was "Waitlists & capacity
  rules"). The player-facing "Join waitlist" CTA on the detail page is accurate
  and untouched. Option (b) — a real managed waitlist queue / promotion — remains
  the **Hannah** initiative, not gated on this. [page.tsx](../../apps/web/src/app/page.tsx).
- **H-8 ✅ (P3)** — `listCards` now orders `created_at DESC` (was `name ASC`), so
  the home "Groups & organizations" peek rotates as new clubs join instead of
  pinning the same six A-named groups; the subtitle softened to "Clubs, leagues,
  and crews on PickupVB" (was "… running events") since newest-first doesn't
  guarantee events. Port doc updated to match.
  [supabase-group-query-repository.ts#L112-L125](../../packages/infrastructure/src/supabase-group-query-repository.ts#L112-L125),
  [group-queries.ts#L75-L76](../../packages/domain/src/groups/group-queries.ts#L75-L76),
  [page.tsx](../../apps/web/src/app/page.tsx). Option (b) (filter to groups with
  upcoming events) deferred — would re-introduce the empty-section risk (H-3).
- **H-9 ✅ (P3)** — both viewer-independent peek reads now share a single
  `loadHomePeek` `unstable_cache` (60s `revalidate`, admin client, cookie-free
  callback). The route stays dynamic for the guest/authed UI branch, but the two
  DB round-trips no longer run per hit. Time-based (not tag-based) eviction —
  the denormalized cross-entity list doesn't fit `unstable_cache`'s static
  per-id tag model. Journal:
  [2026-06-05-home-peek-cache.md](../journal/2026-06-05-home-peek-cache.md).
  [page.tsx](../../apps/web/src/app/page.tsx).
- Verified **not** stale: the "Real-time spot updates" hero claim is backed by
  `use-event-attendees.ts` realtime — left as-is.

_Open after this pass: H-2, H-3, H-6 (prior). H-7 ✅ / H-8 ✅ / H-9 ✅._
