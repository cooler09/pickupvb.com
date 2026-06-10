# Groups UX Audit

_Last updated: 2026-06-10_

> **Status (2026-06-10):** Scope widened from the directory to the **whole
> groups surface** — detail (`/groups/[id]`), member-management
> (`/members`), edit, billing (`/billing`), and analytics. The 2026-06-01
> directory pass (G-1…G-5) stays ✅ closed below. New detail-surface pass:
> **0 P1 · 3 P2 · 7 P3**. **5 fixed same day, quad-green (GD-1, GD-2, GD-3,
> GD-7, GD-9):** member-management failures now surface via flash-param
> `<Alert>` (last-owner / already-member / unauthorized no longer a silent
> no-op); the directory shows a "Group deleted" banner; the group's "Host an
> event" CTA preselects the club (`?host_group=<slug>`); the directory
> follow button uses `neutralButtonClass`; and a dead `ok` state field was
> dropped. **5 open** (GD-4, GD-5, GD-6, GD-8, GD-10) — `requireGroupManager`
> dedup (×4), member-form field vocab, host h1 size, join-request product
> call, and member-row mobile wrap. No data-loss or auth holes found.
> Findings + fixes in
> "[Findings — detail, members, edit & billing](#findings--group-detail-member-management-edit--billing-2026-06-10)";
> what shipped is in the [remediation log](#2026-06-10--gd-1-gd-2-gd-3-gd-7-gd-9-bundle-member-feedback--polish).

UX/UI evaluation of the **groups directory**
([apps/web/src/app/groups/page.tsx](../../apps/web/src/app/groups/page.tsx)) —
the public, ISR-cached listing of clubs, leagues, and crews, a sibling of
`/players` and `/teams` in the nav's Community group.

Goal: same lens as the other directories — make each card carry enough signal to
answer _"is this a real, active group I'd want to join or follow?"_, let the page
act on that intent, and converge it with its siblings.

This file is complementary to — not a duplicate of:

- [players-page-ux.md](players-page-ux.md) — the sibling directory; **several
  findings here are direct analogs** (G-2↔PL-2 follow-from-directory, G-3↔PL-3
  field vocab, G-4↔PL-4 result count) and should reuse those fixes.
- [home-page-ux.md](home-page-ux.md) — **G-5 is the same drift as the still-open
  H-4** (the group card is hand-rolled on both the home page and here, and they've
  diverged); one shared `GroupCard` closes both.
- [persona-ux.md](persona-ux.md) — CTA/field vocabulary; G-3 is the CC-2 drift.
- [privacy.md](privacy.md) — public group reads; no PII surface to re-litigate.

> **Status update (2026-06-01):** Full persona-lens evaluation; **all five
> findings (G-1…G-5) shipped the same day.** No P1, no P2 — a well-built
> directory that got polish + convergence: G-1 a **member-count** chip on the
> card (anon-safe aggregate over `group_members`); G-2 **follow from the
> directory** via a `GroupsFollowProvider` + `GroupFollowButton` (the groups twin
> of the players follow-island); G-3 search input → `fieldInputClass`; G-4
> "Groups & organizations · {total}" count; G-5 a shared **`GroupCard`** used by
> both the directory and the home peek — **which closes home-page-ux H-4.**
>
> Grounding facts that shaped grading: `GroupCard`
> ([group-queries.ts#L11-L19](../../packages/domain/src/groups/group-queries.ts#L11-L19))
> carries `description` already; the `groups` table has **no member/event count
> column** (counts need an aggregate over `group_members`); and groups **are
> followable** — `group_followers` + `followGroup`/`unfollowGroup`
> ([groups/follow-actions.ts](../../apps/web/src/app/groups/follow-actions.ts))
> already exist, so G-2 can reuse the players follow-island pattern.
>
> **Adjacent note (2026-06-01, detail/edit-page scope — not a directory
> finding):** the group avatar (the card's leading image, G-5) became
> **uploadable** — the paste-a-URL field was replaced with the crop-upload
> widget, and the group hero banner was dropped. More groups will now carry a
> real avatar instead of the 2-char fallback, strengthening the G-1 "is this
> group real/active?" signal. Write-up:
> [journal 2026-06-01-group-avatars-drop-hero](../journal/2026-06-01-group-avatars-drop-hero.md).

---

## Persona model

| Persona               | What the groups directory must make obvious                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| **Visitor** (no auth) | "Are there real, active clubs here?" — scannable cards with social proof     |
| **Player / attendee** | A club/crew to join or follow, near me — location + size + a way to act      |
| **Host / organizer**  | A fast path to start their own group (the `+ New group` CTA — already there) |

---

## What's already good (so we don't regress it)

- **Richer card than `/players` had:** avatar, name, city/region, and a
  `line-clamp-2` description
  ([page.tsx#L86-L123](../../apps/web/src/app/groups/page.tsx#L86-L123)).
- **`NewGroupButton` self-hides for signed-out _and_ anonymous** viewers
  ([new-group-button.tsx#L25-L28](../../apps/web/src/app/groups/_components/new-group-button.tsx#L25-L28))
  — the V-4 anon-gate concern is already handled here (no host/create depth
  shown to anon).
- **Search button already uses `primaryButtonClass()`** — ahead of `/players`,
  which had to be promoted in PL-3.
- **ISR-cacheable** (`revalidate = 60`, anon client), whole-card click target,
  shared `Pagination` with SQL `range` + `count: 'exact'`.

---

## Findings

### A. Information scent (the card's job)

#### G-1 — No social-proof / activity signal on the card · **P3** · ✅ resolved 2026-06-01

The card answers "what is this group" (name + city + description) but not "is it
**alive**" — there's no member count, follower count, or "N upcoming events." For
a visitor deciding whether a club is worth joining, size/activity is the missing
signal. Unlike the players PL-1 fix (a column already in `profiles_public`), this
is **not** a column-add: `groups` has no count column, so it needs an aggregate
over `group_members` / `group_followers` (and event count over `events.host_group_id`).
**Fix (done):** `searchDirectory` now fetches **member counts** for the visible
group ids in one query over `group_members` (RLS `using (true)`, so it works on
the anon client) and tallies in JS, attaching `memberCount` to each `GroupCard`
(degrades to no chip on error). The card renders "N members" beside the location.
Chose member count over follower count because `group_followers` is owner-only
and its aggregate view is granted to `authenticated` (not `anon`), so it isn't
readable on the public ISR page; event count deferred (a heavier join). New
optional `GroupCard.memberCount`
([group-queries.ts](../../packages/domain/src/groups/group-queries.ts),
[supabase-group-query-repository.ts](../../packages/infrastructure/src/supabase-group-query-repository.ts)).

### B. Acting on intent

#### G-2 — Can't follow a group from the directory — only click through · **P3** (PL-2 analog) · ✅ resolved 2026-06-01

Groups are followable (`group_followers` + `followGroup`/`unfollowGroup`, and the
group detail page has a follow button via
[group-viewer-actions.tsx](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx)),
but the directory card only links through — the same missed loop PL-2 fixed for
players. **Fix (done):** new
[groups/\_components/groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)
— the groups twin of `players-follow.tsx`: a `GroupsFollowProvider` resolves the
viewer + their followed-group set once (one `group_followers` lookup scoped to
the visible ids; the viewer reads their own edges, which the owner-only select
policy allows) and per-card `GroupFollowButton` islands call
`followGroup`/`unfollowGroup` optimistically, rendering nothing for loading/anon
so the ISR shell is untouched. The button rides in the shared `GroupCard`'s
`action` slot above its stretched-link overlay (G-5). Graded **P3** like PL-2
(the group page is the designed follow path), but cheap because the pattern +
actions already existed.

### C. Consistency / convergence

#### G-3 — Search input bypasses the shared field vocabulary · **P3** (PL-3 analog) · ✅ resolved 2026-06-01

The search input hand-rolls `border-border-base bg-surface flex-1 rounded-md
border px-3 py-2 text-sm`
([page.tsx#L57-L64](../../apps/web/src/app/groups/page.tsx#L57-L64)) instead of
`fieldInputClass`. (The Search button is already canonical — only the input
drifts here, the mirror image of PL-3 where the button drifted.) **Fix (done):**
input → `` `${fieldInputClass} flex-1` `` with `items-center` on the flex row so
the label-oriented `mt-1` aligns. Cross-ref persona-ux **CC-2**.
[groups/page.tsx](../../apps/web/src/app/groups/page.tsx).

#### G-4 — No result count · **P3** (PL-4 analog) · ✅ resolved 2026-06-01

`searchDirectory` returns `total`
([page.tsx#L40-L46](../../apps/web/src/app/groups/page.tsx#L40-L46)) but the
"Groups & organizations" header never shows it. **Fix (done):** the header now
reads "Groups & organizations · {total}", matching the `Players · {total}` from
PL-4. [groups/page.tsx](../../apps/web/src/app/groups/page.tsx).

#### G-5 — Group card is hand-rolled here **and** on the home page, and drifting · **P3** (closes home H-4) · ✅ resolved 2026-06-01

The group tile is reimplemented at
[page.tsx#L86-L123](../../apps/web/src/app/groups/page.tsx#L86-L123) and again on
the home page
([page.tsx#L181-L208](../../apps/web/src/app/page.tsx#L181-L208)); they've already
diverged (home: 1-char avatar fallback in a `<div>`, no description; directory:
2-char fallback in an `aria-hidden <span>`, 2-line description). This is exactly
**home-page-ux H-4**. **Fix (done):** extracted a shared `GroupCard` server
component ([group-card.tsx](../../apps/web/src/app/groups/_components/group-card.tsx))
— whole-tile stretched link, optional `memberCount` chip (G-1) and an optional
`action` slot (the G-2 follow button) — and used it on **both** the directory
([groups/page.tsx](../../apps/web/src/app/groups/page.tsx)) and the home-page peek
([page.tsx](../../apps/web/src/app/page.tsx)), deleting both hand-rolled copies.
Same shared-component playbook as `EventCard`. **Closes home-page-ux H-4.** (Home
cards now also show the description — a free improvement; the `Image` import was
dropped from the home page as it's no longer used there.)

---

---

## Findings — group detail, member-management, edit & billing (2026-06-10)

Persona lens for these surfaces:

| Persona              | What the group **detail/manage** surface must do                                  |
| -------------------- | --------------------------------------------------------------------------------- |
| **Visitor / player** | "What is this club, is it active, and how do I get involved?" — follow, _or join_ |
| **Member**           | See the roster + upcoming events, chat                                            |
| **Owner / admin**    | Manage the roster, host events _as the club_, edit the profile, run Club payouts  |

### A. Bugs / broken behavior

#### GD-1 — Member-management actions fail **silently** · **P2** · ✅ resolved 2026-06-10

`runMemberOp`
([member-actions.ts#L23-L31](../../apps/web/src/app/groups/member-actions.ts#L23-L31))
catches **every** `DomainError` and returns a no-op. The wrapper comment frames
this as preserving the pre-ADR-0021 RLS-era "silent swallow," but from the
manager's chair it's a dead end. Concretely, on the Manage-members page a click
does **nothing, with no message**, when:

- removing or demoting the **last owner** → the domain throws
  `InvariantViolation('A group must keep at least one owner.')`
  ([group.ts#L228](../../packages/domain/src/groups/group.ts#L228),
  [#L242](../../packages/domain/src/groups/group.ts#L242)) — the single most
  likely trigger, since a one-owner club is the common case;
- adding someone already a member → `ConflictError`
  ([group.ts#L213](../../packages/domain/src/groups/group.ts#L213));
- a non-manager edge → `UnauthorizedError`.

The button just re-renders unchanged and the manager is left guessing. These are
plain `<form action={…}>` submissions, so per the AGENTS "Server-action error
handling" convention the right pattern is a **flash-param redirect**: catch the
typed errors in `addGroupMember` / `removeGroupMember` / `changeGroupMemberRole`,
map them to reason codes (`?member=last_owner` / `already` / `forbidden`),
`redirect(returnPath?member=…)`, and render an `<Alert>` on
[members/page.tsx](../../apps/web/src/app/groups/[id]/members/page.tsx) from the
param. (Keep swallowing genuinely-unexpected non-`DomainError`s.) **Recommended
fix:** thread the reason through `runMemberOp` (it already takes `returnPath`) and
add a small flash-banner block to the members page header. **P2** — recoverable
and non-data-loss, but it's the highest-value fix here: the last-owner case is a
confusing dead-end on a routine action.

#### GD-2 — Deleting a group lands on a directory with **no confirmation** · **P3** · ✅ resolved 2026-06-10

`deleteGroupAction` redirects to `/groups?deleted=1`
([delete-actions.ts#L44](../../apps/web/src/app/groups/[id]/edit/delete-actions.ts#L44)),
but the directory page never reads `deleted`
([groups/page.tsx](../../apps/web/src/app/groups/page.tsx)) — so after a
deliberate, slightly scary destructive action the user is dropped on the list
with zero acknowledgement that it worked (and the group they were viewing is just
… gone). **Fix:** read `searchParams.deleted` on the directory and render a
dismissible `<Alert variant="success">Group deleted.</Alert>` (same flash-banner
shape used by the billing page's `?club=` / `?onboarding=` alerts). **P3** —
cosmetic feedback gap.

### B. Gaps / streamlining

#### GD-3 — "Host an event" from a group doesn't preselect the group · **P2** · ✅ resolved 2026-06-10

The owner/admin action row links to a bare `/events/new`
([group-viewer-actions.tsx#L117](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx#L117)).
The create-event form **already** supports hosting as a group — it loads
`hostableGroups` and posts a `hostGroupId` field
([events/new/page.tsx#L48-L52](../../apps/web/src/app/events/new/page.tsx#L48-L52),
[actions.ts#L336-L344](../../apps/web/src/app/events/new/actions.ts#L336-L344)) —
but `/events/new` only reads `template` / `template_status` / `from` query params,
**not a group**. So a manager who clicks "Host an event" _from this club's page_
lands on a blank form and has to re-pick the club from a dropdown, even though the
CTA's whole premise is "host **as** this club" (and group-hosted events are the
on-ramp to Club payouts). **Fix:** link to
`` `/events/new?host_group=${group.slug}` `` (or id) and have
[events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx) resolve the
param to a default-selected option in
[new-event-form.tsx](../../apps/web/src/app/events/new/new-event-form.tsx)'s group
selector (validate it's in `hostableGroups`). **P2** — friction on the primary
host action and the club-monetization path.

#### GD-4 — No "request to join" path for players — only Follow · **P3** (product)

The detail page offers non-members exactly one affordance: **Follow**
([group-viewer-actions.tsx#L89-L113](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx#L89-L113)).
Membership is **manager-add-only** — a grep finds no join-request mechanism
anywhere. For an invite-only club model that's a legitimate choice, but the page
never signals it: a visitor sees "Follow," may read it as "join," and a player who
genuinely wants _in_ has no path and no explanation. **Options:** (a) cheapest —
clarifying copy near the follow button ("Following keeps you posted; ask an
organizer to add you to the roster"); (b) a lightweight **join-request** (a
`group_join_requests` row + an owner/admin inbox affordance). **P3 / product
decision** — flagged for a call, not a code bug. Recommend (a) now, (b) only if
self-serve club growth becomes a goal.

### C. Consistency / convention drift (stale code)

#### GD-5 — slug→group + owner/admin gate reimplemented **four** ways · **P2**

The same "resolve `[id]` slug → group, gate to owner/admin, else redirect" logic
exists in four shapes:

- edit + members **pages** use the read model
  (`findDetailBySlug` + `findViewerRole` —
  [edit/page.tsx#L18-L25](../../apps/web/src/app/groups/[id]/edit/page.tsx#L18-L25),
  [members/page.tsx#L30-L37](../../apps/web/src/app/groups/[id]/members/page.tsx#L30-L37));
- billing + analytics **pages** hand-roll it with **inline raw Supabase queries**
  ([billing/page.tsx#L46-L64](../../apps/web/src/app/groups/[id]/billing/page.tsx#L46-L64),
  [analytics/page.tsx#L29-L44](../../apps/web/src/app/groups/[id]/analytics/page.tsx#L29-L44));
- billing **actions** has its own `requireGroupManager`
  ([billing/actions.ts#L41-L58](../../apps/web/src/app/groups/[id]/billing/actions.ts#L41-L58)).

Four copies means four chances to drift (the pages already `select` different
column sets, and a future gate tweak has to be made in four places). **Fix:**
extract one `requireGroupManager(slug)` **page helper** (returns
`{ group, role }` or performs the redirect) and call it from all four; keep the
read-model adapter as its backing query. **P2** — maintainability + drift risk on
an authorization path.

#### GD-6 — Field-vocabulary drift in the member forms · **P3**

- `add-member-form.tsx` hand-rolls the `<select>` class string and a bare
  `<label className="text-fg block text-sm font-medium">` instead of the shared
  `fieldInputClass` / `fieldLabelClass`
  ([add-member-form.tsx#L40-L52](../../apps/web/src/app/groups/[id]/members/_components/add-member-form.tsx#L40-L52))
  — the AGENTS pattern-11 vocabulary every other group form (edit/new) already
  uses.
- `members-actions.ts` `addMemberFromForm` reads `formData.get('user_id')` /
  `formData.get('role')` directly
  ([members-actions.ts#L15-L16](../../apps/web/src/app/groups/[id]/members/members-actions.ts#L15-L16))
  instead of the `field()` helper AGENTS says to "always use" (handles the
  `useFormState` slot-prefix quirk so the wrapper is robust if the form is ever
  rewired). **Fix:** swap both to the shared helpers. **P3** — convention drift.

#### GD-7 — "Following" button variant differs between directory and detail · **P3** · ✅ resolved 2026-06-10

The directory's followed-state button uses `secondaryButtonClass`
([groups-follow.tsx#L134](../../apps/web/src/app/groups/_components/groups-follow.tsx#L134));
the detail page's uses `neutralButtonClass`
([group-viewer-actions.tsx#L107](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx#L107)).
AGENTS pattern 11 is explicit: the "✓ Following" neutral-bordered look is
`neutralButtonClass`, **not** the primary-tinted `secondaryButtonClass`. The two
follow buttons render differently across surfaces; the detail page is correct.
**Fix:** switch the directory button to `neutralButtonClass('sm')` for the
followed state. **P3.**

#### GD-8 — Page-title heading size inconsistent across group sub-pages · **P3**

Billing + analytics use `text-headline-lg` for their h1
([billing/page.tsx#L76](../../apps/web/src/app/groups/[id]/billing/page.tsx#L76),
[analytics/page.tsx#L160](../../apps/web/src/app/groups/[id]/analytics/page.tsx#L160));
edit, members, new, and the directory all use `text-headline-sm`; the detail
page's group-name h1 is also `text-headline-sm`. Per AGENTS pattern 16 the
page-title h1 role is `text-headline-lg`, so the _cluster_ is the drift — but the
fix is "pick one and apply it across all group surfaces," not change one in
isolation. **P3** — visual consistency.

#### GD-9 — `DeleteGroupPanel` carries a dead `ok` state field · **P3** (micro stale code) · ✅ resolved 2026-06-10

`State = { error?, ok? }`
([delete-group-panel.tsx#L13](../../apps/web/src/app/groups/[id]/edit/delete-group-panel.tsx#L13))
and `deleteGroupAction`'s `State` both declare `ok`, but success **redirects**, so
`ok` is never set or read. Drop it from both. **P3** — trivial.

#### GD-10 — Member-row action cluster doesn't wrap on mobile · **P3**

`MemberRowItem` lays out name + role + up to three role-change buttons + Remove in
a single `flex items-center gap-3` row with no `flex-wrap`
([member-row-item.tsx#L40](../../apps/web/src/app/groups/[id]/members/_components/member-row-item.tsx#L40)).
A non-member admin row therefore renders `→ Member  → Admin  → Owner  Remove`
which overflows a ~360 px viewport. **Fix:** add `flex-wrap` (and let the name
take the first row via `basis-full sm:basis-auto`), or collapse the role actions
into a single menu. **P3** — mobile polish.

## Out of scope

- **Avatar upload UX** (`GroupAvatarPanel`, the crop widget) is shared with the
  profile/event avatar flows — covered by those audits, not re-litigated here.
- **Club payments correctness** (payout resolver, application fees, ADR 0038) is
  the [monetization](monetization.md) / [stripe-integration](stripe-integration.md)
  surface; this file only covers the **UX** of the billing page.

## Remediation log

### 2026-06-10 — GD-1 / GD-2 / GD-3 / GD-7 / GD-9 bundle (member feedback + polish)

Shipped the high-leverage, low-risk subset of the detail-surface pass the same
day. Verified `pnpm typecheck && lint && test && build` (all green; touched files
added zero lint warnings; 375 web tests pass).

- **GD-1 ✅** — `runMemberOp`
  ([member-actions.ts](../../apps/web/src/app/groups/member-actions.ts)) now maps
  expected `DomainError`s to a flash reason via `memberFlashReason` and
  `redirect(\`${returnPath}?member=<reason>\`)`instead of swallowing them; the
manage-members page
([members/page.tsx](../../apps/web/src/app/groups/[id]/members/page.tsx))
renders a`MEMBER_FLASH` `<Alert>` (warning for last-owner / already-member /
  gone, error for forbidden / unexpected). Last-owner removal/demotion now
  explains itself instead of doing nothing.
- **GD-2 ✅** — the directory
  ([groups/page.tsx](../../apps/web/src/app/groups/page.tsx)) reads
  `searchParams.deleted === '1'` (the target of `deleteGroupAction`'s redirect)
  and shows `<Alert variant="success">Group deleted.</Alert>`.
- **GD-3 ✅** — the group "Host an event" CTA links to
  `` `/events/new?host_group=${groupSlug}` ``
  ([group-viewer-actions.tsx](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx));
  [events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx) resolves the
  slug against `manageableGroups` (membership-gated) and merges
  `{ hostGroupId }` onto the prefill values so the `BasicsSection` group selector
  defaults to that club. Invalid / unmanaged slugs are ignored (blank selector).
- **GD-7 ✅** — the directory follow button's followed state uses
  `neutralButtonClass`
  ([groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)),
  matching the detail page (AGENTS pattern 11).
- **GD-9 ✅** — dropped the unused `ok` field from `State` in
  [delete-group-panel.tsx](../../apps/web/src/app/groups/[id]/edit/delete-group-panel.tsx)
  and [delete-actions.ts](../../apps/web/src/app/groups/[id]/edit/delete-actions.ts).

**Still open:** GD-4 (join-request product call), GD-5 (`requireGroupManager`
dedup ×4), GD-6 (member-form field vocab), GD-8 (host-page h1 size), GD-10
(member-row mobile wrap).

### 2026-06-01 — G-1…G-5 bundle (counts + follow + vocab + shared card)

Shipped all five findings the same day. Verified `pnpm typecheck && lint && test
&& build` (all green; the two new components added zero lint warnings). Journal:
[2026-06-01-groups-directory.md](../journal/2026-06-01-groups-directory.md).

- **G-1 ✅** — `searchDirectory` attaches `memberCount` via an anon-safe aggregate
  over `group_members`; the card shows "N members". New optional
  `GroupCard.memberCount`.
- **G-2 ✅** — new
  [groups/\_components/groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)
  (`GroupsFollowProvider` + `GroupFollowButton`), the groups twin of
  `players-follow.tsx`, reading `group_followers` and calling
  `followGroup`/`unfollowGroup`; renders nothing for anon, layered on the ISR shell.
- **G-3 ✅** — search input → `` `${fieldInputClass} flex-1` `` with `items-center`.
- **G-4 ✅** — "Groups & organizations · {total}" header count.
- **G-5 ✅** — shared `GroupCard`
  ([group-card.tsx](../../apps/web/src/app/groups/_components/group-card.tsx)) on
  both the directory and the home peek; both hand-rolled copies deleted.
  **Closes home-page-ux H-4.**

_All findings resolved. Re-audit if the page changes materially._
