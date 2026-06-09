# Public Player Profile UX Audit

_Last updated: 2026-06-08_

UX/UI + privacy evaluation of the **public player profile**
([apps/web/src/app/players/[id]/page.tsx](../../apps/web/src/app/players/[id]/page.tsx)) —
the ISR-cached card other players (and search engines) see at
`/players/[handle]`. The `/players` **directory** is a separate surface, audited
in [players-page-ux.md](players-page-ux.md); the player's own authenticated hub
is [profile-page-ux.md](profile-page-ux.md).

> **Status (2026-06-08):** First dedicated audit of this surface. **2 P2 fixed
> same day** — PUB-1 (the host-only event list was titled "Upcoming events" and
> rendered empty for the majority non-host player) and PUB-2 (a `discoverable =
false` "private" player was still sitemapped and indexable). **4 P3 open**
> (PUB-3 OG-image client/perf, PUB-4 helper duplication, PUB-5 silent follow
> failure, PUB-6 avatar alt). No P1. See the **Remediation log** below.

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

### PUB-3 — OG image read is cookie-bound and inconsistent with the page · **P3** · open

[opengraph-image.tsx#L14](../../apps/web/src/app/players/[id]/opengraph-image.tsx#L14)
uses `getServerSupabase()` (reads `cookies()` → forces the OG route dynamic),
while the page and `generateMetadata` both use `createSupabaseAnonClient()`.
`profiles_public` is anon-granted, so the OG route should use the anon client to
match and stay cacheable. (Separately, the same row is read three times per
render — `findCardByHandle` in metadata, `findPlayerByHandle` in the page,
`findCardByHandle` in OG — masked by ISR but avoidable.) **Fix:** switch OG to
`createSupabaseAnonClient()`.

### PUB-4 — `nameOf` / `initialsOf` duplicated across three files · **P3** · open

Identical helpers live in
[players/[id]/page.tsx#L52-L60](../../apps/web/src/app/players/[id]/page.tsx#L52-L60),
[players/page.tsx](../../apps/web/src/app/players/page.tsx), and a third
`initials()` in
[load-profile-page.ts#L117-L120](../../apps/web/src/app/profile/_loaders/load-profile-page.ts#L117-L120).
**Fix:** hoist one `playerName` / `playerInitials` pair into a shared `lib/`
helper (three consumers clears the AGENTS "extract pure helpers" bar).

### PUB-5 — Follow failure is silent · **P3** · open

[player-viewer-actions.tsx#L70-L90](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx#L70-L90)
optimistically flips state and silently reverts on a thrown
`addFriend`/`removeFriend` — no toast — whereas `handleMessage` directly below
toasts on failure. Inconsistent feedback. **Fix:** add a
`show({ variant: 'error', … })` on the catch branches.

### PUB-6 — Avatar `alt=""` · **P3** · open

[page.tsx#L113-L120](../../apps/web/src/app/players/[id]/page.tsx#L113-L120)
renders the player's photo with `alt=""` (decorative). Defensible since the
adjacent `<h1>` carries the name, but a player photo is arguably content;
consider `alt={`${name}'s profile photo`}`. Low priority.

---

## Remediation log

### 2026-06-08 — First audit; both P2 fixed same day

Verified `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (all green).

- **PUB-1 ✅** — host-events section renamed "Upcoming events" → **"Hosting"**
  and gated on `upcoming.length > 0`, so non-host profiles no longer render an
  empty, mislabeled block.
- **PUB-2 ✅** — `discoverable` threaded onto `ProfileCard`; `generateMetadata`
  emits `robots: noindex` and the sitemap excludes opted-out handles, so a
  "private" player is no longer crawled (direct-link reachability unchanged).

_Open: PUB-3 (OG anon client), PUB-4 (helper duplication), PUB-5 (silent follow
failure), PUB-6 (avatar alt) — all P3._
