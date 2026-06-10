# Public Player Profile UX Audit

_Last updated: 2026-06-08_

UX/UI + privacy evaluation of the **public player profile**
([apps/web/src/app/players/[id]/page.tsx](../../apps/web/src/app/players/[id]/page.tsx)) —
the ISR-cached card other players (and search engines) see at
`/players/[handle]`. The `/players` **directory** is a separate surface, audited
in [players-page-ux.md](players-page-ux.md); the player's own authenticated hub
is [profile-page-ux.md](profile-page-ux.md).

> **Status (2026-06-10):** Re-audit + headline bundle shipped. The 2026-06-08
> bundle still holds (PUB-1…6 resolved). This pass opened **6 findings** and
> **fixed the top two the same day** (quad-green, uncommitted): **PUB-7 (P2) ✅**
> the non-host profile gained a "Member since {year}" line and a **Groups /
> Teams** community block (reuses `GroupCard` / `TeamCard` + the existing
> `listMembershipsForUser`; anon-safe RLS `using (true)`); **PUB-8 (P3) ✅** the
> dead **hero-banner** path is now a real feature end-to-end — a `profiles`
> `HeroImagePanel` on the editor + a `<HeroImage>` band atop `/players/[id]`
> (the orphan-sweep already covered `profiles`, so **no migration** was needed;
> the write path through `SetProfileHeroImageHandler` → `hero_image_url` was
> already intact). **PUB-9 (P3) ✅** avatar `width/height` 72 → 80 to match the
> rendered `h-20 w-20` box (matching the hub) and **PUB-10 (P3) ✅** the public
> card now omits the home-city line when unset instead of echoing "No home city
> set" to visitors. **PUB-11 (P3) ◑** the `⋯` overflow menu now offers
> **Block / Unblock** (reuses `blockUser` / `unblockUser`; Message hides when
> blocked) — **Report deferred** (no profile-report backend or admin queue
> exists; new machinery, not an entry point). **PUB-12 (P3) ✅** the
> handle→profile read is now `React.cache`-memoized and **shared by
> `generateMetadata` + the page** (one query, not two), with `discoverable`
> threaded onto `PlayerProfile` so metadata drops its own `findCardByHandle`.
> All quad-green. **Only open item:** PUB-11's deferred Report half. See
> **Findings** below. _(Minor, not numbered: `ShareLink`'s
> trigger hand-rolls the neutral-button classes instead of `neutralButtonClass`
> — shared component, cross-cutting.)_

> **Status (2026-06-08):** First dedicated audit of this surface — **all
> findings now resolved.** 2 P2 fixed: PUB-1 (the host-only event list was
> titled "Upcoming events" and rendered empty for the majority non-host player)
> and PUB-2 (a `discoverable = false` "private" player was still sitemapped and
> indexable). The 4 P3s followed in the same bundle: PUB-3 (OG image now reads
> the anon client), PUB-4 (`nameOf`/`initialsOf` consolidated into
> `lib/player-name.ts`), PUB-5 (follow/unfollow now toast on failure), PUB-6
> (avatar `alt`). No P1. See the **Remediation log** below.

---

## What's already good (so we don't regress it)

- **The viewer-conditional CTA row is a client island** so the page stays
  ISR-cacheable
  ([player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx)) —
  follow/unfollow/sign-in/edit/message all hydrate from one `getUser()`.
- **Reads go through `profiles_public`** (PII-safe view), so soft-deleted
  profiles `notFound()` and the page never leaks base-`profiles` columns.
- **Hosted events split upcoming/past at SQL**, each paginated with the shared
  `Pagination` (`upage` / `ppage`) per AGENTS pattern #12.
- **The public trophy case** reads `user_badges_public` (anon-granted, hidden
  badges filtered) so it stays cacheable.

---

## Findings

### PUB-1 — "Upcoming events" mislabels host-only content and renders empty for non-hosts · **P2** · ✅ fixed 2026-06-08

