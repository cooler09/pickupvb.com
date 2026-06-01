# Gate anonymous users out of host depth (V-4 / PR-6 / H-5) (2026-06-01)

## Context

Closes persona-ux **V-4** — and with it the home-page audit's **H-5** and the
profile-hub audit's **PR-6** cross-refs, which were the same gap seen from
different surfaces. `/events/new` only guarded `if (!user)`, so an
`is_anonymous` user (signups are anonymous-auth by default) was shown the full
create-event form and hit a wall at submit (the action rejects anon) — after
investing in filling it out. Every host entry point (home hero / "Host" value
card / host pitch, the events-listing header button, the profile "Host an event"
tile, the Host nav dropdown) routes to `/events/new`, so they all funneled anon
users into that dead end.

## Decisions

- **One page-level gate, not per-CTA anon-awareness.** Added
  `if (isAnonymousUser(user)) redirect('/claim?next=/events/new')` to
  `events/new/page.tsx`. Because every entry point funnels to `/events/new`, this
  single gate covers all of them — home, events header, profile tile, nav
  dropdown, and direct URLs — and any future entry point for free. Chose this
  over making each CTA route anon users to `/claim` directly because:
  - It's the **established house convention**: `/teams/new` already gates exactly
    this way (`redirect('/claim?next=/teams/new')`), and its entry CTAs
    (`my-teams-panel`, `tournament-signup-panel`) link straight through and rely
    on the gate. Matching it keeps the two "create" flows consistent.
  - Per-CTA anon branching would duplicate the gate logic across 4–5 files for a
    marginal UX gain (avoiding one redirect), and would diverge from the teams
    CTAs — a partial pattern that costs more than the uniform one.
- **Defense in depth, already half-present.** The submit action
  (`events/new/actions.ts`) already rejected anon (`if (viewer.isAnonymous)`).
  V-4 is the _UX_ half: don't show the form at all, route to claim. The two now
  pair as page-gate (UX) + action-gate (backstop).
- **Reused `isAnonymousUser` from `@/lib/server-auth`.** The canonical helper
  (over the ad-hoc `(user as { is_anonymous?: boolean }).is_anonymous` cast seen
  in some older call sites) — same import `/teams/new` uses.
- **Kept the `?next=/events/new` param even though the claim flow ignores it.**
  Matching `/teams/new` verbatim. The claim email-confirmation flow hardcodes its
  post-confirmation redirect to `/reset-password?from=claim` and drops `?next=`,
  so the user isn't auto-returned after claiming — but that's a **pre-existing**
  limitation shared with the teams gate, not something this change introduces.
  Threading `next` through `emailRedirectTo` + `/auth/callback` is logged as a
  follow-up in persona-ux rather than expanded into this bundle.

## Changes

- [events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx) — import
  `isAnonymousUser`; add the anon → `/claim?next=/events/new` gate right after the
  `if (!user)` guard.

## Patterns observed

- **A single page-level auth gate beats N anon-aware CTAs.** When many entry
  points funnel to one destination, gate the destination, not each doorway —
  it's complete (covers entry points you didn't think of, plus direct URLs),
  consistent, and one line. The codebase already does this for `/teams/new`;
  `/events/new` now matches. Worth keeping in mind for any future "real account
  required" flow (group creation, payouts onboarding).

## Follow-ups

- **Claim `?next=` propagation (P3, pre-existing).** Neither the V-4 gate nor the
  `/teams/new` gate auto-returns the user after they finish claiming, because the
  claim email flow drops `?next=`. Threading it through would close the loop for
  both. Logged in persona-ux's standing backlog.
- **Inline gate vs. redirect (optional).** V-4 offered "or show an inline 'finish
  your account to host' gate." The redirect is simpler and matches `/teams/new`;
  an inline explainer on `/events/new` for anon users (instead of bouncing) is a
  possible future refinement if the bounce proves confusing.
