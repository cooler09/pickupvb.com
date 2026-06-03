# Reframe "walk-in" → "Add a team" (ADR 0033 Phase 1) (2026-06-03)

## Context

Product conversation with the host: for leagues and tournaments the **common**
path is the host adding teams that registered and paid **off-platform** (Venmo,
check, cash) and marking them paid — online self-registration + Stripe is the
desired but minority path. We don't want to force every captain to create an
account.

While mapping the existing surfaces it turned out the capability is _already
built_ for ad-hoc tournament divisions (the `walk_in` source: a team-less,
account-less entry + off-platform mark-paid + refund/remove), but it's framed as
a day-of **"walk-in"** — the wrong word for a host pre-loading known teams. And
the 2026-07-31 table collapse (`event_team_entries`) already gives us a
team-less placeholder whose `id` is the identity brackets/standings key on, so
extending this to leagues won't need to touch the `Team` aggregate.

Full decision + phasing recorded in
[ADR 0033](../adr/0033-host-managed-account-less-team-entries.md). This entry
covers **Phase 1 only: the vocabulary reframe** (no schema/domain/RLS change).

## Decisions

- **Reframe the user-facing copy, keep the internal `source = 'walk_in'`.**
  Renaming the enum would be a schema + check-constraint migration for a
  non-behavioral distinction (ADR 0033 "Modeling decision"). Components, action
  files, and commands keep their `WalkIn` names; only visible strings change.
- **Pill label: "Walk-in" → "Added by host"** on both the host management panel
  and the public roster — it describes _who created the row_ (host, no account
  captain) rather than _when_ ("day-of"), which is the distinction that actually
  matters to a viewer.
- **Buttons/titles: "Add walk-in team(s)" → "Add a team" / "Add teams."** Host
  single-add modal uses the singular; the bracket multi-add modals (which stay
  open across adds) use the plural. The bracket standalone/event branches for the
  button label + modal title collapsed to one string (they now read identically),
  while the **description** ternary stays — standalone brackets still get the
  "type in names / paste a list" copy.

## Changes

- [host-ad-hoc-teams-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/host-ad-hoc-teams-panel.tsx)
  — header blurb, "+ Add a team" trigger, modal title/description, submit label,
  and the "Added by host" pill.
- [teams-registered-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/teams-registered-section.tsx)
  — public roster pill "Walk-in" → "Added by host".
- [setup-view.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/setup-view.tsx)
  - [no-bracket-view.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/no-bracket-view.tsx)
    — bracket add-team triggers + titles + the "need ≥ 2 teams" hint copy.
- [walk-in-team-form.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/walk-in-team-form.tsx)
  — team-name placeholder "e.g. Walk-in Wonders" → "e.g. Block Party".
- [ad-hoc-team-signup-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/ad-hoc-team-signup-panel.tsx)
  — doc comment updated to match the renamed pill.
- Docs: [ADR 0033](../adr/0033-host-managed-account-less-team-entries.md) (new),
  ADR README index row + 0017 status note.

## Patterns observed

- **Internal vocabulary and product vocabulary can diverge cheaply.** When a
  product term is wrong but the data model is fine, a copy-only reframe (visible
  strings + pill labels) is far cheaper than renaming the enum/columns/types —
  and the verify chain (typecheck/lint/test/build) confirms nothing structural
  moved. Grep for the term, then filter out imports/identifiers/comments to find
  the genuinely user-facing strings.

## Follow-ups

- **Phase 2 (deferred):** extend host-add + off-platform mark-paid to
  league/roster divisions — relax `RegisterWalkInTeamHandler`'s `tournament +
ad_hoc` gate, widen the `event_team_entries` insert RLS host branch to roster
  divisions, and give `LeagueTeamsPanel` an "Add a team" form + payment pills +
  mark-paid (today it's forfeit/reinstate only). See ADR 0033 Phase 2.
- **Phase 3 (deferred):** captain-claim UI for a host-added team (ADR 0017 §7).
- Once host-add becomes the _majority_ on a league roster, revisit whether the
  "Added by host" pill on every row is signal or noise.
