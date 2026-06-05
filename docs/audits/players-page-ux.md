# Players Directory UX Audit

_Last updated: 2026-06-01_

UX/UI evaluation of the **players directory**
([apps/web/src/app/players/page.tsx](../../apps/web/src/app/players/page.tsx)) —
the public, ISR-cached listing every visitor and player uses to find people to
follow, recruit onto a team, or invite to a group.

Goal: make each card carry enough signal to answer _"is this someone I want to
follow / recruit?"_ at a glance, and make the page act on that intent — the same
"decision signal on the card" lens the events cards got in
[find-events-ux.md](find-events-ux.md).

This file is complementary to — not a duplicate of:

- [find-events-ux.md](find-events-ux.md) / [home-page-ux.md](home-page-ux.md) /
  [profile-page-ux.md](profile-page-ux.md) — the other page-scoped UX audits.
  This is a **Connect** directory (the nav's Community group), a sibling of
  `/groups` and `/teams`; PL-3 / PL-4 below likely apply to those too and should
  be aligned when they're audited.
- [persona-ux.md](persona-ux.md) — the site-wide persona model + CTA/field
  vocabulary; PL-3 (hand-rolled input + Search button) is the **CC-1/CC-2** drift
  seen on this page.
- [privacy.md](privacy.md) — the directory correctly reads the
  **`profiles_public`** view (PII pattern #13), so there's no leak to re-litigate.

> **Status update (2026-06-01):** Full persona-lens evaluation; **PL-1…PL-4 all
> shipped the same day.** PL-1 — position chips on the card (migration-free:
> `ProfileCard.positions` + `CARD_COLUMNS` + `toCard` + render). PL-2 — follow
> from the directory via a `PlayersFollowProvider` + per-card `FollowButton`
> islands that layer onto the ISR shell (anon HTML unchanged). PL-3 — inputs →
> `fieldInputClass`, Search → `primaryButtonClass()`. PL-4 — `Players · {total}`
> count in the header. **PL-5 ✅ staged 2026-06-01** — profiles geo (migration +
> geocode-on-save + bounding-box near-me + distance) is built and passes the
> verify chain, but the **migration is unapplied** and the generated types were
> **hand-bridged** (local Supabase/Docker was down); it needs `db:migrate` +
> `gen:types` + a `profiles_public`-rebuild check before deploy. **All five
> findings now addressed.** **No P1**: the page works, is `profiles_public`-correct,
> ISR-cacheable, and paginated.
>
> Grounding fact that shaped grading: `profiles_public` **already exposes**
> `primary/secondary/tertiary_position` (and `show_pro_badge`)
> ([database.types.ts](../../packages/supabase/src/database.types.ts) →
> `profiles_public`), but `CARD_COLUMNS`
> ([supabase-profile-repository.ts#L19](../../packages/infrastructure/src/supabase-profile-repository.ts#L19))
> selects only `id, handle, display_name, home_city, avatar_url`. So PL-1 is a
> render-plus-one-column change, **no migration**.

---

## Persona model

What each persona needs from **this** page specifically:

| Persona               | What the directory must make obvious                                            |
| --------------------- | ------------------------------------------------------------------------------- |
| **Visitor** (no auth) | "Is there a real community here?" — scannable cards; one path to sign in        |
| **Player / attendee** | Who to follow — location + what they play; ideally a way to act without leaving |
| **Team captain**      | Who plays which **position** (recruiting) — positions are the key signal        |
| **Host / organizer**  | (de-weighted this pass)                                                         |

---

## What's already good (so we don't regress it)

- **Reads `profiles_public`, not base `profiles`** (PII pattern #13) — the
  directory is correct for anon + session viewers alike; no leak.
- **ISR-cacheable** (`export const revalidate = 60`, sessionless anon client) —
  the right call for a public, viewer-independent listing.
- **Whole-card click target** + decorative `alt=""` / `aria-hidden` initials
  fallback, and the shared **`Pagination`** (AGENTS.md pattern #12) with
  SQL `range` + `count: 'exact'` (correct for a 1:1 row listing).

---

## Findings

### A. Information scent (the card's job)

#### PL-1 — Directory cards carry no decision signal beyond name + city · **P2** (headline) · ✅ resolved 2026-06-01

The page's own subhead promises _"find people to follow, add to your team, or
invite to a group"_
([page.tsx#L62-L64](../../apps/web/src/app/players/page.tsx#L62-L64)), but each
card shows only an avatar, the display name, and the home city
([page.tsx#L96-L124](../../apps/web/src/app/players/page.tsx#L96-L124)). For a
captain scanning for "who plays setter near me" or a player deciding who to
follow, that's almost no signal — the directory can't do its stated job.

The fix is cheap because the data is already public: `profiles_public` exposes
`primary/secondary/tertiary_position`, but `ProfileCard` / `CARD_COLUMNS` drop
them.

**Fix (done, migration-free):**

1. Added `positions: string[]` (ordered primary→tertiary, nulls dropped) to
   `ProfileCard`
   ([profile-queries.ts](../../packages/domain/src/users/profile-queries.ts)).
2. Added `primary/secondary/tertiary_position` to `CARD_COLUMNS` + `CardRow` and
   built the `positions` array in `toCard`
   ([supabase-profile-repository.ts](../../packages/infrastructure/src/supabase-profile-repository.ts)).
3. Render position chips on the card via `POSITION_LABEL` (e.g. _Setter ·
   Outside_), the same chip vocabulary the profile hub uses
   ([players/page.tsx](../../apps/web/src/app/players/page.tsx)).

`CARD_COLUMNS` is shared by every `ProfileCard` consumer (friends lists, mention
cards); `positions` is additive, so those consumers gain the data for free and
can render it later. Zero migration — the columns were already in `profiles_public`.

_Pro badge deferred:_ `profiles_public` exposes `show_pro_badge` (a user
preference) but **no is-pro signal**, so a trustworthy Pro badge on the card
would need the view to expose pro status — a separate change, not folded in here.

### B. Acting on intent

#### PL-2 — You can't follow from the directory — only click through · **P3** · ✅ resolved 2026-06-01

The stated #1 purpose is "find people to **follow**," yet the only action on a
card is navigating to the player's profile, where the follow button lives. For a
discovery surface this is a missed loop.

The tension: the page is intentionally **anon-client + ISR** (sessionless,
`revalidate = 60`) for cacheability, so it has no viewer context server-side —
a follow button needs a client island that resolves the viewer + their
following-set client-side and hides for anon / self (the pattern
[player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx)
already uses on the detail page).

**Fix (done):** new
[players/\_components/players-follow.tsx](../../apps/web/src/app/players/_components/players-follow.tsx)
— a `PlayersFollowProvider` (client) resolves the viewer + their following-set
**once** for the whole grid (one `auth.getUser()` + one `friendships` lookup
scoped to the visible ids) and exposes it via context; each card renders a
`FollowButton` island that reads context, follows/unfollows optimistically
(reusing `addFriend`/`removeFriend`), and renders **nothing** while loading, for
anon viewers, or on the viewer's own card — so the server-rendered (anon) HTML is
unchanged and follow is pure progressive enhancement on the ISR shell. The card
was restructured to a stretched-link (`<li relative>` + the name's
`after:absolute inset-0`) so the whole tile still navigates while the
`relative z-10` Follow button captures its own click (the EventCard F-3 pattern).
[players/page.tsx](../../apps/web/src/app/players/page.tsx).

### C. Discovery polish

#### PL-3 — Inputs + Search button bypass the shared field/CTA vocabulary · **P3** · ✅ resolved 2026-06-01

The two search inputs hand-roll `border-border-base bg-surface rounded-md border
px-3 py-2 text-sm`
([page.tsx#L67-L80](../../apps/web/src/app/players/page.tsx#L67-L80)) instead of
`fieldInputClass`, and the Search button hand-rolls an outlined style
([page.tsx#L81-L86](../../apps/web/src/app/players/page.tsx#L81-L86)) instead of
the canonical button vocabulary. The sibling `/groups` directory already uses
`primaryButtonClass()` for its Search button
([groups/page.tsx#L65](../../apps/web/src/app/groups/page.tsx#L65)), so the two
directories don't even match each other. (The inline-input drift is invisible to
the `no-restricted-syntax` ratchet, which only catches `const inputClass =`
declarations — see persona-ux CC-2.)

**Fix (done):** both inputs → `fieldInputClass`; Search → `primaryButtonClass()`
(matching `/groups`); the filter row gained `sm:items-center` so
`fieldInputClass`'s label-oriented `mt-1` aligns cleanly in the label-less row.
Cross-ref persona-ux **CC-1/CC-2**.
[players/page.tsx](../../apps/web/src/app/players/page.tsx).

#### PL-4 — No result count · **P3** · ✅ resolved 2026-06-01

`searchDirectory` already returns `total`
([page.tsx#L50](../../apps/web/src/app/players/page.tsx#L50)), but the header
never says how many players matched — unlike the events listing, which leads
with "N events" (F-8). Especially useful when a name/city filter is applied.
**Fix (done):** the header now reads `Players · {total}` (the count was already
returned by `searchDirectory`).
[players/page.tsx](../../apps/web/src/app/players/page.tsx).

#### PL-5 — "Find people in your area" is a free-text city match, no geo / near-me · **P3** · ✅ resolved 2026-06-01 (staged)

The metadata and copy lean on proximity ("people in your area"), but the only
location control was a **substring** match on the `home_city` string — so
"Virginia Beach" and "VA Beach" missed each other, and there was no radius.
`profiles_public` carried no lat/lng, so true geo needed a schema change.

**Fix (done — staged; migration not yet applied to a real DB):** added a
profiles geo stack mirroring the events near-me UX:

- **Migration**
  [20260901000000_profiles_geo.sql](../../supabase/migrations/20260901000000_profiles_geo.sql)
  — `profiles.latitude/longitude` + a `profiles_public` rebuild exposing them
  (bounding-box approach, no PostGIS column/RPC — see the migration preamble).
- **Geocode-on-save** — the `updateProfile` action geocodes `home_city` →
  lat/lng (reusing the events geocoder) and writes them directly (derived field,
  like theme/hero), best-effort. [profile/actions.ts](../../apps/web/src/app/profile/actions.ts).
- **Search** — `ProfileDirectoryQuery.near` + `ProfileCard.distanceKm`;
  `searchDirectory` bounding-box-filters `profiles_public` and computes a JS
  haversine distance. Ordering stays alphabetical (true nearest-first would need
  PostGIS — deferred). [supabase-profile-repository.ts](../../packages/infrastructure/src/supabase-profile-repository.ts).
- **UI** — the events `NearMeButton`/`LocationSearch` gained a `basePath` prop and
  are reused on `/players` (basePath `/players`); the old "Home city" text input
  was replaced by the geo controls + a "within N km · Clear" line; cards show
  "N km away". [players/page.tsx](../../apps/web/src/app/players/page.tsx).

> ⚠️ **Staged — needs DB apply + type regen.** Local Supabase (Docker) was down,
> so the migration was **not** applied/tested against a real DB and
> `database.types.ts` was **hand-bridged** (latitude/longitude added by hand) to
> pass typecheck. Before/with deploy: run `pnpm db:migrate` (local) +
> `pnpm --filter @pickupvb/supabase gen:types` and confirm no diff vs. the
> hand-bridged columns; verify the `profiles_public` rebuild. Existing profiles
> have NULL coords until their owner re-saves (no SQL backfill — geocoding is
> HTTP).

---

## Out of scope

- **`/players/[id]`** (the public player profile the cards link to, and the
  "Public view" target from the profile hub) is a distinct, richer surface — its
  own UX audit if/when we get there. This file covers the **directory** only.

## Remediation log

### 2026-06-01 — PL-1…PL-4 bundle (card enrichment + follow + vocab + count)

Shipped four of the five findings the same day the file was created. Verified
`pnpm typecheck && lint && test && build` (all green; the new client component
added zero lint warnings). Journal:
[2026-06-01-players-directory.md](../journal/2026-06-01-players-directory.md).

- **PL-1 ✅** — `ProfileCard.positions` (domain) +
  `CARD_COLUMNS`/`CardRow`/`toCard` (infra, migration-free — columns already in
  `profiles_public`) + position chips on the card via `POSITION_LABEL` (web).
- **PL-2 ✅** — new
  [players/\_components/players-follow.tsx](../../apps/web/src/app/players/_components/players-follow.tsx):
  `PlayersFollowProvider` resolves the viewer + following-set once for the grid;
  per-card `FollowButton` islands follow/unfollow optimistically and render
  nothing for loading/anon/self, so the ISR/anon shell is untouched. Card
  restructured to a stretched-link so the Follow button (`z-10`) and whole-tile
  navigation coexist.
- **PL-3 ✅** — inputs → `fieldInputClass`, Search → `primaryButtonClass()`,
  filter row `sm:items-center`.
- **PL-4 ✅** — `Players · {total}` count in the header.

### 2026-06-01 — PL-5 (geo / near-me), staged

Built the deferred geo feature end-to-end; verify chain green. **Staged, not
DB-applied** — local Supabase (Docker) was down, so the migration wasn't applied
and `database.types.ts` was hand-bridged. Journal:
[2026-06-01-players-geo-near-me.md](../journal/2026-06-01-players-geo-near-me.md).

- **PL-5 ✅ (staged)** — migration
  [20260901000000_profiles_geo.sql](../../supabase/migrations/20260901000000_profiles_geo.sql)
  (`profiles.latitude/longitude` + `profiles_public` rebuild, bbox not PostGIS);
  geocode-on-save in [profile/actions.ts](../../apps/web/src/app/profile/actions.ts);
  `ProfileDirectoryQuery.near` + `ProfileCard.distanceKm` + bbox/haversine in
  [supabase-profile-repository.ts](../../packages/infrastructure/src/supabase-profile-repository.ts);
  `NearMeButton`/`LocationSearch` generalized with a `basePath` prop and reused on
  [players/page.tsx](../../apps/web/src/app/players/page.tsx) (distance shown,
  "Home city" text input replaced).

**Before deploy:** `pnpm db:migrate` + `pnpm --filter @pickupvb/supabase gen:types`,
confirm the regen matches the hand-bridged latitude/longitude columns, and verify
the `profiles_public` rebuild. **All PL findings now addressed (PL-5 staged).**
