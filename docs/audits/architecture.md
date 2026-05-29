# Architecture audit — 2026-05-17

> **Status update (2026-05-29, Phase 2b inc. 1 — ProfileQueries foundation):**
> **P2-1 web-layer DB leakage — started.** A survey found 42 raw profile/friend
> query occurrences (`profiles` ×21, `profiles_public` ×16, `friendships` ×5)
> across ~32 files, and they're heterogeneous (3 clients, `id`-vs-`handle`
> keys, card-vs-full shapes, PII `profiles` vs safe `profiles_public`) — so the
> drain is multi-increment. This increment lays the foundation: a
> `ProfileQueries` read port
> ([domain](../../packages/domain/src/users/profile-queries.ts)) +
> client-injected
> [SupabaseProfileRepository](../../packages/infrastructure/src/supabase-profile-repository.ts)
> (reads `profiles_public`, owns the LIKE-escaping), and migrates the
> audit-named `searchPeople` site (public return type unchanged, behaviour
> preserved). Verify quad green, no DB change. Remaining ~40 sites tracked in
> the [Phase 2b journal](../journal/2026-05-29-bundle-phase-2b-profile-queries-foundation.md).
>
> **Status update (2026-05-29, Phase 2a — social-graph port):** **First Phase 2
> increment landed**, attacking the **P2-2 god-port**. The friend-graph reads
> (`getViewerFriends`, `searchFollowingFeed`) + their read-model types
> (`FriendProfile`, `FollowingFeedItem`, `FollowingFeedFilters`) moved off
> `EventRepository` onto a dedicated `SocialGraphQueries` port
> ([packages/domain/src/users/social-graph-queries.ts](../../packages/domain/src/users/social-graph-queries.ts)),
> implemented by the new
> [SupabaseSocialGraphRepository](../../packages/infrastructure/src/supabase-social-graph-repository.ts);
> `GetViewerFriendsHandler` / `GetFollowingFeedHandler` now depend on the focused
> port. Pure structural move (verify quad green, 309 tests, no DB change). **P2-2
> partially closed** — the rest of the `EventRepository` ISP split (read-vs-write,
> co-host, `setRosterTeamForfeited`) and **P2-1** (ProfileRepository + the ~38
> raw web-layer `profiles`/`friendships` queries) remain as Phase 2b. See the
> [Phase 2a journal](../journal/2026-05-29-bundle-phase-2a-social-graph-port.md).
>
> **Status update (2026-05-29, Phase 1 — P1 resolved):** **Division-scoped
> aggregate entries landed** ([ADR 0019](../adr/0019-division-scoped-aggregate-entries.md),
> [journal](../journal/2026-05-29-bundle-phase-1-division-scoped-entries.md)).
> The `VolleyballEvent` aggregate now carries the division on each team
> (`_teams: Map<TeamId, DivisionId | null>`) and free-agent
> (`_freeAgents: Map<UserId, FreeAgentEntry>`) entry; `registerTeam(teamId,
divisionId)` validates the division and `joinAsFreeAgent` stores it, so
> `save(event)` persists registrations in one write path. The two
> aggregate-sidestepping ports (`attachTeamToDivision` /
> `attachFreeAgentToDivision`) are **deleted** from the port + adapter + both
> handlers; `save()`'s `soleDivisionId` skip-branches for teams/free agents are
> gone (team inserts reuse the existing `attach_team_to_division` RPC for its
> partial-unique `ON CONFLICT`; FA inserts upsert idempotently). New domain
> tests assert the division is carried; verify quad green (309 tests), no
> migration. **Honest re-grade:** on close reading this was a
> consistency-boundary / structural defect, not the active data-loss the P1 first
> implied (the single-division FA double-write was redundant-but-harmless; team
> register was already a single write). Deferred: true multi-statement `save()`
> atomicity (a separate, broader RPC effort — also affects attendees/divisions).
>
> **Status update (2026-05-29, Phase 0 — guardrails):** **First refactor phase
> landed.** Added string-constrained smart constructors (`idConstructor<B>()`
> in [shared/brand.ts](../../packages/domain/src/shared/brand.ts)) for all 12
> branded id types and migrated the **37 application-layer `as never` brand
> casts** (+ 1 domain test) to them. Stood up the Onion-layer **lint ratchets**
> via a shared `purityRatchet()` in
> [packages/config/eslint.base.mjs](../../packages/config/eslint.base.mjs),
> wired into the domain + application configs: `as never` is now an **error**
> in both layers, and outward/framework imports (`@supabase/*`, `next`,
> `react`, `@pickupvb/infrastructure`, and for domain also `@pickupvb/application`)
> are banned — turning the verified-good layer purity into an enforced ratchet.
> Both probes confirmed firing; full verify quad green. **P2-5 partially
> closed** (application done; web + infra deferred — see the finding). The
> sweep surfaced a nuance: infra's `as never` is ~half Supabase write-payload
> casts, not brand casts, so the ban is intentionally domain+application only.
> See the [Phase 0 journal](../journal/2026-05-29-bundle-phase-0-architecture-guardrails.md).
>
> **Reevaluation (2026-05-29):** **Fresh full re-audit against current HEAD
> (`8668288`).** The 2026-05-17 backlog is effectively closed; this pass
> re-grades the architecture as it stands after ~6 months of growth
> (brackets + generators/standings, leagues + schedule/forfeit, event
> divisions, ad-hoc + walk-in team registrations, per-division registration
> modes, community listings, host Stripe accounts/subscriptions, captain-RLS
> match results). Domain is now ~50 files / 8.3k LOC; the web app is ~45k LOC.
> The new findings, roadmap, and throughput playbook live in
> [**§ Reevaluation — 2026-05-29**](#reevaluation--2026-05-29) below. Headline:
> the hexagonal boundary the repo claims (ADR 0001) is **strong for the core
> aggregates but porous at the web layer** — 76 route/action files issue raw
> `supabase.from(...)` queries (vs. 49 going through `lib/handlers`), and whole
> entity families (groups, profiles, notifications, friendships, tips,
> sponsors) have no domain model or port at all. One **P1** (split non-atomic
> registration write path), six **P2** (web-layer DB leakage, `EventRepository`
> god-port, 1.5k-LOC adapter, half-wired domain-event outbox, branded-type
> `as never` leak, fragmented event-detail read path), and four **P3**.
>
> **Status update (2026-05-23, Bundle 64):** **P2 "mapper extraction" —
> first row shape extracted (friend edges).** Two callsites —
> [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) and
> [friends/page.tsx](../../apps/web/src/app/friends/page.tsx) — inlined the
> same select string, the same `OutRow` narrowing type, the same
> null-filter on the embedded `profiles` join, and the same
> incoming-edge `Set<userId>` query for mutual-friend detection. That
> shared shape now lives in new
> [apps/web/src/lib/mappers/friend.ts](../../apps/web/src/lib/mappers/friend.ts)
> as `loadFriendEdges(supabase, userId)` — a single pure helper that
> parallelizes the two queries via `Promise.all` (small extra win the
> sequential inlined versions left on the table). Both callers shrink
> to a one-line destructure. The audit's other named row shapes —
> attendee, group-member (the design-call case), event-summary — are
> still open; the friend mapper is the proof-of-pattern. New file is
> the seed of the `apps/web/src/lib/mappers/` directory the audit
> originally prescribed. See the
> [Bundle 64 journal](../journal/2026-05-23-bundle-64.md).
>
> **Status update (2026-05-23, Bundle 49):** P3 cluster **"JSDoc on aggregate
> factories, hrefs cleanup, barrel-export docs"** closed. Added JSDoc to the
> remaining `static create` / `rehydrate` / `fromPersistence` factories across
> seven domain files ([volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts),
> [event-team-payment.ts](../../packages/domain/src/events/event-team-payment.ts),
> [event-team-registration.ts](../../packages/domain/src/events/event-team-registration.ts),
> [division.ts](../../packages/domain/src/events/division.ts),
> [community-listing.ts](../../packages/domain/src/community-listings/community-listing.ts),
> [bracket.ts](../../packages/domain/src/brackets/bracket.ts),
> [teams/team.ts](../../packages/domain/src/teams/team.ts)) — 12 additions in
> all, each noting the invariants enforced + the domain event raised where
> applicable. Hrefs cleanup verified already-done (grep for
> `href={['"][^'"]+['"] ?\+` returned only the false positive of
> `hrefFor(page + 1)` in `pagination.tsx`; the events/[id] diet refactor of
> Bundles 23-24 already cleared the offenders the original audit flagged).
> Added one-paragraph **Exports** sections to the three package READMEs
> ([packages/domain/README.md](../../packages/domain/README.md),
> [packages/application/README.md](../../packages/application/README.md),
> [packages/infrastructure/README.md](../../packages/infrastructure/README.md))
> documenting what each `src/index.ts` barrel re-exports and the contract for
> adding new entries.
>
> Only architecture finding still open: **P2 mapper extraction** —
> partially closed by Bundle 64 (friend-edges row shape extracted to
> `lib/mappers/friend.ts`); attendee, group-member (design call), and
> event-summary row shapes still open.

> **Status (2026-05-17):** Quick-win bundle landed — typed-error reclassification in bracket generators (P1), `field()`/`bool()` helper sweep (P2), and server-action error-handling pattern documented in `AGENTS.md` (P2). Mapper extraction (P2) and Vitest bootstrap (P1) deferred — see the Remediation log at the bottom for rationale and the still-open list.

> **Status update (2026-05-22):** Two P2s opened earlier today have already
> shipped: `profile/billing/actions.ts` + `pro/actions.ts` reclassified to
> typed `DomainError`s (all 11 sites now `InvariantViolation` /
> `UnauthorizedError`), and the six `revalidatePath`-flagged files were
> rescoped — `people-actions.ts` is read-only, `members-actions.ts` is a
> thin wrapper around an action that already revalidates, and the four
> Stripe-redirect actions deferred revalidation to webhooks and now carry
> an explicit comment per the AGENTS.md "Stripe-redirecting actions"
> exception. A typed-error win also shipped on the registration path —
> `RegisterTeamHandler` now throws `NotFoundError` / `ValidationError` for
> division-format mismatches (see the [registration-workflow audit](registration-workflow.md)).
>
> Net regressions still on the table: P1 page diet worsened —
> [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) is
> now 837 LOC (was ~520 at 2026-05-17).

> **Status update (2026-05-22, Bundle 22):** P1 **test suite bootstrap is
> now closed.** Vitest is wired through every package via the root
> `vitest@^2.1.9` dep + `turbo run test`; `packages/domain` has its own
> [vitest.config.ts](../../packages/domain/vitest.config.ts) and now
> ships **122 tests across 6 files** (events: 90; teams: 32 new this
> bundle), and `packages/application` ships 6 tests on the
> `JoinEventHandler`. The earlier status note that there was "no Vitest
> config for `packages/domain` yet" was stale — the config + first 90
> events tests had landed in an unrecorded earlier pass; this bundle
> backfilled the `Team` aggregate (the only aggregate without coverage)
> and reconciled the audit doc.
>
> Still open from the P1 list: events/[id] page diet (837 LOC).

> **Status update (2026-05-22, Bundle 23):** P1 **events/[id] page diet is
> now closed.** The 887-LOC `apps/web/src/app/events/[id]/page.tsx` was
> split: all data loading, two-wave side-loads, snake_case bridging, and
> position-fill computation moved into a new
> [`_loaders/load-event-detail.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
> module exporting a fully-typed `EventDetailViewModel`. The page is now
> 566 LOC — a thin renderer that calls `loadEventDetail()` and
> destructures the view-model. The aspirational ≤300 LOC target would
> require further JSX componentization (deferred to a P2 follow-up).
>
> No P1s remaining on the architecture audit.

> **Status update (2026-05-22, Bundle 24):** The P2 follow-up to Bundle 23
> shipped — the events/[id] page now lands the original audit's
> aspirational ≤300 LOC target. JSX componentization extracted six
> render-branch components from `page.tsx` (`EventStructuredData`,
> `EventFlashBanners`, `EventLocationSection`, `EventSignupArea`,
> `HostToolsSection`, `AttendeesPanel`) plus reuse of the existing
> `_components/` siblings. The page is now **294 LOC** (down from 566
> after Bundle 23, and 887 before Bundle 23 — a 67% cut across both
> bundles). All extracted components are co-located under
> `_components/` and take typed view-model slices.

> **Status update (2026-05-23, Bundle 45):** P2 "Position-fill math
> into the event detail read model" closed. `EventDetailReadModel` now
> exposes `filledByPosition: Partial<Record<EventPosition, number>>`,
> populated by the infrastructure repository inside the existing
> attendee-walk that computes waitlist flags (zero extra work). The
> page-side loader drops its dedicated counting loop and just forwards
> `event.filledByPosition` to the signup area. Remaining P2s: split
> `groups/actions.ts`, mapper extraction (design call).

> **Status update (2026-05-23, Bundle 46):** The long-outstanding
> follow-up to align `co-host-actions.ts` with the documented
> server-action error-handling pattern is **closed**. `addEventCoHost`
> / `removeEventCoHost` now wrap their handler calls in a try/catch
> that maps `UnauthorizedError` / `NotFoundError` / `ConflictError` /
> `ValidationError` to `?cohost=…` flash redirects via
> `redirectEventNotice` (which gained `'cohost'` in its key union);
> unknown `DomainError`s pass through with their message, and
> non-domain throws still bubble. `EventFlashBanners` renders the
> matching alert variants. The original 2026-05-17 P2 "server-action
> error-handling pattern" row is now fully ✅ — `rsvp-actions.ts` and
> `co-host-actions.ts` both follow the same flash-param shape.

> **Status update (2026-05-23, Bundle 47):** P2 "Split `groups/actions.ts`"
> closed. The 166-LOC catch-all is gone; six exports redistributed across
> three per-concern files at [apps/web/src/app/groups/](../../apps/web/src/app/groups/):
> [group-form-actions.ts](../../apps/web/src/app/groups/group-form-actions.ts)
> (`createGroupAction`, `updateGroupAction`, `GroupFormState` — both share
> the form-state type, so they live together),
> [follow-actions.ts](../../apps/web/src/app/groups/follow-actions.ts)
> (`followGroup`, `unfollowGroup`), and
> [member-actions.ts](../../apps/web/src/app/groups/member-actions.ts)
> (`addGroupMember`, `removeGroupMember`, `changeGroupMemberRole`). All
> five importers updated. Now matches the events/[id] convention of one
> action file per concern. Remaining P2: mapper extraction (still needs
> a design call).

## Reevaluation — 2026-05-29

Read-only re-audit against HEAD (`8668288`), graded with the
[audits README rubric](README.md#how-findings-are-graded) (P1 = bug /
data-loss / broken behavior; P2 = important hardening/quality; P3 =
nice-to-have). Lens: DRY, SOLID, Onion/hexagonal, DDD aggregates, CQRS.

### What changed since the last audit

The 2026-05-17 → 2026-05-23 backlog (page diet, test bootstrap, `groups/actions`
split, mapper seed, JSDoc, typed errors) is **closed**. Since then the domain
roughly doubled: `packages/domain` is now 50 files / **8,351 LOC**,
`packages/application` 3,900, `packages/infrastructure` 3,474, `apps/web`
**44,725**. New aggregates/flows: brackets (generators, matches, standings,
seeding), leagues (schedule, roster, forfeit), event divisions, ad-hoc +
walk-in team registrations, per-division registration modes, community
listings, host Stripe accounts/subscriptions, captain-RLS match results.

The growth exposed structural pressure the smaller codebase hid. The single
biggest signal:

```
apps/web/src/app files calling lib/handlers (application layer):  49
apps/web/src/app files issuing raw supabase.from(...) queries:    76
```

Raw table hits in the web layer, by table (top): `events` 24, `profiles` 20,
`event_participants` 20, `profiles_public` 15, `groups` 14, `teams` 12,
`group_members` 11, `notification_outbox` 9, `event_team_entries` 9,
`event_payment_audit` 9, `event_participant_payments` 8, `event_tips` 7,
`event_divisions` 7, `event_sponsors` 6, `broadcasts` 6 … The repository/port
pattern is real and clean **for the aggregates that have one** — but groups,
profiles, notifications/broadcasts, friendships, tips, and sponsors have **no
domain model and no port**, so all their read/write logic lives inline in
pages and `*-actions.ts`.

---

### P1 — Split, non-atomic registration write path ✅ Resolved 2026-05-29 (ADR 0019)

> **Resolved (Phase 1, 2026-05-29):** the aggregate now owns the division on
> each team / free-agent entry; `registerTeam(teamId, divisionId)` +
> `joinAsFreeAgent` persist via `save(event)` in one write path, and both
> `attach…` ports are deleted. See
> [ADR 0019](../adr/0019-division-scoped-aggregate-entries.md) and the
> [Phase 1 journal](../journal/2026-05-29-bundle-phase-1-division-scoped-entries.md).
> Re-graded on implementation: structural consistency-boundary defect, not
> active data loss. Remaining: true multi-statement `save()` atomicity
> (deferred — separate RPC effort, also affects attendees/divisions).

- **Where:** [join-event.handler.ts](../../packages/application/src/commands/join-event.handler.ts#L60-L78) (`JoinEventAsFreeAgentHandler`), [team.handler.ts](../../packages/application/src/commands/team.handler.ts) (`RegisterTeamHandler`), and the ports they lean on: [event-repository.ts](../../packages/domain/src/events/event-repository.ts#L54-L70) (`attachTeamToDivision`, `attachFreeAgentToDivision`), implemented in [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts#L499-L621).
- **Issue:** The aggregate cannot hold a `divisionId` on its free-agent / team entries (its `_freeAgents` map is `userId → notes`; `_teams` is a `Set<teamId>`), but `event_teams` / `event_team_entries` require `division_id` **NOT NULL**. So a registration is **two sequential writes through two code paths**: `event.joinAsFreeAgent(...)` + `repo.save(event)` (which, for multi-division events, _skips_ inserting the row — see `if (!soleDivisionId) continue` at [L590-L600](../../packages/infrastructure/src/supabase-event-repository.ts#L585-L612)), then `repo.attachFreeAgentToDivision(eventId, userId, divisionId)` to do the real attach. There is no transaction spanning the two. A failure (or RLS denial) between `save()` and `attach…()` leaves the event aggregate's persisted state and the division-attachment table inconsistent — and for single-division events the `save()` path _also_ inserts with `soleDivisionId`, so the two paths can both touch the same row with divergent logic. The aggregate is no longer the consistency boundary it claims to be.
- **Why P1:** This is a durability/correctness hazard on the money-path (paid divisions), not a style issue — a partial write can register a player/team to the event but not to any division, or vice-versa.
- **Fix:** Model the entry properly inside the aggregate. Give `VolleyballEvent` first-class free-agent and team-entry value objects that carry `divisionId` (`{ userId, divisionId, notes }`, `{ teamId, divisionId }`), so `repo.save(event)` persists them atomically in one write path and the `attachTeamToDivision` / `attachFreeAgentToDivision` ports + their dual-logic in `save()` are deleted. This is ADR-worthy (touches the aggregate shape) — write `docs/adr/0019-division-scoped-entries.md`. If a same-PR DB transaction is infeasible, at minimum collapse to a single `SECURITY DEFINER` RPC that does both inserts atomically (mirrors the `record_bracket_match_result` pattern).

---

### P2 — six findings

#### P2-1. Web layer bypasses the hexagonal boundary (76 files of raw `supabase.from`) — **highest-ROI finding** 🟡 Started (2026-05-29)

> **Progress (2026-05-29, Phase 2b inc. 1–5):** the social-graph reads moved to
> `SocialGraphQueries` (Phase 2a), and the profile-read drain is underway via a
> `ProfileQueries` read port + client-injected `SupabaseProfileRepository`
> (reads `profiles_public`, owns LIKE-escaping). The port now offers
> `searchCards` / `searchDirectory` / `findCardById` / `findCardByHandle` /
> `findCardsByIds` / `findPlayerByHandle`. Drained so far: people search
> (inc. 1), the players directory `/players` (inc. 2), the player profile page
> `/players/[handle]` (inc. 3, rich `PlayerProfile`, camelCase at the boundary),
> the member/roster batch reads — `teams/page`, `teams/[id]`, `groups/[id]`,
> `groups/[id]/members` (inc. 4) — plus the OG-image id/handle bug fix (inc. 4),
> and the community pending-claim read (inc. 5). Inc. 5 also added the first
> `packages/infrastructure` test, pinning the shared `escapeLike` guard. The
> survey refined the count to **42 profile/friend query occurrences**
> (`profiles` ×21, `profiles_public` ×16, `friendships` ×5) across ~32 files;
> heterogeneity (3 clients, id-vs-handle, card-vs-full, PII split) makes this
> multi-increment. Next: the `load-event-detail.ts` profile reads (deferred —
> admin-client `unstable_cache` loader), the `friendships` reads, then the
> `profiles` writes (→ `UserProfile` aggregate). `GroupRepository` (#1 below)
> and the notification outbox (#3) are untouched.

- **Where:** 76 files under [apps/web/src/app](../../apps/web/src/app). Worst offenders are the loaders/actions for entity families with no port: `groups/**` (`groups`, `group_members`, `group_followers`), `profile/**` + `players/**` + `friends/**` (`profiles`, `profiles_public`, `friendships`), notifications (`notification_outbox`, `broadcasts`, `push_subscriptions`), and event sidecars (`event_tips`, `event_sponsors`, `event_payment_audit`).
- **Issue:** ADR 0001 mandates `apps/web → @pickupvb/application → @pickupvb/domain` with infrastructure behind ports. That holds for events/teams/brackets/etc., but **whole subdomains never got a domain model**: group membership roles, friend mutuality, notification fan-out, and tip/sponsor rules are all enforced (or not) inline in JSX/actions, with the DB row shape (`snake_case`) leaking into components and **no unit-test seam**. Every new feature touching these re-pays the cost, and bugs fixed in one query string aren't fixed in the 19 others hitting the same table.
- **Fix (incremental, by churn):**
  1. Stand up `GroupRepository` + a `Group` aggregate (roles, follow graph) → fold `groups/*-actions.ts` raw writes behind it. (14 + 11 + 3 = 28 raw hits collapse.)
  2. Give the **orphan** `UserProfile` aggregate ([user-profile.ts](../../packages/domain/src/users/user-profile.ts)) a `ProfileRepository` port and a `SocialGraphQueries` read service; route `profiles` / `profiles_public` / `friendships` reads through it. (≈38 raw hits.)
  3. Add a `NotificationOutboxPort` for `notification_outbox` / `broadcasts` / `push_subscriptions` fan-out.
  - Don't boil the ocean: genuinely trivial viewer-scoped reads (e.g. "is this row mine") can stay inline; the target is _entity reads/writes with rules or >2 call sites_. Track progress with the same `49 vs 76` ratio.

#### P2-2. `EventRepository` is a god-port (ISP + SRP + CQRS-mixing) 🟡 Partial (2026-05-29)

> **Progress (2026-05-29):** two of the conflated responsibilities are gone.
> Phase 1 (ADR 0019) deleted the **aggregate-sidestepping** `attachTeamToDivision`
> / `attachFreeAgentToDivision`. Phase 2a moved the **social-graph reads**
> (`getViewerFriends`, `searchFollowingFeed`) onto a dedicated
> `SocialGraphQueries` port. Remaining on `EventRepository`: write-side
> (`findById`/`save`), read models (`search`/`getDetail`/`findIdByShortCode`),
> co-host mutation, and `setRosterTeamForfeited` — the read-vs-write ISP split
> is the next increment.

- **Where:** [event-repository.ts](../../packages/domain/src/events/event-repository.ts#L29-L83).
- **Issue:** One interface conflates **four** responsibilities: write-side aggregate persistence (`findById`/`save`), denormalized **read models** (`search`/`getDetail`/`findIdByShortCode`), ~~**social-graph reads that are not event concerns** (`getViewerFriends`, `searchFollowingFeed`)~~ (moved to `SocialGraphQueries`, Phase 2a), co-host sub-resource mutation (`addCoHost`/`removeCoHost`), and ~~**aggregate-sidestepping** division mutations (`attachTeamToDivision`/`attachFreeAgentToDivision`~~ deleted in Phase 1)`/setRosterTeamForfeited`). The header comment openly admits the read/write CQRS mixing.
- **Fix (remaining):** Segregate the interface (ISP): `EventWriteStore { findById; save }`, `EventReadModels { search; getDetail; findIdByShortCode }`, and put co-host + `setRosterTeamForfeited` behind a focused `EventMembershipStore`. The Supabase class can still implement all of them, but handlers depend only on the slice they use.

#### P2-3. `SupabaseEventRepository` is a 1,482-LOC adapter; `getDetail` alone is ~480 LOC (SRP)

- **Where:** [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts) — `getDetail` spans [L766-L1245](../../packages/infrastructure/src/supabase-event-repository.ts#L766-L1245).
- **Issue:** A single method runs ~15 queries and assembles the ~80-field read model inline; it can't be unit-tested in pieces and any change risks the whole event-detail surface. `rowToCapacity` / `divisionRowToCapacity` / position-roster parsing are duplicated within the file ([L117-L164](../../packages/infrastructure/src/supabase-event-repository.ts#L117-L164)).
- **Fix:** Extract per-concern, independently-testable mappers/loaders (`loadAttendees`, `loadTeamsWithPayments`, `loadFreeAgents`, `loadCoHosts`, `loadDivisions`, `computeViewerFlags`) into a sibling `event-detail/` folder; `getDetail` becomes orchestration (`Promise.all` of the loaders + assembly). Hoist the shared row→VO mappers into `event-row-mappers.ts`. This is the adapter-side mirror of P2-2.

#### P2-4. Domain-event / outbox infrastructure is half-wired

- **Where:** [aggregate-root.ts](../../packages/domain/src/shared/aggregate-root.ts), [dispatch-outbox.ts](../../packages/application/src/analytics/dispatch-outbox.ts). Raisers: only `VolleyballEvent` and `Bracket` call `this.raise(...)`; `Team` and `CommunityListing` raise nothing. Dispatchers: only [join-event.handler.ts](../../packages/application/src/commands/join-event.handler.ts) calls `dispatchAnalyticsOutbox`.
- **Issue:** `Bracket` raises domain events that **nobody dispatches**; [team.handler.ts#L146](../../packages/application/src/commands/team.handler.ts#L146) calls `event.pullEvents()` purely to _drain and discard_; `publish`/`cancel`/`registerTeam`/`addDivision` raise events no handler drains. The pattern looks complete but only join/leave/join-with-position actually emit analytics — a trap for the next agent who assumes `raise()` ⇒ delivered.
- **Fix:** Pick one. Either (a) dispatch uniformly — wrap every command handler's post-`save()` step in a shared `withOutbox(aggregate)` helper (or a base-handler `dispatch()` call) so any raised event is delivered; or (b) delete the unused `raise()` calls and document the outbox as "join/leave analytics only" in [analytics-port.ts](../../packages/domain/src/shared/analytics-port.ts). The half-state is the bug.

#### P2-5. Branded-type boundary leaks — `as never` casts 🟡 Partial (Phase 0, 2026-05-29)

- **Where:** Originally ~171 `as never` across `packages/application` (37), `apps/web` (84), `packages/infrastructure` (50), e.g. [join-event.handler.ts#L21](../../packages/application/src/commands/join-event.handler.ts#L21).
- **Issue:** `UserId`/`TeamId`/`DivisionId` etc. are branded types, but there was no smart constructor, so call sites laundered a plain `string` through `as never`. This **defeats the brand** (a `teamId` passed where `userId` is expected casts through silently) and is a constant DX tax that discourages using the typed handlers at all (a contributor to P2-1).
- **Phase 0 (2026-05-29) — done for the pure layers:** Added `idConstructor<B>()` in [shared/brand.ts](../../packages/domain/src/shared/brand.ts) + a value-level constructor next to each of the 12 branded id types. Migrated all **37 application casts** (+ 1 domain test) to `UserId(x)` / `DivisionId(x)` / `MatchId(x)` / … (and dropped spurious `findById(x as never)` casts where the port already takes `string`). Banned `as never` as an ESLint **error** in domain + application via `purityRatchet()`.
- **Still open (web + infra):** `apps/web` (84) and `packages/infrastructure` (50) are **not** migrated. Key nuance discovered: infra's `as never` is overloaded — roughly half are brand casts, the rest are **Supabase write-payload casts** (`row as never` on `.insert/.upsert/.rpc`, documented as temporary until `gen:types`). So the ban is scoped to the pure layers only. **Fix:** migrate web brand casts opportunistically as their files move behind ports (Phases 2–4); treat the infra Supabase casts as a separate `gen:types` task. Cross-refs ADR 0009.

#### P2-6. Event-detail read path is fragmented across three layers + a caching hack

- **Where:** [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts) — **999 LOC**, ~10 `unstable_cache` helpers (`loadEventPricingCached`, `loadEventTipTotalCached`, `loadPrimaryHostSocialCached`, `loadHostStripeReadyCached`, `loadAdHocRowsCached`, `loadHeroImageCached`, `loadEventSponsorCached`, …) **plus** `repo.getDetail()` **plus** admin-client direct reads, with a `reviveEventDetailDates()` hack ([L237](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts#L236-L255)) to undo `unstable_cache`'s Date-flattening.
- **Issue:** "The data for one page" is spread across the infra read model, ten web-layer cached queries, and ad-hoc admin reads — three caching strategies, scattered tag bookkeeping, and a serialization workaround. The god `EventDetailReadModel` (~80 fields, [L203-L285](../../packages/domain/src/events/event-repository.ts#L203-L285)) serves every branch (open-play / tournament / league / external / closed), so consumers get fields irrelevant to their surface and adding a surface grows the shared type.
- **Fix:** Consolidate behind a single application-layer `GetEventDetailHandler` that owns the full composition + caching policy (the cached helpers move into infra read services from P2-3), returning a view-model the loader maps 1:1 — killing the Date-revival hack and the scattered tags. Longer-term, consider per-surface read models or a discriminated union keyed on `registrationMode`/`type` (design call; lower priority).

---

### P3 — four findings

- **P3-1. Oversized client form.** [new-event-form.tsx](../../apps/web/src/app/events/new/new-event-form.tsx) is **1,402 LOC** with 21 hook calls — the whole create-event wizard in one `'use client'` component, well past ADR 0005's ~200-LOC cap. **Fix:** decompose into step components under `events/new/_components/` sharing a form-state context, continuing the [divisions-repeater.tsx](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx) extraction. [edit-event-form.tsx](../../apps/web/src/app/events/%5Bid%5D/edit/edit-event-form.tsx) (592 LOC) is the same shape and should share the extracted pieces (DRY).
- **P3-2. Stripe webhook is an 833-LOC god-handler.** [route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts) handles all 8 event types with inline business logic writing directly to many tables, **bypassing the payment repos that already exist** (`hostSubscriptionRepo`, `eventTeamPaymentRepo`). It's the most critical money path with the least structure. **Fix:** extract one handler per Stripe event into `lib/webhooks/`, route file becomes a dispatch switch, and route the DB writes through the existing payment repositories.
- **P3-3. Payment aggregates bypass the application layer (CQRS bypass).** `HostStripeAccount` / `HostSubscription` aggregates + repos exist but are consumed via thin `lib/` facades ([pro.ts](../../apps/web/src/lib/pro.ts), [host-stripe-account.ts](../../apps/web/src/lib/host-stripe-account.ts)) that call the repos directly — no command/query handlers, so they sit outside the handler registry the rest of the app uses. **Fix:** decide intentionally — either add `application` handlers (consistency) or document the facades as a sanctioned read-projection shortcut in `AGENTS.md` so it's not mistaken for drift.
- **P3-4. Thin domain test coverage for newer units.** 9 domain test files for ~40 non-test source files. Covered: events/capacity/rules, team, bracket, event-team-payment/registration, league-schedule, analytics-port. **Untested:** `community-listing`, `division`, `brackets/standings`, `payments/host-stripe-account`, `payments/host-subscription`, `users/user-profile`, `events/location`, `community-listings/external-url`. **Fix:** backfill invariant tests as these units are touched (per AGENTS.md "add a test when adding a domain rule"); prioritize `standings` (scoring math) and `community-listing` (claim/approve state machine).

---

### Verified good (still holding, and worth protecting)

- **Captain-RLS per-request handler split** — [handlers.ts#L211-L237](../../apps/web/src/lib/handlers.ts#L211-L237) `getMatchResultHandlers()` builds match-result handlers around a _user-scoped_ client so RLS enforces "host or captain," while the module-singleton `handlers` use the admin client. This is exactly right and directly addresses security-audit P2 #4 — **do not collapse these back into the singleton registry.**
- **Centralized composition root** — every handler wired once in [handlers.ts](../../apps/web/src/lib/handlers.ts); no ad-hoc construction in pages.
- **Layer purity (inward)** — `packages/domain` and `packages/application` stay free of `next/*`, `@supabase/*`, `react`, `fs`, `process.env` (only `node:crypto` + intra-monorepo imports).
- **Port/adapter discipline for the aggregates that have a port** — interfaces in `packages/domain/src/*/repository.ts`, Supabase impls in `packages/infrastructure`; handlers depend on ports.
- **Aggregate richness** — `VolleyballEvent` (52 methods), `Team`, `Bracket` enforce invariants internally; no anemic data bags.
- **Typed-error hygiene at the boundary** — `instanceof DomainError` in actions/route handlers; [api-helpers.ts](../../apps/web/src/lib/api-helpers.ts) is the single HTTP mapping point.
- **CQRS read/write separation in `packages/application`** — command handlers mutate via aggregates, query handlers return read models; no mixing observed (the mixing is in the _port_, P2-2, not the handlers).

---

### Refactoring roadmap (sequenced for compounding throughput)

Ordered so each phase makes the next cheaper. Each is independently shippable
and verify-clean (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`).

**Phase 0 — guardrails first. ✅ Landed 2026-05-29 (mostly).**
Brand smart constructors + `as never` lint ban (P2-5) **done for domain +
application**; layer-purity import ban (`@supabase/*`, `next`, `react`, outer
layers) wired as an enforced ratchet via `purityRatchet()` in
[packages/config/eslint.base.mjs](../../packages/config/eslint.base.mjs). The
`apps/web` `supabase.from(` boundary ratchet is **deferred** — enforcing it now
needs a 76-file grandfather baseline, so it lands per-directory as each
subdomain migrates behind a port (Phases 2–4). See the
[Phase 0 journal](../journal/2026-05-29-bundle-phase-0-architecture-guardrails.md).

**Phase 1 — close the P1 (1–2 days).** Division-scoped aggregate entries + ADR
0019; delete the attach-port double-write. Ship with a domain test that fails
on the partial-write path. Highest correctness value.

**Phase 2 — `ProfileRepository` + `SocialGraphQueries` (2–3 days).** Wire the
orphan `UserProfile` aggregate; migrate the ≈38 `profiles`/`friendships` raw
hits and pull `getViewerFriends`/`searchFollowingFeed` off `EventRepository`
(starts P2-1 + P2-2 together — they share this seam).

**Phase 3 — `GroupRepository` + `Group` aggregate (2–3 days).** Collapse the 28
`groups`/`group_members`/`group_followers` raw hits; encode role rules once.

**Phase 4 — split `EventRepository` + decompose the adapter (3–4 days).** ISP
segregation (P2-2) + `getDetail` extraction into testable loaders (P2-3) +
consolidate the event-detail read path behind one handler (P2-6). Do these
together — they touch the same files.

**Phase 5 — opportunistic (ongoing).** Outbox decision (P2-4), webhook
decomposition (P3-2), form decomposition (P3-1), test backfill (P3-4), payment
handler decision (P3-3).

### Throughput best-practices playbook (codify the wins)

The high-value, repo-wide habits that turn the above into durable velocity —
candidates to promote into AGENTS.md once proven:

1. **One port per aggregate, segregated by read/write (ISP).** When a feature
   needs DB access, the default is "add/extend a repository," not
   "`supabase.from` in the action." Reserve raw queries for trivial
   viewer-scoped reads, and keep read models off the write-side port.
2. **The aggregate owns every column it's responsible for.** If a NOT NULL
   column (like `division_id`) can't live on the aggregate, that's a modeling
   gap, not a reason for a second write — fix the aggregate (P1).
3. **Smart constructors at the boundary, never `as never`.** Brands only pay
   off if they're constructed, not cast.
4. **Pick one cross-cutting mechanism and wire it everywhere or nowhere.**
   The half-wired outbox (P2-4) is the cautionary tale — partial patterns cost
   more than no pattern because they mislead.
5. **Page loaders compose handlers; they don't query.** A `_loaders/*.ts`
   file should call application handlers + map to a view-model, not assemble
   data from ten cache helpers (P2-6).
6. **A test is the decision record.** Every domain rule and bug fix ships with
   a Vitest case that fails without it (already an AGENTS.md rule — the
   untested newer units in P3-4 are the gap).
7. **Lint rules ratchet architecture.** Boundary violations that a rule can
   catch (raw `supabase.from`, `as never`, bare `throw new Error`) should be
   lint errors, not review comments — they don't regress while you sleep.

---

## Scope

Read-only review of the hexagonal monorepo at `/Users/zachary/Documents/projects/github/pickupvb.com`. Covered CQRS adherence, layer purity, port/adapter pattern, composition root, domain error hygiene, SOLID, DRY, AGENTS.md convention adherence, client/server boundary, module boundaries, aggregate design, testing architecture, server-action design, and folder/route conventions. Skipped the `copilot-skills` workspace folder.

---

## P1 findings

### Non-typed error throws in bracket generators ✅ Fixed 2026-05-17

- **Where:** [packages/domain/src/brackets/generators.ts](packages/domain/src/brackets/generators.ts) — lines 21, 46, 94, 152, 203, 260, 264, 404, 406, 462, 468 (11 occurrences).
- **Issue:** `throw new Error('...')` for domain precondition failures (`'bracketSlots requires power-of-two p'`, `'Single elimination requires at least 2 teams'`, `'Double elimination requires at least 4 teams'`, etc.). Violates the typed-error contract — these cannot be caught with `instanceof DomainError`, so the HTTP boundary in `api-helpers.ts` will return 500 instead of a meaningful 400/422.
- **Fix:** Replace each with `ValidationError` (for team-count / power-of-two preconditions that originate in user input) or `InvariantViolation` (for "shouldn't happen" internal guards like `'round-1 should exist'`). Mechanical find-replace; <15 min.

### No automated test suite ✅ Resolved 2026-05-22

- **Where:** Entire monorepo. No `*.test.ts` or `*.spec.ts` in `packages/domain`, `packages/application`, or `apps/web`. `AGENTS.md` mentions `pnpm --filter @pickupvb/domain test` but no tests exist to run.
- **Issue:** Aggregates encode complex invariants (capacity math, position rosters, status transitions, bracket generation). Handlers own load → mutate → save semantics. Zero test coverage means every refactor is a manual regression risk, and the audit's other recommendations (mapper extraction, error reclassification) carry no safety net.
- **Resolution:** Vitest is wired through every package via the root
  `vitest@^2.1.9` dep + `turbo run test`. `packages/domain` has its own
  [vitest.config.ts](../../packages/domain/vitest.config.ts);
  `packages/application` runs through the same root config. Coverage as
  of Bundle 22: 122 domain tests across 6 files (events: 90; teams: 32)
  - 6 application tests on `JoinEventHandler`. New aggregates must ship
    with tests — that floor is now enforceable by the verify quad.

### Oversized event detail page ✅ Resolved 2026-05-22 (Bundles 23 + 24)

- **Where:** [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) (was 887 LOC, now **294**).
- **Resolution (Bundle 23):** Extracted data loading + mapping into
  [`_loaders/load-event-detail.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts).
  The helper returns a typed `EventDetailViewModel` containing the
  `EventDetailReadModel` plus all pricing, side-load, ad-hoc, attendee-list-bridge,
  filled-by-position, and CTA-shape fields. The page consumes it via a
  single `await loadEventDetail(...)` + destructure.
- **Resolution (Bundle 24):** JSX componentization. Six new components
  under `_components/` absorb the render branches:
  [`event-structured-data.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-structured-data.tsx),
  [`event-flash-banners.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-flash-banners.tsx),
  [`event-location-section.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-location-section.tsx),
  [`event-signup-area.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/event-signup-area.tsx)
  (the largest — the external/open-play/tournament/closed switcher with
  paid/positional/RSVP and ad-hoc/captained branches),
  [`host-tools-section.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/host-tools-section.tsx),
  and [`attendees-panel.tsx`](../../apps/web/src/app/events/%5Bid%5D/_components/attendees-panel.tsx).
  Page is now ≤300 LOC, well inside the AGENTS.md soft cap.

---

## P2 findings

### Server-action files missing `revalidatePath` after mutation ✅ Resolved 2026-05-22

- **Where:** [apps/web/src/app/people-actions.ts](../../apps/web/src/app/people-actions.ts), [groups/[id]/members/members-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/members/members-actions.ts), [profile/billing/pro/actions.ts](../../apps/web/src/app/profile/billing/pro/actions.ts), [events/[id]/team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/team-checkout-actions.ts), [events/[id]/tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts), [events/[id]/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts).
- **Resolution:** Audit was overzealous. `people-actions.ts` only exposes
  a read-only `searchPeople()` SELECT — no mutation. `members-actions.ts`
  is a thin FormData adapter that delegates to `addGroupMember()` in
  [groups/actions.ts](../../apps/web/src/app/groups/actions.ts), which
  already calls `revalidatePath(returnPath)` (L134). The four
  Stripe-redirecting actions (`tip-actions.ts`, `checkout-actions.ts`,
  `team-checkout-actions.ts`, `pro/actions.ts`) defer revalidation to the
  `checkout.session.completed` / `customer.subscription.*` webhooks per
  the **Stripe-redirecting actions** exception now codified in AGENTS.md;
  each site carries an explicit `// No revalidatePath here: webhook
handles it` comment.

### `profile/billing/actions.ts` throws bare `Error()` instead of typed `DomainError` ✅ Resolved 2026-05-22

- **Where:** [apps/web/src/app/profile/billing/actions.ts](../../apps/web/src/app/profile/billing/actions.ts) (4 sites) and [apps/web/src/app/profile/billing/pro/actions.ts](../../apps/web/src/app/profile/billing/pro/actions.ts) (7 sites).
- **Resolution:** All 11 `throw new Error(...)` sites reclassified.
  Stripe-misconfig / unexpected-Stripe-response sites now throw
  `InvariantViolation`; anonymous-caller guards throw `UnauthorizedError`.
  HTTP boundary now maps to 401 / 422 instead of 500. See the
  remediation log entry below.

### Duplicated snake_case → camelCase row mapping 🟡 Partial 2026-05-23 (Bundle 64)

- **Where:** [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) (~L184, attendees), [apps/web/src/app/groups/[id]/page.tsx](apps/web/src/app/groups/[id]/page.tsx) (~L100, members), plus several `*-actions.ts` files.
- **Issue:** Each page reinvents the row → DTO mapping inline. No shared per-aggregate mappers. Bugs caught in one location aren't applied to others.
- **Fix:** Add `apps/web/src/lib/mappers/{attendee,group-member,event-summary}.ts` with one pure function per row shape. Import from page boundary; keep components consuming camelCase DTOs.
- **Bundle 64 (2026-05-23):** Friend-edges row shape extracted to
  [apps/web/src/lib/mappers/friend.ts](../../apps/web/src/lib/mappers/friend.ts)
  — `loadFriendEdges(supabase, userId)` returns `{ friends, mutualIds }`,
  used by both `profile/page.tsx` and `friends/page.tsx`. Seeds the
  `lib/mappers/` directory the original fix prescribed. The three
  originally-named shapes (attendee, group-member, event-summary) are
  still open — attendee is mechanical and worth doing; group-member
  still needs the DTO-shape design call (see "Still open" below);
  event-summary requires a survey pass to enumerate the consumers.

### Monolithic `groups/actions.ts`

- **Where:** [apps/web/src/app/groups/actions.ts](apps/web/src/app/groups/actions.ts).
- **Issue:** ~156 LOC, 6 unrelated actions (create/update/follow/unfollow/addMember/removeMember). Sibling routes (`events/[id]`) split actions by concern (`co-host-actions.ts`, `rsvp-actions.ts`, `members-actions.ts`). Inconsistent and harder to grep.
- **Fix:** Split into `groups/create-actions.ts`, `groups/follow-actions.ts`. Move membership actions into `groups/[id]/members-actions.ts` (next to the page that uses them).

### FormData parsing inconsistency ✅ Fixed 2026-05-17

- **Where:** [apps/web/src/app/profile/notifications/actions.ts](apps/web/src/app/profile/notifications/actions.ts) (~L20) uses raw `formData.get('email_enabled') === 'on'`; [apps/web/src/app/groups/actions.ts](apps/web/src/app/groups/actions.ts) and others use the `field()` helper from `lib/form-data.ts`.
- **Issue:** Raw `formData.get()` doesn't account for React 18 slot-prefixing and silently breaks under `useFormState`. Two patterns coexisting invites copy-paste of the wrong one.
- **Fix:** Standardize on `field()`. Optionally add a small `bool()` helper for checkbox parsing.

### Server-action error-handling pattern is inconsistent 🟡 Partial 2026-05-17

- **Where:** [apps/web/src/app/events/[id]/rsvp-actions.ts](apps/web/src/app/events/[id]/rsvp-actions.ts) uses `back()` to redirect with `?rsvp=error` flash params; [apps/web/src/app/events/[id]/co-host-actions.ts](apps/web/src/app/events/[id]/co-host-actions.ts) lets errors propagate.
- **Issue:** No documented strategy. Some actions return `Result`, some redirect with flash, some throw. Users see inconsistent UX on failure (toast vs. URL param vs. error boundary).
- **Fix:** Pick one. Recommend: actions that submit via plain HTML `<form action={...}>` (no client state) use flash-param redirects; actions called from a client component with `useTransition` return a `Result<T, DomainErrorCode>`. Document in `AGENTS.md`.

### Position-fill math duplicated between aggregate and page

- **Where:** Aggregate getters in [packages/domain/src/events/volleyball-event.ts](packages/domain/src/events/volleyball-event.ts) (~L191) vs. page iteration in [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) (~L200) that rebuilds `filledByPosition`.
- **Issue:** The page redoes work the aggregate already knows how to do.
- **Fix:** Expose `filledByPosition: Partial<Record<EventPosition, number>>` on the event detail read model returned by `GetEventDetailHandler`. Page becomes a renderer.

---

## P3 findings

### Missing JSDoc on core aggregates and generators

- **Where:** [packages/domain/src/events/volleyball-event.ts](packages/domain/src/events/volleyball-event.ts) (~L97 `fromPersistence`), [packages/domain/src/brackets/generators.ts](packages/domain/src/brackets/generators.ts) (~L27).
- **Issue:** No documentation of preconditions, invariants, or thrown errors on public methods.
- **Fix:** Add JSDoc to factories and any public method that throws. Especially for `fromPersistence()` (rehydrates without re-validating) vs. `create()` (validates).

### Mixed-style route hrefs in JSX

- **Where:** [apps/web/src/app/events/[id]/page.tsx](apps/web/src/app/events/[id]/page.tsx) ~L325 still has `href={'/events/' + ...}` style strings.
- **Issue:** `typedRoutes: true` catches some but not all of these; consistent template literals are safer.
- **Fix:** Replace remaining string-concat hrefs with template literals cast to `Route` when needed.

### Barrel-export strategy undocumented

- **Where:** `packages/{domain,application,infrastructure}/src/index.ts`.
- **Issue:** Each package re-exports a different subset (domain: everything; infrastructure: adapters only). Not wrong, just unwritten.
- **Fix:** Add a one-paragraph "Exports" section to each package README.

---

## Verified good

- **Centralized composition root:** [apps/web/src/lib/handlers.ts](apps/web/src/lib/handlers.ts) wires every handler once with singleton repositories. No ad-hoc handler construction inside pages or actions.
- **CQRS separation in `packages/application`:** command handlers mutate via aggregates, query handlers fetch read models; no read/write mixing observed.
- **Layer purity:** no `next/*`, `@supabase/*`, `react`, `fs`, or `process.env` imports in `packages/domain` or `packages/application`. Only `node:crypto` and intra-monorepo imports.
- **Port/adapter discipline:** repository interfaces live in `packages/domain/src/*/repository.ts`; Supabase implementations live in `packages/infrastructure`. Application code depends only on the ports.
- **Domain error hygiene in app/infra layers:** typed `NotFoundError`, `ConflictError`, `CapacityExceededError`, `UnauthorizedError`, `ValidationError`, `InvariantViolation` used consistently; HTTP boundary in [apps/web/src/lib/api-helpers.ts](apps/web/src/lib/api-helpers.ts) maps them to status codes. The bracket-generator P1 above is the only exception found.
- **Aggregate richness:** `VolleyballEvent` enforces all invariants internally with private state + public methods. No anemic data bags.
- **Page composition conventions:** `_components/` co-location, `*-actions.ts` next to pages, snake_case→camelCase at page boundary, `'use client'` scoped to genuinely interactive files (43 files audited prior).
- **`exactOptionalPropertyTypes` spread pattern** used correctly (`{...(cond ? { prop } : {})}`), not the broken `prop={cond ? x : undefined}` form.
- **FormData wrapper convention:** e.g. [co-host-actions.ts](apps/web/src/app/events/[id]/co-host-actions.ts) — plain `<form action={wrapper.bind(null, ...args)}>`, typed action invoked inside, `revalidatePath(returnPath)` at the end.
- **`instanceof DomainError` checks** in server actions and route handlers rather than string parsing.
- **Client/server boundary clean:** no `'use client'` files import `next/headers` or `getServerSupabase`; no server components import client-only hooks.
- **Module boundaries:** no deep cross-package imports (`@pickupvb/domain/src/...`); no circular dependencies detected.
- **Parallelization idiom:** event detail and group detail pages use `Promise.all()` for independent reads.

---

## Quick-win bundle

1. **Reclassify bracket-generator throws** — `packages/domain/src/brackets/generators.ts`, ~15 min, all mechanical.
2. **Extract attendee + group-member mappers** to `apps/web/src/lib/mappers/`, ~30 min, immediate DRY win and improves the event detail page diet.
3. **Standardize `field()` usage** — sweep `apps/web/src/app/**/actions.ts` for raw `formData.get(...)` and replace.
4. **Document the server-action error-handling pattern** in `AGENTS.md` (one paragraph), then align `rsvp-actions.ts` and `co-host-actions.ts` to it.
5. **Bootstrap domain tests** with Vitest in `packages/domain`, ~20 cases on `VolleyballEvent`. Establishes the safety net the other fixes need.

---

## Open questions

- Are the bracket-generator throws meant to be **`ValidationError`** (caller passed bad team count) or **`InvariantViolation`** (we constructed the bracket wrong internally)? They read as a mix — the user-input ones should be `ValidationError`, the "round-1 should exist" ones should be `InvariantViolation`.
- Is the **lack of tests** a deliberate "ship fast" choice, or an oversight? Affects whether quick-win #5 belongs at the top of the list or is deferred.
- Should the **event detail read model** be enriched with derived fields (`filledByPosition`, payment-status map, viewer flags), shrinking the page to a renderer? Or do you want the page to keep doing aggregation so the read model stays minimal?
- Is **monolithic `groups/actions.ts`** intentional (the file is small enough that splitting is overkill) or accidental drift from the per-concern pattern used elsewhere?

---

## Remediation log

| Date       | Finding                                                                       | Status                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-23 | P2: Mapper extraction — friend-edges row shape (partial close)                | 🟡 Partial (Bundle 64) | First row shape extracted from the P2 "duplicated snake_case → camelCase row mapping" backlog: new [apps/web/src/lib/mappers/friend.ts](../../apps/web/src/lib/mappers/friend.ts) exposes `loadFriendEdges(supabase, userId): Promise<{ friends, mutualIds }>` and the `FriendProfile` type. Both `profile/page.tsx` and `friends/page.tsx` previously inlined the same select string, the same `OutRow` narrowing type, the same null-filter on the join, and the same incoming-edge `Set<userId>` query — each now reduced to one line. Helper parallelizes the two queries via `Promise.all` (the inlined versions awaited sequentially). Seeds the `lib/mappers/` directory the audit prescribed; attendee + group-member (design call) + event-summary still open. See [Bundle 64 journal](../journal/2026-05-23-bundle-64.md).                                                                                                                                                                                                                                                                                                                      |
| 2026-05-23 | P3 cluster: JSDoc on aggregate factories + hrefs cleanup + barrel-export docs | ✅ Fixed (Bundle 49)   | JSDoc added to the remaining `static create` / `rehydrate` / `fromPersistence` factories on `VolleyballEvent`, `EventTeamPayment`, `EventTeamRegistration` (+ `RegistrationMember`), `Division`, `CommunityListing`, `Bracket`, and `Team` — 12 additions across 7 files, each noting the invariants enforced (e.g. `assertFormatAllowedForSurface`, `MAX_ROSTER_SIZE`, `DEFAULT_BRACKET_CONFIG`) and the domain event raised where applicable. Hrefs cleanup verified already-done: grep for string-concatenated route hrefs returned only `hrefFor(page + 1)` in [pagination.tsx](../../apps/web/src/components/pagination.tsx) (arithmetic, not concat). One-paragraph **Exports** sections added to [packages/domain/README.md](../../packages/domain/README.md), [packages/application/README.md](../../packages/application/README.md), and [packages/infrastructure/README.md](../../packages/infrastructure/README.md) — each documents what the `src/index.ts` barrel re-exports (transparent subfolder rollup for domain; per-handler listing for application; per-adapter listing for infrastructure) and the contract for adding new entries. |
| 2026-05-23 | P2: split `groups/actions.ts`                                                 | ✅ Fixed (Bundle 47)   | The 166-LOC catch-all at `apps/web/src/app/groups/actions.ts` was deleted and its six exports redistributed across three per-concern files: [group-form-actions.ts](../../apps/web/src/app/groups/group-form-actions.ts) (`createGroupAction`, `updateGroupAction`, shared `GroupFormState`), [follow-actions.ts](../../apps/web/src/app/groups/follow-actions.ts) (`followGroup`, `unfollowGroup`), and [member-actions.ts](../../apps/web/src/app/groups/member-actions.ts) (`addGroupMember`, `removeGroupMember`, `changeGroupMemberRole`). All five importers ([members-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/members/members-actions.ts), [edit-group-form.tsx](../../apps/web/src/app/groups/%5Bid%5D/edit/edit-group-form.tsx), [group-viewer-actions.tsx](../../apps/web/src/app/groups/%5Bid%5D/_components/group-viewer-actions.tsx), [member-row-item.tsx](../../apps/web/src/app/groups/%5Bid%5D/members/_components/member-row-item.tsx), [new-group-form.tsx](../../apps/web/src/app/groups/new/new-group-form.tsx)) updated. Now matches the events/[id] per-concern convention; no behaviour change.                        |
| 2026-05-23 | P2 follow-up: `co-host-actions.ts` flash-param redirects                      | ✅ Fixed (Bundle 46)   | `addEventCoHost` / `removeEventCoHost` now `try { … } catch (err) { mapErrorAndFlash(eventId, err) }`. `UnauthorizedError` → `?cohost=unauthorized`, `NotFoundError` → `?cohost=notfound`, `ConflictError` → `?cohost=conflict`, `ValidationError` → `?cohost=invalid`, other `DomainError` → `?cohost=error` (+ `cohost_msg=<message>`); non-domain throws bubble to the React boundary. `redirectEventNotice`'s key union now includes `'cohost'`; [event-flash-banners.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-flash-banners.tsx) renders the five new alert variants and the page threads the params through. This closes the long-standing follow-up from the 2026-05-17 "server-action error-handling pattern" P2 — both event-page action files now share the same flash-param shape.                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-23 | P2: position-fill math into event detail read model                           | ✅ Fixed (Bundle 45)   | `EventDetailReadModel` gained `filledByPosition: Partial<Record<EventPosition, number>>`. `SupabaseEventRepository.getDetail()` was already maintaining a running per-position count while computing waitlist flags — repurposed that `Map` (now incremented unconditionally when an attendee has a position) and serialised it to a plain Record on the way out. Loader's dedicated `for (const a of event.attendees) { … filledByPosition[a.position] = … }` loop deleted in favour of `event.filledByPosition`. Counting + waitlist logic now lives in one place; the page is a renderer. Net: one fewer O(N) walk per event detail render, and the model field is reusable by any future consumer that needs slot-fill ratios.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-17 | P1: bracket-generator typed errors                                            | ✅ Fixed               | All 11 throws in [generators.ts](../../packages/domain/src/brackets/generators.ts) reclassified: user-input preconditions (team counts, power-of-two requirement) → `ValidationError`; internal "shouldn't happen" guards (`bracketSlots` p check, `round-1 should exist`) → `InvariantViolation`. Each throw includes a `details` payload (e.g. `{ teamCount, poolCount }`) for downstream logging. HTTP boundary now maps them to 400/422 instead of 500.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-05-17 | P2: FormData parsing inconsistency                                            | ✅ Fixed               | Added `bool()` helper to [form-data.ts](../../apps/web/src/lib/form-data.ts) (uses the same slot-prefix lookup as `field()`). Replaced `formData.get(...) === 'on'` in [profile/notifications/actions.ts](../../apps/web/src/app/profile/notifications/actions.ts) and `formData.get(...) != null` in [profile/actions.ts](../../apps/web/src/app/profile/actions.ts) with `bool()`. Other `String(formData.get(...) ?? '').trim()` call sites are functionally equivalent to `field()` and were left as-is to keep diff scope tight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-05-17 | P2: server-action error-handling pattern                                      | ✅ Fixed               | New **Server-action error handling** subsection added to [AGENTS.md](../../AGENTS.md). Documents the two-pattern split: plain `<form action={...}>` → flash-param redirects; client-component-invoked → typed `Result<T, DomainErrorCode>`. Also expanded the FormData wrapper example to use `field()` and added an "always use the helpers" callout. `rsvp-actions.ts` already followed the flash-param pattern; `co-host-actions.ts` was aligned in Bundle 46 (see 2026-05-23 row above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-22 | P1: bracket-generator typed errors (registration-flow extension)              | ✅ Partial             | `RegisterTeamHandler` refactored to throw `NotFoundError('division', divisionId)` and `ValidationError` for team-vs-division format mismatch instead of bare `Error`. New `attachTeamToDivision` port on `EventRepository` carries `division_id` through to the `event_teams` row. See [registration-workflow audit](registration-workflow.md) for full context.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [packages/application/src/commands/team.handler.ts](../../packages/application/src/commands/team.handler.ts), [packages/domain/src/events/event-repository.ts](../../packages/domain/src/events/event-repository.ts), [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts) |

| 2026-05-22 | P2: `profile/billing/actions.ts` (and `pro/actions.ts`) typed errors | ✅ Fixed | All 11 `throw new Error(...)` sites across both billing actions files reclassified to `InvariantViolation` (Stripe misconfig / unexpected Stripe response) and `UnauthorizedError` (anonymous caller). Imports added from `@pickupvb/domain`. HTTP boundary now maps to 401/422 instead of 500. |
| 2026-05-22 | P2: server-action files missing `revalidatePath` | 🟡 Partial | Confirmed [people-actions.ts](../../apps/web/src/app/people-actions.ts) and [members-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/members/members-actions.ts) are not actually mutators (search + thin wrapper around `addGroupMember`, which already revalidates) — audit was overzealous, no change needed. Stripe-redirecting actions ([tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts), [checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts), [team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/team-checkout-actions.ts)) gained an explicit `// No revalidatePath here: webhook handles it` comment before each redirect. `pro/actions.ts` redirects to Stripe and is covered by the same pattern. |
| 2026-05-22 | Patterns surfaced by audits codified in AGENTS.md | ✅ Done | New "Patterns surfaced by audits" section in [AGENTS.md](../../AGENTS.md) covers: mutating actions must revalidate (+ Stripe-redirect exception), never bare `throw new Error` for domain failures, no `force-dynamic` on public pages, no impure reads in render (React Compiler), no sync `setState` in `useEffect`, multi-division registrations need explicit `division_id`. |
| 2026-05-22 | P1: test suite bootstrap | ✅ Fixed (Bundle 22) | Vitest config + 90 events-aggregate tests had landed in an earlier unrecorded pass; this bundle added [teams/team.test.ts](../../packages/domain/src/teams/team.test.ts) (32 cases covering `Team.create` / `rehydrate` validation, invite/accept/remove transitions, roster cap math across all four formats, and `setExtraMemberCount` guards) so every domain aggregate now has coverage. Total: 122 domain tests + 6 application tests, all passing via `turbo run test`. Audit doc reconciled to match reality. |
| 2026-05-22 | P1: event detail page diet | ✅ Fixed (Bundle 23) | Extracted data loading + view-model assembly from [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) into new [`_loaders/load-event-detail.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts). The loader returns a typed `EventDetailViewModel` containing the `EventDetailReadModel` plus pricing, two-wave side-loads (viewer-pro / tip total / host social / eligible teams / ad-hoc bundle, then breakdown / payments / viewer payment status), ad-hoc registrations, the legacy snake_case attendee bridge, `filledByPosition`, `viewerPosition`, and the hero `cta`. Page dropped 887 → 566 LOC (35% cut). Aspirational ≤300 LOC requires further JSX componentization (carried as P2 follow-up). |
| 2026-05-22 | P2: event detail JSX componentization | ✅ Fixed (Bundle 24) | Followed up on Bundle 23 to land the audit's original ≤300 LOC target. Six new render-branch components under [`apps/web/src/app/events/[id]/_components/`](../../apps/web/src/app/events/%5Bid%5D/_components/): `event-structured-data`, `event-flash-banners`, `event-location-section`, `event-signup-area` (the external / open-play / tournament / closed switcher — the largest extraction at ~210 LOC), `host-tools-section`, `attendees-panel`. Page dropped 566 → **294 LOC** (48% cut on this pass; 67% cut across both bundles). |

### Still open

- **P2: Mapper extraction** (attendee, group-member, event-summary). Inspected during this pass — the two `group_members` consumers (`groups/[id]/page.tsx` and `groups/[id]/members/page.tsx`) want different DTO shapes (`avatarUrl` vs. `joined_at`) and select different columns, so a unified mapper requires either a maximal-shape DTO with optional fields or two mappers. Worth doing but needs a design call, not a mechanical extract. **Bundle 64 (2026-05-23):** the `lib/mappers/` directory now exists — seeded by `friend.ts` (friend-edges row shape, two callsites consolidated). The three originally-named shapes remain open: attendee is mechanical and ready for a follow-up; group-member is still the design-call case; event-summary needs a survey pass.
