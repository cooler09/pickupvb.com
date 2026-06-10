# Teams detail page re-audit remediation — TM-5…TM-14 (2026-06-10)

## Context

The 2026-06-01 teams-page audit ([teams-page-ux.md](../audits/teams-page-ux.md))
only covered the `/teams` **discover directory** and explicitly left the
`/teams/[id]` **detail page**, the `MyTeamsPanel`, and the **create flow** "for
their own pass if needed." This bundle is that pass, plus the fixes. The re-audit
opened **0 P1 · 3 P2 · 6 P3** (TM-5…TM-14); all shipped the same day, quad-green,
uncommitted. No migration — rename reuses the existing `teams.name` column.

The detail page is well-architected (ISR shell + `TeamViewerChrome` client
island + league records + room chat). The gaps were almost entirely **feedback**,
one **missing primary path**, and accumulated **stale code**.

## Decisions

- **Flash banners without breaking ISR (TM-5/TM-6).** The detail page is
  deliberately `searchParams`-free so its RSC body stays ISR-cacheable for anon
  traffic (it uses `createSupabaseAnonClient()`, no `cookies()`). The obvious fix
  for "consume the redirect flash" — `await searchParams` in the page — would
  flip it to fully dynamic. Instead the flash is read **client-side** in a new
  `TeamFlash` island via `useSearchParams()` wrapped in `Suspense`, so the static
  shell renders and only the banner hydrates from the query. Build output
  confirms `/teams/[id]` is unchanged (`ƒ` = dynamic params + `revalidate=60`
  ISR, same as before). This is the cleaner analog of the `/events/[id]`
  server-side `pickQuery` flash, chosen specifically to preserve the teams page's
  ISR posture.
- **Rejected: typed `Result` returns for the captain mutations.** The roster
  actions are invoked from plain `<form action>` (no client state), so per
  AGENTS.md "Server-action error handling" the right pattern is **flash-param
  redirects**, not a returned `Result`. Each action maps its typed `DomainError`
  to a reason code and `flashRedirect`s (`?roster=` / `?invite=` / `?team=`).
- **One `flashRedirect` cast seam.** typedRoutes can't verify `${returnPath}?…`
  because `returnPath` arrives as an opaque `string` (the `redirectEventNotice`
  helper sidesteps this by rebuilding `/events/${id}` from a known pattern; the
  teams actions only have the opaque string). Rather than scatter `as Route`
  casts, a single `flashRedirect(returnPath, query)` helper owns the cast.
- **Rename added to the domain, not bolted onto the action.** TM-13 could have
  been a raw `update` in the action, but a team name is an identity field with
  invariants (non-empty, profanity-blocked per ADR 0030). So `Team.rename()`
  lives on the aggregate (mirroring `Team.create`'s name rules), with
  `RenameTeamCommand`/`RenameTeamHandler` enforcing captain-only auth — matching
  `SetTeamExtraMembersHandler`. Domain + handler tests cover the happy path and
  the typed-error branches.
- **TM-8 kept two roster lists, deleted the dead one.** The captain currently
  sees the roster twice (the server-rendered public roster + the viewer island's
  "Roster controls"). The audit floated consolidating into inline remove buttons,
  but that would force the whole roster into the client island and lose its
  ISR-cacheability (or hit the SC→CC function-prop pitfall). The two-list split is
  a deliberate consequence of the ISR design, so the fix was narrow: delete the
  unreachable `viewerIsCaptain`/remove path from `TeamMemberRow` (its only caller
  hardcoded `false`) and leave removal in the controls island.

## Latent bug found and fixed

`addMemberFromForm`'s catch list was `Unauthorized | NotFound | Conflict |
Validation` — but `Team.inviteMember` raises **`InvariantViolation`** for both a
full roster and a duplicate. So adding a player when the roster is at the cap
threw an **uncaught `InvariantViolation` → generic 500**. It's narrow (the picker
excludes existing members, and few teams hit the 12-slot cap), which is why it
hid. Now it maps to `?roster=cap` with an actionable message. The shared
`isKnownTeamError` helper includes `InvariantViolation` so the same class can't
re-leak through the other mutations.

## What shipped

- **TM-5/TM-6** — flash-param redirects across all captain/roster mutations
  ([actions.ts](../../apps/web/src/app/teams/actions.ts)); `TeamFlash` client
  island ([team-flash.tsx](../../apps/web/src/app/teams/[id]/_components/team-flash.tsx));
  `?deleted=1` banner on the directory; `?broadcast=sent` banner on the detail
  page; the full-roster 500 fix above.
- **TM-7** — captain "Enter this team in an event → /events" CTA at the top of
  `TeamViewerChrome`.
- **TM-8** — dead remove path removed from `TeamMemberRow` (now display-only
  `{ member, isCaptain }`).
- **TM-9** — roster rows link to `/players/${handle ?? userId}` (handle threaded
  through the member projection from `ProfileQueries`).
- **TM-10** — `memberName` exported once, imported by the chrome.
- **TM-11** — broadcast subject/body + off-site count use `fieldInputClass`.
- **TM-12** — dropped always-null `firstName`/`lastName` from `TeamRosterMember`
  and the unused `ok` from both panel/action `State` types.
- **TM-13** — captain rename end-to-end (`Team.rename()` +
  `RenameTeamCommand`/`Handler` + domain & handler tests + inline form).
- **TM-14** — TM-1/TM-2 annotated stale (`teams.format` was dropped by
  `20260911000000_drop_teams_format.sql`).

## Verification

`pnpm typecheck && lint && test && build` all green (375 web tests + domain +
application; the only typecheck fix was the `flashRedirect` `Route` cast). Build
confirms `/teams/[id]` stayed ISR (`ƒ` with `revalidate=60`, no regression to
fully-dynamic).

## Follow-ups

- The detail-page flash redirects are exercised by hand but not yet in a
  Playwright spec; an e2e for "captain adds a teammate → sees the banner" would
  pin TM-5/TM-6 (deploy-gated, per the e2e suite's dev-target convention).
- `MyTeamsPanel`'s double create CTA (empty "Captained" + pending invites) is a
  trivial cosmetic nit, intentionally left (noted in the audit's Out-of-scope).
