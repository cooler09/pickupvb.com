# Teams Directory UX Audit

_Last updated: 2026-06-01_

UX/UI evaluation of the **teams page**
([apps/web/src/app/teams/page.tsx](../../apps/web/src/app/teams/page.tsx)) — the
third Connect directory, which pairs a viewer-only **"My teams"** panel
([\_components/my-teams-panel.tsx](../../apps/web/src/app/teams/_components/my-teams-panel.tsx))
with a public, ISR-cached **"Discover teams"** listing.

Goal: same lens as `/players` and `/groups` — make each discover card carry the
signal that matters for its persona, and converge the page with its siblings.

This file is complementary to — not a duplicate of:

- [players-page-ux.md](players-page-ux.md) / [groups-page-ux.md](groups-page-ux.md)
  — the sibling directories. TM-2 (field vocab) and TM-3 (result count) are
  direct analogs of PL-3/G-3 and PL-4/G-4. The **follow-from-directory** items
  (PL-2/G-2) have **no analog here** — see the persona note below.
- [persona-ux.md](persona-ux.md) — CTA/field vocabulary; TM-2 is the CC-2 drift.
- [architecture.md](architecture.md) — TM-4 (the discover read is a raw inline
  query, not behind a read-side port like `/players` + `/groups`) is the P2-1
  read-port theme, noted from the UX-consistency angle.

> **Status update (2026-06-10, fixes shipped):** All re-audit findings
> (**TM-5…TM-14**) are **fixed, quad-green, uncommitted** (no migration —
> rename reuses the existing `teams.name` column). Highlights: every captain
> mutation now redirects with a `?roster=` / `?invite=` / `?team=` flash the new
> client `TeamFlash` island renders as an `<Alert>` (TM-5/TM-6) — which also
> **fixed a latent 500**: a full-roster `InvariantViolation` was previously
> uncaught in `addMemberFromForm`; `?deleted=1` + `?broadcast=sent` now surface
> banners (TM-6); a captain "Enter this team in an event → /events" CTA closes the
> registration loop (TM-7); the dead `TeamMemberRow` remove path is gone and rows
> link to player profiles (TM-8/TM-9); `memberName` deduped (TM-10); broadcast +
> off-site inputs use `fieldInputClass` (TM-11); dead `firstName`/`lastName` +
> `ok` state removed (TM-12); captain **rename** added end-to-end —
> `Team.rename()` + `RenameTeamCommand`/`Handler` + domain & handler tests
> (TM-13); TM-1/TM-2 annotated stale (TM-14). The detail page **stays
> ISR-cacheable** — the flash is read via client `useSearchParams()` in a
> Suspense boundary, so the RSC body still never touches `searchParams`/`cookies()`.
> See the remediation log. **Original re-audit findings below.**
>
> **Status update (2026-06-10):** Re-audit extended to the surfaces the
> 2026-06-01 pass left out of scope — the **`/teams/[id]` detail page**, the
> **`MyTeamsPanel`**, and the **create flow**. **0 P1 · 3 P2 · 6 P3** (all fixed
> the same day — see the block above).
> Headline gaps are **feedback** ones: captain mutations (add/remove/accept/
> decline/extra-members) swallow every error silently (TM-5), and both flash-param
> redirects (`?deleted=1`, `?broadcast=sent`) are **set but never consumed** so
> delete + broadcast give no confirmation (TM-6). The page's whole pitch — "sign
> up for tournaments together" — has **no team→event CTA** (TM-7). Plus stale
> code: `TeamMemberRow`'s remove path is dead (the only caller hardcodes
> `viewerIsCaptain={false}`) and captains see the roster twice (TM-8); roster rows
> don't link to player profiles unlike `/groups` (TM-9); `memberName` is duplicated
> (TM-10); the broadcast/extra-member inputs bypass the field vocabulary (TM-11);
> and `firstName`/`lastName` + `state.ok` are dead (TM-12). Note: the **2026-06-01
> findings below are partly stale** — `teams.format` was dropped by migration
> `20260911000000_drop_teams_format.sql`, so the TM-1 "Recruiting/Full" chip and
> TM-2 "format select" no longer exist (TM-14). Detail in the **Re-audit
> 2026-06-10** section.
>
> **Status update (2026-06-01):** Full persona-lens evaluation; **all four
> findings (TM-1…TM-4) shipped the same day.** No P1, no P2 — a well-built page
> that got polish + convergence: TM-1 a **"N/size · Recruiting / Full"** roster
> chip on the discover card; TM-2 search input + format select →
> `fieldInputClass`; TM-3 a "Discover teams · {total}" count; TM-4 the inline
> discover query extracted into a **`TeamQueries.searchDirectory`** port +
> `SupabaseTeamQueryRepository` (mirroring `ProfileQueries`/`GroupQueries`), which
> is where TM-1's roster + captain hydration now live. The three Connect
> directories now read through parallel read-side ports. **No follow/join-from-
> directory finding** — team rosters are captain-invite-only.
>
> Grounding facts: `team_members` is publicly selectable (RLS `using (true)`) and
> `teams.extra_member_count` + the `format` enum (doubles=2 … sixes=6) are
> available, so the TM-1 roster signal is anon-safe and migration-free. Teams are
> **not self-joinable** (roster is captain-invite-only via `AddTeamMember`), which
> is why there's no follow/join-from-directory finding.