The section titled **"Upcoming events (N)"**
([page.tsx#L176-L197](../../apps/web/src/app/players/[id]/page.tsx#L176-L197))
was populated exclusively from `loadVisibleHostedEvents` — i.e. events the
player **hosts**, not events they're attending. Two problems:

1. **Mislabel.** "Upcoming events" reads as "games this player is going to,"
   but the content is host-scoped. The heading contradicted its own data.
2. **Empty for the dominant persona.** Most players never host. For them the
   whole page was the identity card + (usually empty) badge shelf + an empty
   "Upcoming events (0)" with the copy _"X isn't hosting any upcoming events you
   can see."_ — a confusing dead block on every non-host profile.

**Fix (done):** renamed the section to **"Hosting"** (matching the private
hub's vocabulary) and gated it on `upcoming.length > 0`, so it's hidden for
non-hosts instead of showing an empty, mislabeled block. The "Past events"
section was already empty-gated. A non-host page now honestly shows identity +
badges; a host's page shows "Hosting" + "Past events".
[page.tsx](../../apps/web/src/app/players/[id]/page.tsx).

_Deferred:_ giving a non-host page more substance (e.g. a public "member of"
groups/teams row) is a real product increment, not a same-day relabel — left
as a follow-up.

### PUB-2 — A `discoverable = false` "private" player is still sitemapped and indexable · **P2** · ✅ fixed 2026-06-08

The discovery opt-out is sold to the user as _"Turn this off to stay private"_
([profile-form.tsx#L288-L289](../../apps/web/src/app/profile/profile-form.tsx#L288-L289)),
and the repository correctly excludes such players from search + the directory
([supabase-profile-repository.ts#L133](../../packages/infrastructure/src/supabase-profile-repository.ts#L133),
[#L157](../../packages/infrastructure/src/supabase-profile-repository.ts#L157)).
But two crawl surfaces ignored the flag:

- **The sitemap** selected every `profiles_public` handle with no
  `discoverable` filter
  ([sitemap.ts#L123-L133](../../apps/web/src/app/sitemap.ts#L123-L133)) — note
  the community-listings block right below it _does_ filter to indexable
  statuses.
- **The page set no `robots` directive**
  ([page.tsx#L32-L50](../../apps/web/src/app/players/[id]/page.tsx#L32-L50)), so
  it defaulted to indexable.

Result: an opted-out player was advertised to Google and indexed — the
behavior contradicted the privacy promise. (Direct-link reachability is the
documented decision in [privacy.md](privacy.md) — _"private = not discoverable,
not hidden everywhere"_ — but being crawled is stronger than "reachable by
link.")

**Fix (done):**

1. Threaded `discoverable` onto the `ProfileCard` projection
   ([profile-queries.ts](../../packages/domain/src/users/profile-queries.ts) +
   `CARD_COLUMNS` / `toCard` in
   [supabase-profile-repository.ts](../../packages/infrastructure/src/supabase-profile-repository.ts);
   null defaults to `true` — only an explicit `false` de-indexes).
2. `generateMetadata` returns `robots: { index: false, follow: false }` when
   `card.discoverable === false`
   ([page.tsx](../../apps/web/src/app/players/[id]/page.tsx)).
3. The sitemap query gained `.eq('discoverable', true)`
   ([sitemap.ts](../../apps/web/src/app/sitemap.ts)).

The page stays reachable by direct link (decision unchanged); it's just no
longer crawled/indexed.

### PUB-3 — OG image read is cookie-bound and inconsistent with the page · **P3** · ✅ fixed 2026-06-08

[opengraph-image.tsx#L14](../../apps/web/src/app/players/[id]/opengraph-image.tsx#L14)
uses `getServerSupabase()` (reads `cookies()` → forces the OG route dynamic),
while the page and `generateMetadata` both use `createSupabaseAnonClient()`.
`profiles_public` is anon-granted, so the OG route should use the anon client to
match and stay cacheable. (Separately, the same row is read three times per
render — `findCardByHandle` in metadata, `findPlayerByHandle` in the page,
`findCardByHandle` in OG — masked by ISR but avoidable.) **Fixed:** OG now uses
`createSupabaseAnonClient()`
([opengraph-image.tsx](../../apps/web/src/app/players/[id]/opengraph-image.tsx)).

### PUB-4 — `nameOf` / `initialsOf` duplicated across three files · **P3** · ✅ fixed 2026-06-08

Identical helpers live in
[players/[id]/page.tsx#L52-L60](../../apps/web/src/app/players/[id]/page.tsx#L52-L60),
[players/page.tsx](../../apps/web/src/app/players/page.tsx), and a third
`initials()` in `load-profile-page.ts`. **Fixed:** all three now call
`playerName` / `playerInitials` from the new
[lib/player-name.ts](../../apps/web/src/lib/player-name.ts). The single-word case
was unified to the two-letter form (the directory/public variant), so a player's
hub and public-card initials now match (the hub previously showed one letter).

### PUB-5 — Follow failure is silent · **P3** · ✅ fixed 2026-06-08

[player-viewer-actions.tsx#L70-L90](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx#L70-L90)
optimistically flips state and silently reverts on a thrown
`addFriend`/`removeFriend` — no toast — whereas `handleMessage` directly below
toasts on failure. **Fixed:** both catch branches now
`show({ variant: 'error', … })`
([player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx)).

### PUB-6 — Avatar `alt=""` · **P3** · ✅ fixed 2026-06-08

[page.tsx#L113-L120](../../apps/web/src/app/players/[id]/page.tsx#L113-L120)
rendered the player's photo with `alt=""` (decorative). **Fixed:** the avatar
now carries `alt={`${name}'s profile photo`}`
([page.tsx](../../apps/web/src/app/players/[id]/page.tsx)).

### PUB-7 — The non-host profile is a thin dead-end · **P2** · ✅ fixed 2026-06-10

Formalizes the follow-up deferred from PUB-1. Most players never host, so for
the dominant persona the entire page is: identity card → (usually empty) badge
shelf → (no Hosting section) → (no Videos) → (no Past events). A visitor who
clicks through from `/players` or a shared link lands on a card with a name, a
city, maybe positions and socials, and **nothing else to do or learn** — no
sense of who this player is in the community, and the only actions are
follow / message / share.

The data to fix this already exists and is PII-safe to read:

- **Membership context.** The player's **public groups** and **teams** are the
  obvious "member of …" row (the deferred PUB-1 idea). Groups have a public
  directory + cards already; reuse that shape.
- **Member-since.** `profiles_public.created_at` is selected by neither
  `PLAYER_COLUMNS` nor `CARD_COLUMNS`
  ([supabase-profile-repository.ts#L62-L65](../../packages/infrastructure/src/supabase-profile-repository.ts#L62-L65)).
  A "Member since {year}" line under the name is a cheap trust signal.
- **An "about" blurb.** There is **no `bio`/`tagline` column** on `profiles`
  at all (verified against `database.types.ts`) — a short free-text "about"
  is a genuine product gap, not just an unsurfaced field. Smallest increment
  if added: one `bio` column → `profiles_public` → a paragraph under the
  identity card.

**Recommended fix:** add a **"Plays with"** (groups/teams) row sourced from the
existing public group/team reads, plus a "Member since {year}" line from
`created_at`. Treat `bio` as a separate, larger increment (needs a column +
editor + moderation pass via the existing `ContentModeration`). Ship the
membership row first — it's the highest-value, no-new-schema change and turns
the page from an identity stub into a real profile.

**Fix (done 2026-06-10):**

- **Member since.** `created_at` threaded onto `PlayerProfile` / `PLAYER_COLUMNS`
  ([supabase-profile-repository.ts](../../packages/infrastructure/src/supabase-profile-repository.ts));
  the identity card renders "Member since {year}" via a pure
  `createdAt.slice(0, 4)` string slice (no `new Date()` in render — AGENTS
  pattern #4).
- **Groups + Teams.** New co-located
  [\_components/plays-with.tsx](../../apps/web/src/app/players/[id]/_components/plays-with.tsx)
  (`loadPlaysWith` loader + `PlaysWith` view, mirroring the
  `hosted-events-list.tsx` co-location pattern). It **reuses the canonical
  cards** — `GroupCard` and `TeamCard` (its `role="public"` variant) — and the
  existing `SupabaseGroupQueryRepository.listMembershipsForUser`, plus a direct
  `team_members → teams!inner` read filtered to `status = 'active'` and
  `deleted_at IS NULL`. Runs under the anon client (the four tables select under
  RLS `using (true)`), so the page stays ISR-cacheable. Each sub-section
  self-hides when empty and the whole block returns `null` for a player with no
  public memberships — no hollow placeholders. Wired into the page after the
  badge shelf.
- **`bio` deferred** as called out above (needs a new column + editor +
  moderation).

### PUB-8 — Profile hero-banner path is wired in the backend but has no UI · **P3** · ✅ fixed 2026-06-10 (completed, not removed)

`profiles` is a first-class `entityType` for hero images, fully plumbed:

- `saveHeroImageUrl(entityType, …)` has a `profiles` branch that runs the
  `SetProfileHeroImageCommand` through `getUserProfileHandlers().setHeroImage`
  ([hero-image-actions.ts#L75-L83](../../apps/web/src/app/hero-image-actions.ts#L75-L83)).
- The command + handler exist
  ([packages/application/src/messages/user-profile.ts](../../packages/application/src/messages/user-profile.ts),
  [user-profile.handler.ts](../../packages/application/src/commands/user-profile.handler.ts))
  and are wired in [handlers.ts#L512](../../apps/web/src/lib/handlers.ts#L512).
- `profiles_public.hero_image_url` is exposed in the view.

But **nothing calls it and nothing renders it.** The only `HeroImagePanel` /
`HeroImageUpload` call site is the **event edit** page (`entityType="events"`);
no `entityType="profiles"` mount exists, the profile editor has no hero
uploader, the private hub's `ProfileIdentityHero` shows no banner
([profile-hub-sections.tsx#L36-L76](../../apps/web/src/app/profile/_components/profile-hub-sections.tsx#L36-L76)),
and the public page never reads `hero_image_url` (it's not in `PLAYER_COLUMNS`).
Events and groups both display a hero banner, so the intent was almost
certainly profile banners too — the feature was scaffolded and abandoned.

**Resolution — completed (option 1).** The backend was already correct
end-to-end (`saveHeroImageUrl('profiles', …)` → `SetProfileHeroImageHandler`
→ aggregate `setHeroImage` → `SupabaseUserRepository.save` writes
`hero_image_url`), so only the two UI ends were missing:

1. **Set it.** A `profiles` `HeroImagePanel` now sits next to `AvatarPanel` in
   the profile editor's "Edit profile" disclosure
   ([profile/page.tsx](../../apps/web/src/app/profile/page.tsx)) — `entityId ===
userId`, same `returnPath` rule as the avatar. `hero_image_url` was threaded
   through `load-profile-page.ts` so the panel shows the current banner.
2. **Render it.** `hero_image_url` selected into `PLAYER_COLUMNS`; the public
   page renders a `<HeroImage>` band at the top **only when the player uploaded
   one** ([page.tsx](../../apps/web/src/app/players/[id]/page.tsx)). A person's
   card stays clean otherwise — the default court art is reserved for
   venue-like surfaces (events/groups), not every profile.
3. **Orphan sweep — already covered.** `purge_hero_image_orphans` has had a
   `profiles` liveness branch (with the `?t=` cache-buster guard) since
   [20260819000000](../../supabase/migrations/20260819000000_fix_hero_image_orphan_cache_buster.sql),
   so **no migration was needed** (AGENTS pattern #14 already satisfied).

The "remove it" path is therefore moot — the half-feature is now a whole one.

### PUB-9 — Avatar intrinsic size (72) doesn't match its rendered size (80px) · **P3** · ✅ fixed 2026-06-10

[page.tsx#L107-L114](../../apps/web/src/app/players/[id]/page.tsx#L107-L114)
passes `width={72} height={72}` to `next/image` but renders it at
`className="h-20 w-20"` (= 5rem = **80px**). Next's optimizer requests/serves
for the 72px intrinsic, so the browser upscales to 80 (and on retina requests
2×72 = 144 to fill a 160-device-px box) → a faintly soft avatar. The private
hub gets this right — `width={80} height={80}` for the same `h-20 w-20`
slot ([profile-hub-sections.tsx#L40-L46](../../apps/web/src/app/profile/_components/profile-hub-sections.tsx#L40-L46)).
**Fixed:** `width={80} height={80}` to match the rendered box (matching the
hub's value, so Next's srcset handles DPR)
([page.tsx](../../apps/web/src/app/players/[id]/page.tsx)).

### PUB-10 — "No home city set" is owner copy shown to every visitor · **P3** · ✅ fixed 2026-06-10

[page.tsx#L129](../../apps/web/src/app/players/[id]/page.tsx#L129) renders
`{profile.homeCity ?? 'No home city set'}`. On a **third-party** profile the
fallback reads as an instruction to _you_ ("…set") about _someone else's_
missing field — awkward on a card a stranger is viewing. (It's fine on the
private hub, which is owner-facing.) **Fixed:** the public card omits the
home-city line entirely when `homeCity` is null, rather than echoing
owner-state copy ([page.tsx](../../apps/web/src/app/players/[id]/page.tsx)).

### PUB-11 — No block/report affordance for a signed-in viewer · **P3** · ✅ Block shipped 2026-06-10 · ⛔ Report deferred

`PlayerViewerActions` offered only follow / message / share. Blocking only
existed inside a chat thread, so to block someone a viewer had to first open a
DM with them. The public profile is the natural place to **block** a player
you've never messaged.

**Block — fixed (2026-06-10).** Added a `⋯` overflow menu (Radix `DropdownMenu`,
same pattern as `host/_components/event-actions-menu.tsx`) on the `other` viewer
state with **Block / Unblock**, reusing the existing `blockUser` / `unblockUser`
chat actions ([player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx)).
The hydration effect now reads `user_blocks` (owner-scoped RLS) alongside
`friendships` to seed the toggle; optimistic with rollback + toast on failure.
When blocked, the **Message** button is hidden (a blocked pair can't DM —
RLS `is_blocked_pair` — so offering it would guarantee a `forbidden`).

**Report — deferred (needs backend, not "just an entry point").** The audit
originally lumped Report in as a free addition, but unlike Block it has **no
machinery**: reports today are per-content (`media_post_reports`,
`message_reports`) — there is no profile-report table, no `ReportProfileCommand`,
and no admin moderation queue (admin is `community-import`-only). A "Report
player" button would either go nowhere or require a new table + domain command +
handler + an admin review surface — disproportionate for a P3 with nothing to
consume the reports. Tracked as a follow-up; see below.

### PUB-12 — The profile row is read up to 3× per render · **P3** · ✅ fixed 2026-06-10 (carried from PUB-3)

`generateMetadata` (`findCardByHandle`), the page (`findPlayerByHandle`), and
the OG route (`findCardByHandle`) each issued their own `profiles_public` query
for the same handle. ISR masks the cost, but metadata + the page run in the
**same request**. **Fixed:** new
[\_loaders/load-player.ts](../../apps/web/src/app/players/[id]/_loaders/load-player.ts)
wraps the handle→profile read in `React.cache`, and **both** `generateMetadata`
and the page now call `getPlayerByHandle` — so a cache-MISS render fires one
query instead of two. `discoverable` was threaded onto `PlayerProfile` /
`PLAYER_COLUMNS` so metadata reads the noindex flag off the shared row rather
than its own `findCardByHandle`. The OG route is a separate render and keeps its
own (independent) read, as before.

---

## Remediation log

### 2026-06-10 — PUB-11 (Block) + PUB-12 shipped

Third same-day bundle on this surface. Verified `pnpm typecheck && pnpm lint &&
pnpm test && pnpm build` (all green).

- **PUB-11 ◑** — added a `⋯` overflow menu (Radix `DropdownMenu`) on the `other`
  viewer state with **Block / Unblock**, reusing `blockUser` / `unblockUser`.
  The hydration effect reads `user_blocks` alongside `friendships`; optimistic +
  toast on failure; Message hides when blocked (blocked pairs can't DM). The
  **Report** half is deferred — it has no backend (per-content reports only, no
  profile-report table, no admin queue) and would be new machinery, not an entry
  point.
- **PUB-12 ✅** — `getPlayerByHandle` (`React.cache`, new
  [\_loaders/load-player.ts](../../apps/web/src/app/players/[id]/_loaders/load-player.ts))
  is now shared by `generateMetadata` and the page, collapsing two identical
  `profiles_public` reads into one per render. `discoverable` threaded onto
  `PlayerProfile` so metadata no longer needs its own `findCardByHandle`.

### 2026-06-10 — Re-audit; headline PUB-7 + PUB-8 bundle shipped

Six new findings opened (see Findings); the top two fixed the same day.
Verified `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (all green —
375 tests pass, 0 lint errors).

- **PUB-7 ✅** — non-host profiles gained a "Member since {year}" line
  (`created_at` via a pure string slice) and a **Groups / Teams** community
  block. New co-located
  [\_components/plays-with.tsx](../../apps/web/src/app/players/[id]/_components/plays-with.tsx)
  reuses `GroupCard` / `TeamCard` (`role="public"`) +
  `listMembershipsForUser` + a `team_members` read (active, non-deleted),
  all under the anon client so the page stays ISR-cacheable. Self-hides when
  the player has no public memberships. `bio` deferred (needs schema).
- **PUB-8 ✅** — the dead profile hero-banner path was **completed** (not
  removed): `HeroImagePanel entityType="profiles"` added to the editor +
  `hero_image_url` threaded through `load-profile-page.ts`; `hero_image_url`
  selected into `PLAYER_COLUMNS` and a `<HeroImage>` band rendered atop
  `/players/[id]` when set. The write path + the orphan-sweep `profiles`
  branch were already in place, so **no migration** and no new backend.
- **PUB-9 ✅** — avatar `width/height` 72 → 80 to match the rendered `h-20 w-20`
  box (the hub's value), so Next's srcset serves the right resolution.
- **PUB-10 ✅** — the public card omits the home-city line when unset instead of
  rendering "No home city set" (owner copy) to a stranger.
- **Still open (P3):** PUB-11 (block/report), PUB-12 (3× row read).

### 2026-06-08 — First audit; both P2 fixed same day

Verified `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (all green).

- **PUB-1 ✅** — host-events section renamed "Upcoming events" → **"Hosting"**
  and gated on `upcoming.length > 0`, so non-host profiles no longer render an
  empty, mislabeled block.
- **PUB-2 ✅** — `discoverable` threaded onto `ProfileCard`; `generateMetadata`
  emits `robots: noindex` and the sitemap excludes opted-out handles, so a
  "private" player is no longer crawled (direct-link reachability unchanged).

### 2026-06-08 — P3 cleanup bundle (PUB-3…6)

Same-day follow-up; verified `pnpm typecheck && pnpm lint && pnpm test && pnpm
build` (all green).

- **PUB-3 ✅** — `opengraph-image.tsx` now reads `createSupabaseAnonClient()`
  instead of the cookie-bound `getServerSupabase()`, matching the page +
  metadata and keeping the OG route cacheable.
- **PUB-4 ✅** — new [lib/player-name.ts](../../apps/web/src/lib/player-name.ts)
  (`playerName` / `playerInitials`) replaces three divergent copies (public
  profile, players directory, hub loader). Single-word initials unified to the
  two-letter form, so a player's hub + public-card initials now match.
- **PUB-5 ✅** — `handleFollow` / `handleUnfollow` now toast on failure (was a
  silent optimistic revert).
- **PUB-6 ✅** — avatar `alt` now names the player.

**All findings resolved.** Deferred product follow-up (not a finding): give the
non-host public page more substance (a public "member of" groups/teams row).
