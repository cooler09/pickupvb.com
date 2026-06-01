# Home / Landing Page UX Audit

_Last updated: 2026-06-01_

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
> the landing page (render-only, zero new query). Remaining open: five **P3**
> items (H-2…H-6, one of which is a cross-ref to persona-ux V-4). **No P1**: the
> page works and is SEO-covered by the layout. See **Remediation log** + journal
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

#### H-4 — The group card is hand-rolled twice and already drifting · **P3**

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

**Recommended fix:** extract a `GroupCard` server component
(`apps/web/src/app/groups/_components/group-card.tsx`; props `slug`, `name`,
`avatarUrl`, `homeCity`, `region`, `description?`) and use it on both pages.
Aligns with the persona-ux design-system theme (one canonical vocabulary per
widget). P3.

### D. Persona coverage

#### H-5 — Home host CTAs surface to anonymous users → tracked by persona-ux **V-4** (not re-graded)

The hero, "What you can do" Host card, and host-pitch CTAs
([page.tsx#L61](../../apps/web/src/app/page.tsx#L61),
[#L159](../../apps/web/src/app/page.tsx#L159),
[#L253](../../apps/web/src/app/page.tsx#L253)) route `is_anonymous` users
straight to `/events/new`, where the submit action rejects them
([events/new/actions.ts#L46-L49](../../apps/web/src/app/events/new/actions.ts#L46-L49))
— a mid-form wall. This is **already** documented as persona-ux **V-4** (P3,
open), which names the homepage explicitly. Listed here for completeness; the fix
(gate host entry points on `is_anonymous` → `/claim?next=/events/new`) lives with
V-4. **Not re-graded.**

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