---

## Persona model

| Persona               | What the teams page must make obvious                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| **Player / recruit**  | Which teams exist, their format, and **whether they're recruiting** (roster)   |
| **Team captain**      | My teams + rosters at the top (the `MyTeamsPanel`), a fast "new team" path     |
| **Visitor** (no auth) | "Are there real rosters here?" — scannable cards; the My-teams panel gates off |

**Why no "act from the directory" finding (unlike PL-2/G-2):** players are
followable and groups are followable, but a **team roster is captain-invite-only**
(`AddTeamMember` requires the captain). There's no self-serve "join" or "follow"
a team, so the directory is correctly pure discovery → the team page → the
captain recruits you. Not a gap.

---

## What's already good (so we don't regress it)

- **Shared `TeamCard`** already exists
  ([team-card.tsx](../../apps/web/src/app/teams/_components/team-card.tsx)) and is
  reused by both the discover listing and the My-teams panel (with a role badge)
  — no hand-rolled duplication to fix (contrast G-5).
- **Search button is already `primaryButtonClass()`**, and there's a **format
  filter** select — richer filtering than `/players` or `/groups`.
- **`MyTeamsPanel` handles anon/signed-out** — "Sign in to create a team" rather
  than showing create depth (the V-4 concern is handled here).
- **ISR-cacheable** anon discover read, shared `Pagination` with SQL `range` +
  `count: 'exact'`.

---

## Findings

### A. Information scent (the card's job)

#### TM-1 — Discover cards don't show roster size / "recruiting vs full" · **P3** · ✅ resolved 2026-06-01

The discover `TeamCard` shows name + format + captain
([team-card.tsx#L38-L44](../../apps/web/src/app/teams/_components/team-card.tsx#L38-L44)),
but not **how full the roster is** — the single most useful signal for a player
scanning for a team to join or a captain sizing up the field. A doubles team with
1 player is recruiting; a quad with 4 is full. The data is available and
anon-safe: `team_members` (RLS `using (true)`) for the active roster,
`teams.extra_member_count` for off-site players, and the `format` enum for the
target size (doubles=2, triples=3, quads=4, sixes=6).

**Fix (done):** the new `TeamQueries.searchDirectory` (TM-4) projects
`rosterCount` (active `team_members` count, anon-safe, + `extra_member_count`) and
`teamSize` (via the domain `playersPerSide(format)`) per card. `TeamCard` gained
optional `rosterCount`/`teamSize` props and renders a chip — **"3/4 ·
Recruiting"** (emerald) while `rosterCount < teamSize`, else **"Full"** (muted).
The role badge is unchanged; the My-teams panel can opt into the chip later.
[team-card.tsx](../../apps/web/src/app/teams/_components/team-card.tsx),
[supabase-team-query-repository.ts](../../packages/infrastructure/src/supabase-team-query-repository.ts).

### B. Consistency / convergence

#### TM-2 — Search input + format select bypass the shared field vocabulary · **P3** (PL-3/G-3 analog) · ✅ resolved 2026-06-01

The search input and the format `<select>` hand-roll `border-border-base
bg-surface rounded-md border px-3 py-2 text-sm`
([page.tsx#L94-L113](../../apps/web/src/app/teams/page.tsx#L94-L113)) instead of
`fieldInputClass` / the shared select recipe. (The Search button is already
canonical.) **Fix (done):** both the input **and** the format `<select>` now use
`fieldInputClass` (a select takes the same chassis cleanly), with `sm:items-center`
on the row so the label-oriented `mt-1` aligns. Cross-ref persona-ux **CC-2**.
[teams/page.tsx](../../apps/web/src/app/teams/page.tsx).

#### TM-3 — No result count on the Discover section · **P3** (PL-4/G-4 analog) · ✅ resolved 2026-06-01

The discover query returns `discoverTotal`
([page.tsx#L63-L65](../../apps/web/src/app/teams/page.tsx#L63-L65)) but the
"Discover teams" header never shows it — unlike the `Players · {total}` /
`Groups · {total}` counts just added. **Fix (done):** the "Discover teams"
header now reads "Discover teams · {total}".
[teams/page.tsx](../../apps/web/src/app/teams/page.tsx).

#### TM-4 — The discover read is a raw inline query, not behind a read-side port · **P3** (consistency / architecture) · ✅ resolved 2026-06-01

`/players` and `/groups` read their directories through `ProfileQueries.searchDirectory`
/ `GroupQueries.searchDirectory` (read-side ports, architecture P2-1), but the
teams discover listing issues a raw `supabase.from('teams').select(...)` **inline
in the page** ([page.tsx#L54-L71](../../apps/web/src/app/teams/page.tsx#L54-L71)),
including the captain-name resolution. It works, but it's the odd one out and has
no test seam — and it's the natural home for the TM-1 roster-count logic.
**Fix (done):** extracted a `TeamQueries.searchDirectory` port
([team-queries.ts](../../packages/domain/src/teams/team-queries.ts)) + a
`SupabaseTeamQueryRepository` adapter
([supabase-team-query-repository.ts](../../packages/infrastructure/src/supabase-team-query-repository.ts))
mirroring `ProfileQueries`/`GroupQueries` — the team query, captain-name
hydration (adapter-composes-`SupabaseProfileRepository`), and TM-1 roster counts
all moved off the page. The page now calls `new SupabaseTeamQueryRepository(supabase).searchDirectory(...)`
([teams/page.tsx](../../apps/web/src/app/teams/page.tsx)), shedding its inline
`supabase.from('teams')` query + `SupabaseProfileRepository` import. The three
directories now read through parallel read-side ports.

---

## Re-audit 2026-06-10 — detail page, My-teams panel, create flow

> **All findings below are ✅ resolved 2026-06-10** (quad-green, uncommitted).
> The per-finding **Fix** notes are the as-shipped record; see the remediation
> log at the bottom for the file-by-file summary.

The 2026-06-01 pass covered only the discover directory and explicitly left the
`/teams/[id]` detail page + `MyTeamsPanel` for "their own pass if needed." This
is that pass. The detail page is well-architected (ISR shell + `TeamViewerChrome`
client island, league records, room chat) — the gaps are **feedback**, one
**missing primary path**, and accumulated **stale code**.

### A. Feedback (the user can't tell if it worked)

#### TM-5 — Captain roster mutations swallow every error with no feedback · **P2**

`addMemberFromForm`, `removeMemberFromForm`, `acceptInviteAction`,
`declineInviteAction`, and `setExtraMembersFromForm` all catch their typed
`DomainError`s and `return` silently — the comment even says "UI shows a generic
toast in a future pass"
([actions.ts#L98-L110](../../apps/web/src/app/teams/actions.ts#L98-L110),
[#L218-L229](../../apps/web/src/app/teams/actions.ts#L218-L229)). So when a
captain adds a player who is at the roster cap, already invited, or private
(`discoverable = false`,
[#L90](../../apps/web/src/app/teams/actions.ts#L90)), the picker just clears and
**nothing happens** — no success confirmation on the happy path either. These are
plain `<form action>` (void-returning) wrappers, so the right pattern is
**flash-param redirects** (AGENTS.md "Server-action error handling"): redirect to
`${returnPath}?member=added` / `?member=cap` / `?member=private` etc. and have the
page render an `<Alert>`. **Fix:** map each typed-error branch to a reason code,
redirect with it, and read it on the page (see TM-6 — the page must consume
searchParams anyway). Reference: the event RSVP flash actions
([events/[id]/rsvp-actions.ts](../../apps/web/src/app/events/[id]/rsvp-actions.ts))
and the groups GD-1 member-fail feedback fix.

#### TM-6 — `?deleted=1` and `?broadcast=sent` flash params are set but never consumed · **P2**

Two actions redirect with a success flag that **nothing reads**:

- `deleteTeamAction` → `redirect('/teams?deleted=1')`
  ([delete-actions.ts#L79](../../apps/web/src/app/teams/[id]/delete-actions.ts#L79)),
  but the directory page only destructures `{ q, page }`
  ([page.tsx#L32-L34](../../apps/web/src/app/teams/page.tsx#L32-L34)) — no
  "Team deleted" banner.
- `sendTeamBroadcast` → `redirect('/teams/${slug}?broadcast=sent')`
  ([broadcast-actions.ts#L82](../../apps/web/src/app/teams/[id]/broadcast-actions.ts#L82)),
  but `TeamDetailPage` takes only `{ params }` and never reads `searchParams`
  ([page.tsx#L61](../../apps/web/src/app/teams/[id]/page.tsx#L61)) — no "Message
  sent" confirmation, and the broadcast `<details>` collapses on the post-redirect
  re-render, so the captain has zero signal the message went out.

**Fix:** add `searchParams` to both pages and render an `<Alert variant="success">`
when the flag is present (the `/events/[id]` page is the reference — it reads
`waiver` / `created` / `tip` / `cohost` flashes via a `pickQuery` helper,
[events/[id]/page.tsx#L173-L252](../../apps/web/src/app/events/[id]/page.tsx#L173-L252)).
This also unblocks TM-5's redirect-flash feedback.

### B. Missing primary path

#### TM-7 — No team→event registration CTA · **P2**

Every surface promises the same job — "Build a roster once, then **sign up for
tournaments together**"
([page.tsx#L60-L61](../../apps/web/src/app/teams/page.tsx#L60-L61)),
"You can sign it up for tournaments and leagues of any format"
([new-team-form.tsx#L32-L34](../../apps/web/src/app/teams/new/new-team-form.tsx#L32-L34))
— but the team detail page has **no link to act on it.** Registration only exists
on the _event_ side (`tournament-signup-panel.tsx` lets a captain pick a team),
so the flow is one-directional: a captain who lands on their team page has no path
to "which tournaments can I enter this team in." The only `/events` link is from
historical league records. **Fix:** add a captain-visible CTA in
`TeamViewerChrome` (or the header) — e.g. "Find tournaments to enter →" linking to
`/events` (ideally a team-friendly filter). Low effort, closes the loop on the
page's stated purpose.

### C. Stale code / convergence

#### TM-8 — `TeamMemberRow`'s remove path is dead; captains see the roster twice · **P3**

`TeamMemberRow` has a full captain-remove affordance (`canRemove`, the
`removeMemberFromForm` form, `SubmitButton`) gated on `viewerIsCaptain`
([team-member-row.tsx#L39-L71](../../apps/web/src/app/teams/[id]/_components/team-member-row.tsx#L39-L71)),
but the **only caller hardcodes `viewerIsCaptain={false}`**
([page.tsx#L144](../../apps/web/src/app/teams/[id]/page.tsx#L144)) — so the branch
is unreachable. The actual remove UI is a **second, duplicate roster list** in
`TeamViewerChrome`'s "Roster controls" section
([team-viewer-chrome.tsx#L98-L123](../../apps/web/src/app/teams/[id]/_components/team-viewer-chrome.tsx#L98-L123)),
which re-renders every non-captain member's name with a Remove/Cancel button. Net:
the captain scrolls the roster, then sees the same names again under controls.
**Fix:** either drop the dead `viewerIsCaptain`/remove path from `TeamMemberRow`
(simplest), or invert it — have the captain's roster render inline remove buttons
on the real roster and delete the duplicate "Roster controls" list (better UX, one
list). Note the SC→CC function-prop pitfall (AGENTS.md): the roster is server
rendered, so inline buttons need the row to become a client component or take the
bound action — the existing duplicate list exists precisely to keep the roster on
the server. Pick one and remove the dead code.

#### TM-9 — Roster rows don't link to player profiles · **P3** (convergence with `/groups`)

A roster member is rendered as initials + name with no link
([team-member-row.tsx#L43-L62](../../apps/web/src/app/teams/[id]/_components/team-member-row.tsx#L43-L62)),
so teammates are dead ends. `/groups` member rows link to the player's public
profile (`/players/${handle ?? userId}`,
[groups/[id]/\_components/members-section.tsx#L81](../../apps/web/src/app/groups/[id]/_components/members-section.tsx#L81)).
**Fix:** wrap the name in a `Link` to `/players/${handle ?? userId}` — requires
adding `handle` to the member projection (the page already resolves cards via
`ProfileQueries`; `profiles_public` exposes the handle).

#### TM-10 — `memberName` duplicated verbatim across two files · **P3**

Identical `memberName(m)` helper in both
[team-member-row.tsx#L22-L27](../../apps/web/src/app/teams/[id]/_components/team-member-row.tsx#L22-L27)
and
[team-viewer-chrome.tsx#L129-L134](../../apps/web/src/app/teams/[id]/_components/team-viewer-chrome.tsx#L129-L134).
**Fix:** export it once (e.g. alongside `TeamRosterMember` in `team-member-row.tsx`)
and import in the chrome.

#### TM-11 — Broadcast + extra-member inputs bypass the shared field vocabulary · **P3** (CC-2 analog, like TM-2)

The broadcast subject `<input>` and message `<textarea>` hand-roll
`border-border-base bg-bg w-full rounded-md border px-3 py-2 text-sm`
([captain-broadcast-panel.tsx#L43-L67](../../apps/web/src/app/teams/[id]/_components/captain-broadcast-panel.tsx#L43-L67)),
and the off-site count `<input>` hand-rolls the same chassis at `w-24`
([extra-members-form.tsx#L33-L40](../../apps/web/src/app/teams/[id]/_components/extra-members-form.tsx#L33-L40)) —
instead of `fieldInputClass` / the `TextField` primitive (AGENTS.md pattern #11).
These also use `bg-bg` rather than a surface role. **Fix:** route through
`fieldInputClass` (the numeric input can compose `w-24` on top, or opt out with an
`eslint-disable` + reason per the ratchet convention).

#### TM-12 — Dead `firstName`/`lastName` fields and dead `state.ok` · **P3**

The detail page reads members from `profiles_public`, which exposes only
`displayName`, so it maps `firstName: null, lastName: null` unconditionally
([page.tsx#L91](../../apps/web/src/app/teams/[id]/page.tsx#L91)). The
`TeamRosterMember.firstName/lastName` fields
([team-member-row.tsx#L7-L11](../../apps/web/src/app/teams/[id]/_components/team-member-row.tsx#L7-L11))
are therefore always null, so the full-name branch in `memberName` never fires —
it's permanently `displayName`. Separately, `CaptainBroadcastPanel` and
`DeleteTeamPanel` both type `State = { ok?: boolean }`
([captain-broadcast-panel.tsx#L9](../../apps/web/src/app/teams/[id]/_components/captain-broadcast-panel.tsx#L9),
[delete-team-panel.tsx#L13](../../apps/web/src/app/teams/[id]/_components/delete-team-panel.tsx#L13))
but both actions `redirect` on success, so `ok` is never set or rendered. **Fix:**
drop `firstName`/`lastName` from `TeamRosterMember` and simplify `memberName` to
`displayName`; drop the unused `ok` from both `State` types.

#### TM-13 — No rename / edit-team affordance · **P3**

A captain can create a team with a name but has no way to **rename** it — there's
no edit action or UI, only create ([new/](../../apps/web/src/app/teams/new/)) and
delete. **Fix:** add an inline rename (small captain-only form in
`TeamViewerChrome`) backed by a `RenameTeamCommand`, or fold it into a future
"team settings" panel. Low priority but it's a basic owner capability.

#### TM-14 — This audit's TM-1/TM-2 are stale (format dropped) · **P3** (doc)

`teams.format` was dropped by
[20260911000000_drop_teams_format.sql](../../supabase/migrations/20260911000000_drop_teams_format.sql)
("teams are just a roster of people"). Consequently the **TM-1 "N/size ·
Recruiting/Full" chip and the TM-2 format `<select>` filter described above no
longer exist** — `TeamCard` now shows only "N players"
([team-card.tsx#L43-L49](../../apps/web/src/app/teams/_components/team-card.tsx#L43-L49))
and the directory form has just the search input
([page.tsx#L75-L86](../../apps/web/src/app/teams/page.tsx#L75-L86)). This isn't a
bug (a formatless team has no "full" state), but the 2026-06-01 findings read as
current when they're not. **Fix:** annotate TM-1/TM-2 as superseded by the format
drop (done in this re-audit's status block; left inline for history).

---

## Out of scope

- **`MyTeamsPanel`** internals are now covered above; the only remaining nit is a
  **double create CTA** when "Captained" is empty but the viewer has pending
  invites or rostered teams (both the top "+ New team" and the empty-state
  "+ Create your first team" show) — trivial, folded into TM-8-class cleanup if
  touched. Not separately tracked.
- **Team / room chat** (`RoomChatPanel`) behavior is owned by the
  notifications-messaging + messages-page audits, not here.

## Remediation log

### 2026-06-10 — TM-5…TM-14 bundle (detail-page feedback, CTA, rename, cleanup)

Shipped all ten re-audit findings the same day. Verified `pnpm typecheck && lint
&& test && build` (all green; the only typecheck fix was casting the
`${returnPath}?…` flash redirect to `Route` at one centralized `flashRedirect`
seam, since typedRoutes can't verify an opaque `returnPath` string). No
migration — rename reuses `teams.name`. Journal:
[2026-06-10-teams-detail-page.md](../journal/2026-06-10-teams-detail-page.md).

- **TM-5 + TM-6 ✅** — every captain/roster mutation
  ([actions.ts](../../apps/web/src/app/teams/actions.ts)) now maps its typed
  errors to a reason code and `flashRedirect`s (`?roster=` / `?invite=` /
  `?team=`); a new client `TeamFlash`
  ([team-flash.tsx](../../apps/web/src/app/teams/[id]/_components/team-flash.tsx))
  renders the banner via `useSearchParams()` in a Suspense boundary so the page
  stays ISR-cacheable. `?deleted=1` now renders a banner on the directory
  ([teams/page.tsx](../../apps/web/src/app/teams/page.tsx)). **Also fixed a latent
  500**: a full-roster `InvariantViolation` was previously uncaught in
  `addMemberFromForm` (the catch list omitted it) → it now maps to `?roster=cap`.
- **TM-7 ✅** — captain "Enter this team in an event → /events" CTA at the top of
  `TeamViewerChrome`.
- **TM-8 ✅** — dropped the dead `viewerIsCaptain`/remove path from `TeamMemberRow`
  (now `{ member, isCaptain }`, display-only); captain removal stays in the
  viewer island's "Roster controls."
- **TM-9 ✅** — roster rows link to `/players/${handle ?? userId}` (handle threaded
  through the member projection).
- **TM-10 ✅** — `memberName` exported once from `team-member-row.tsx`, imported by
  the chrome.
- **TM-11 ✅** — broadcast subject/body + off-site count → `fieldInputClass`.
- **TM-12 ✅** — dropped `firstName`/`lastName` from `TeamRosterMember` (always
  null) and the unused `ok` from both panel/action `State` types.
- **TM-13 ✅** — captain rename end-to-end: `Team.rename()` (domain, profanity +
  non-empty guards) + `RenameTeamCommand`/`RenameTeamHandler` (captain-gated) +
  domain & handler tests + inline form in `TeamViewerChrome`.
- **TM-14 ✅** — TM-1/TM-2 annotated stale (format drop) in the status block.

### 2026-06-01 — TM-1…TM-4 bundle (roster signal + vocab + count + read-side port)

Shipped all four findings the same day. Verified `pnpm typecheck && lint && test
&& build` (all green; one mid-build typecheck fix — `.eq('format', format as
Format)` — since `TeamDirectoryQuery.format` is a plain `string` at the port
boundary but the column is the format enum). Journal:
[2026-06-01-teams-directory.md](../journal/2026-06-01-teams-directory.md).

- **TM-4 ✅** — new `TeamQueries.searchDirectory` port
  ([team-queries.ts](../../packages/domain/src/teams/team-queries.ts)) +
  `SupabaseTeamQueryRepository`
  ([supabase-team-query-repository.ts](../../packages/infrastructure/src/supabase-team-query-repository.ts));
  the page sheds its inline query + `SupabaseProfileRepository` import.
- **TM-1 ✅** — `TeamDirectoryCard.rosterCount`/`teamSize` (active `team_members`
  count + `extra_member_count`; `playersPerSide(format)`); `TeamCard` renders a
  "N/size · Recruiting" / "Full" chip.
- **TM-2 ✅** — search input + format select → `fieldInputClass`, row `sm:items-center`.
- **TM-3 ✅** — "Discover teams · {total}" header count.

_All findings resolved. The three Connect directories (`/players`, `/groups`,
`/teams`) now share the read-side-port + card-signal + (where applicable)
follow-island patterns. Re-audit if the page changes materially._
