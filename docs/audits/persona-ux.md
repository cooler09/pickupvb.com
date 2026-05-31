# Persona UX / UI Audit

_Last updated: 2026-05-31_

Site-wide UX/UI audit through two lenses the existing audits don't cover head-on:

1. **Persona journeys** — does the UI cater to the distinct people who use it
   (signed-out visitor, anonymous/un-claimed user, player/attendee, team
   captain, host/organizer)? Weighted this pass to **host**, **visitor→signup**,
   and **player/attendee** per the requester.
2. **Clarity of action items + edit forms** — are CTAs, edit forms, and
   destructive actions clean, consistent, and unambiguous across surfaces?

This file is complementary to — not a duplicate of:

- [events-page-ux.md](events-page-ux.md) — page-scoped to the event-detail page.
- [m3-alignment.md](m3-alignment.md) — Material 3 token/primitive conformance.
  That audit already records the headline number (**primitive adoption ~5%**,
  ratchet-behind-migration strategy, Bundle 139). This file reads the **same
  drift through the persona/clarity lens** and prioritizes the conversions that
  most affect a real user's flow, rather than re-counting tokens.
- [accessibility.md](accessibility.md) — 508 / ARIA conformance. Tap-target and
  `aria` notes here cross-reference it.

> **Scope note:** this is a full written audit (not a quick chat scan). Findings
> are graded P1/P2/P3 per [README.md](README.md), each with a file link and a
> concrete fix. The 2026-05-31 bundle implemented the P1 + the highest-leverage
> quick wins (see **Remediation log** at the bottom); the rest is the standing
> backlog.

---

## The persona model (as the nav encodes it)

[site-header.tsx](../../apps/web/src/components/site-header.tsx) +
[bottom-nav.tsx](../../apps/web/src/components/bottom-nav.tsx) split the audience
into:

| Persona               | Auth state                  | Primary surfaces                                                     | What they need to be obvious                                      |
| --------------------- | --------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Visitor**           | no session                  | `/`, `/events`, event detail                                         | One unmistakable "find events" + one "create account/host" path   |
| **Anonymous user**    | `is_anonymous: true`        | RSVP flows, `/claim`                                                 | A persistent nudge to claim before being shown account-only depth |
| **Player / attendee** | real user                   | event detail, `/profile`, `/profile/receipts`, notifications         | RSVP/leave/pay action items that read the same everywhere         |
| **Team captain**      | real user                   | `/teams`, tournament team signup                                     | (de-weighted this pass)                                           |
| **Host / organizer**  | real user (+ Stripe, + Pro) | `/events/new`, `/events/[id]/edit`, host tools, `/profile/billing/*` | Long edit forms + dense action items that stay legible            |

The nav itself is persona-aware and in good shape (grouped Community/Host
dropdowns, anon→claim banner, notification bell, mobile bottom-nav). The
problems are **downstream of the nav**, in how action items and edit forms are
built.

---

## Root-cause theme: the design system exists but isn't the path of least resistance

The repo has a **canonical CTA + field vocabulary** —
[primary-button.tsx](../../apps/web/src/components/primary-button.tsx)
(`primaryButtonClass` / `secondaryButtonClass` / `tonalButtonClass` /
`textButtonClass`, M3 state-layer, `text-primary-fg` token),
[text-field.tsx](../../apps/web/src/components/text-field.tsx) (M3 outlined
`TextField`), and [field-error.tsx](../../apps/web/src/components/field-error.tsx)
(`FieldError` / `fieldA11y`). But adoption is the exception, not the rule, so the
same action reads differently depending on which screen a persona is on. Measured
2026-05-31 (`apps/web/src`):

| Drift                                                          | Count                                                                    | Canonical                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Old primary-button recipe (`hover:bg-primary/90`)              | **68 occurrences / 51 files**                                            | `primaryButtonClass` — **11 files**            |
| Local `inputClass =` field vocabularies                        | ~~17~~ → **1 shared** (CC-2 ✅ 2026-05-31b; 2 compact-inline exceptions) | `field-styles.ts` + `TextField`                |
| `text-white` hardcoded on buttons (vs `text-primary-fg` token) | **64**                                                                   | token                                          |
| Native `window.confirm` for destructive actions                | ~~1~~ → **0** (CC-4 ✅ 2026-05-31b)                                      | in-app `ConfirmSubmitButton` dialog everywhere |

That ratio (≈5:1 hand-rolled:canonical on buttons; 17 forked field styles) is the
mechanical reason the UI "doesn't feel clean for action items and edit forms." It
also corroborates m3-alignment.md's ~5% adoption figure from the user-flow side.

---

## Findings

### Cross-cutting (the consistency layer every persona touches)

#### CC-1 — Button vocabulary has forked five ways · **P2**

The Bundle 127 sweep extracted `primaryButtonClass` but the highest-traffic
action buttons never migrated, including the two most-reused leaf components:

- [confirm-submit-button.tsx#L62-L75](../../apps/web/src/components/confirm-submit-button.tsx#L62-L75)
  — the default trigger **and** the modal confirm/cancel buttons hand-roll
  `bg-primary hover:bg-primary/90 text-white`. This one component renders the
  RSVP / Leave / Buy-ticket / Cancel-signup / refund CTAs for **every** persona,
  so fixing it propagates everywhere at once.
- [form-primitives.tsx#L93-L104](../../apps/web/src/app/events/new/_components/form-primitives.tsx#L93-L104)
  — the create-event submit (`px-5 py-2.5`, a third size).
- High-visibility marketing/browse pages: [page.tsx#L56-L67](../../apps/web/src/app/page.tsx#L56-L67),
  [page.tsx#L254-L290](../../apps/web/src/app/page.tsx#L254-L290),
  [events/page.tsx#L252-L258](../../apps/web/src/app/events/page.tsx#L252-L258),
  [events/page.tsx#L426-L451](../../apps/web/src/app/events/page.tsx#L426-L451).

The result: primary CTAs ship at **three paddings** (`px-3 py-1.5`, `px-4 py-2`,
`px-5 py-2.5`) and **two label weights** depending on screen.
**Fix:** route every primary CTA through `primaryButtonClass(size)` and every
neutral/outlined CTA through `secondaryButtonClass`. Start with
`ConfirmSubmitButton` + `form-primitives.SubmitButton` (done 2026-05-31 — see
log) since they cover the most surfaces; then ratchet so the old recipe can't
re-enter (see m3-alignment.md's ratchet plan).

#### CC-2 — 17 parallel field/label vocabularies · **P2** · ✅ resolved 2026-05-31b

Each form re-declares its own `inputClass` / `labelClass` instead of using
`TextField` (3 adopters total). They diverge on padding (`px-3 py-2` vs
`px-2 py-1.5`), label size (`text-sm` vs `text-xs`), focus treatment
(`focus-visible:ring` vs `focus:border-primary` only vs none), and `shadow-sm`.
The forked definitions:
[form-primitives.tsx#L18-L24](../../apps/web/src/app/events/new/_components/form-primitives.tsx#L18-L24),
[host-divisions-manager.tsx#L27-L29](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx#L27-L29),
[guest-signup-form.tsx#L9-L12](../../apps/web/src/app/events/[id]/guest-signup-form.tsx#L9-L12),
[profile-form.tsx](../../apps/web/src/app/profile/profile-form.tsx),
[new-team-form.tsx](../../apps/web/src/app/teams/new/new-team-form.tsx),
[new-group-form.tsx](../../apps/web/src/app/groups/new/new-group-form.tsx),
[community-listing-form.tsx](../../apps/web/src/app/community/new/community-listing-form.tsx),
+10 more (`grep -rn "inputClass =" apps/web/src`).
**Fix:** converge on one recipe. Either (a) migrate surface-by-surface to
`TextField` (preferred long-term; it also fixes the a11y wiring for free), or
(b) if the outlined `TextField` chassis is too heavy for dense host grids,
extract a single shared `fieldInputClass`/`fieldLabelClass` from
`form-primitives.tsx` and import it everywhere. Pick one and ratchet; the cost
today is that every persona's edit form looks subtly hand-made.

#### CC-3 — `text-white` hardcoded on 64 primary buttons · **P3**

Primary CTAs use literal `text-white` instead of the `text-primary-fg` token
that `primaryButtonClass` uses. Cosmetically fine on the current palette but
breaks if the primary color ever shifts to a light hue (the fg would need to go
dark). **Fix:** fold into the CC-1 migration — `primaryButtonClass` already
emits the token, so converting call sites removes these for free.

#### CC-4 — Destructive-confirm UX is inconsistent · **P2** · ✅ resolved 2026-05-31b

Everywhere except one place, destructive actions use the in-app
`ConfirmSubmitButton` modal (native `<dialog>`, `aria-modal`, focus trap).
[host-divisions-manager.tsx#L242-L246](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx#L242-L246)
uses the browser's `window.confirm` for "Remove division" — a different,
unstyled, non-themeable dialog for one of the more consequential host actions.
**Fix:** replace with `ConfirmSubmitButton` (wrap `removeDivision` in a small
`<form action={...}>`), matching every other delete in the app.

#### CC-5 — Inline-expand edit pattern shoves content around · **P3**

`host-divisions-manager` expands a **16-field** edit form inline per row
([host-divisions-manager.tsx#L255-L288](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx#L255-L288)),
the exact "inline disclosure leaks context for a focused subtask" problem the
events-page-ux audit already solved for the walk-in team form by moving it into
`FormModal`. This is **already tracked as a P2 carry-over** in
[events-page-ux.md](events-page-ux.md) (2026-05-28 status block). Reaffirmed here
from the host-persona angle. **Fix:** convert per-row Edit + "+ Add division" to
[form-modal.tsx](../../apps/web/src/components/form-modal.tsx), per that plan.

---

### Visitor → signup

#### V-1 — Landing "Create account" CTA 404s · **P1**

[page.tsx#L278-L283](../../apps/web/src/app/page.tsx#L278-L283) — the guest
footer CTA links to `/signup`, which has **no route and no redirect** (verified:
`redirects()` in [next.config.mjs](../../apps/web/next.config.mjs) only handles
www→apex; no `app/signup/page.tsx`). The `'/signup' as Route` cast suppresses the
`typedRoutes` build error that would otherwise catch it. Every other signup entry
point uses `/login?mode=sign-up`. This is a dead "Create account" button on the
marketing page, squarely in the prioritized visitor→signup funnel.
**Fix (done 2026-05-31):** point it at `/login?mode=sign-up`.

#### V-2 — Signup entry points are visually/behaviorally divergent · **P2**

The same "create an account / host" intent is rendered with different styling and
sizes across the funnel: header "Sign up" pill
([site-header.tsx#L179-L184](../../apps/web/src/components/site-header.tsx#L179-L184),
`px-3 py-1.5`), landing hero/host-pitch/footer CTAs
([page.tsx#L56-L67](../../apps/web/src/app/page.tsx#L56-L67) `px-5 py-2.5`;
[page.tsx#L254-L265](../../apps/web/src/app/page.tsx#L254-L265) `px-4 py-2.5`).
Three paddings, all `text-white`, none using the canonical class.
**Fix:** migrate to `primaryButtonClass`/`secondaryButtonClass` (landing done
2026-05-31; header sign-up/sign-in pills remain).

#### V-3 — The auth front door bypasses the design system · **P2**

[login/page.tsx](../../apps/web/src/app/login/page.tsx) — the highest-intent
page in the funnel hand-rolls its inputs
([login/page.tsx#L86-L120](../../apps/web/src/app/login/page.tsx#L86-L120)) and
submit ([login/page.tsx#L125-L131](../../apps/web/src/app/login/page.tsx#L125-L131))
instead of `TextField` + `primaryButtonClass`, and is one of the 4-space-indent
outliers. **Fix:** adopt `TextField` (email/password) + `primaryButtonClass('md')`
for the submit; let the `GoogleButton` stay as-is.

#### V-4 — Anonymous users are funneled into host depth with no claim nudge · **P3**

`/events/new` only guards `if (!user)`
([events/new/page.tsx#L31-L33](../../apps/web/src/app/events/new/page.tsx#L31-L33)),
so an `is_anonymous` user is shown the full create-event form — and the home page
([page.tsx#L161](../../apps/web/src/app/page.tsx#L161)), events header
([events/page.tsx#L251](../../apps/web/src/app/events/page.tsx#L251)), and Host
nav dropdown all surface "Host an event" to them (the checks use `user`, which is
truthy for anon). Hosting needs a claimed account + Stripe payout to be useful,
so anon hosts hit a wall mid-form. **Fix:** on host entry points, detect
`is_anonymous` and route to `/claim?next=/events/new` (or show an inline "finish
your account to host" gate) rather than the bare form.

---

### Player / attendee

#### P-1 — "Sign up as a guest" looks like three different features · **P2**

The everyday guest-RSVP action item is built three ways depending on the event's
price model: the free-event form
([guest-signup-form.tsx](../../apps/web/src/app/events/[id]/guest-signup-form.tsx),
`text-xs` labels, focus-ring inputs, Turnstile), the paid-event inline form
([paid-ticket-panel.tsx#L180-L212](../../apps/web/src/app/events/[id]/_components/paid-ticket-panel.tsx#L180-L212),
different inputs, `bg-background`, no Turnstile shown), and the login fallback.
Same persona, same intent, three field treatments and label sizes.
**Fix:** extract one `GuestSignupFields` (name + optional/required email)
consumed by both panels; standardize on the shared field recipe from CC-2.

#### P-2 — "You're in" status pills use four ad-hoc color treatments · **P3**

The signup-confirmation pill is re-declared per panel:
primary-tinted in [rsvp-panel.tsx#L42-L44](../../apps/web/src/app/events/[id]/_components/rsvp-panel.tsx#L42-L44),
and emerald/amber/primary variants in
[paid-ticket-panel.tsx#L30-L46](../../apps/web/src/app/events/[id]/_components/paid-ticket-panel.tsx#L30-L46).
The color semantics (paid=green, pending=amber) are intentional and worth
keeping, but the markup is copy-pasted. **Fix:** extract a `StatusPill`
primitive with a `tone` prop so the treatment is defined once.

#### P-3 (positive) — `/profile` is the model to copy

[profile/page.tsx](../../apps/web/src/app/profile/page.tsx) is the strongest
persona-aware surface in the app: identity hero, a 3-up "Quick actions" grid
([profile/page.tsx#L180-L197](../../apps/web/src/app/profile/page.tsx#L180-L197))
that uses the `text-primary-fg` token, an "Action required" pending-invites block
([profile/page.tsx#L200-L224](../../apps/web/src/app/profile/page.tsx#L200-L224)),
and edit-profile tucked behind a `<details>` so the page leads with status, not a
form. Use its `SectionHeader` / `ActionTile` / action-required pattern as the
template when restyling the host and team hubs.

---

### Host / organizer

#### H-1 — The primary host edit form diverges from the design system · **P2**

The create/edit event form (the most important, most-used host surface) runs
entirely on the **local** [form-primitives.tsx](../../apps/web/src/app/events/new/_components/form-primitives.tsx)
— its own `inputClass`/`labelClass`/`SubmitButton`/`SegmentedControl` — rather
than the shared primitives. It's well-decomposed internally (per the
architecture audit), but it's a parallel design system. **Fix:** as CC-1/CC-2 —
swap its `SubmitButton` to `primaryButtonClass('md')` (done 2026-05-31) and
converge its `inputClass`/`labelClass` onto the shared field recipe so edit forms
match the rest of the app.

#### H-2 — Divisions manager is the densest action-item offender · **P2**

[host-divisions-manager.tsx](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx)
stacks four of the issues above in one component: a 5th local `inputClass`
(CC-2), inline 16-field expand (CC-5), `window.confirm` (CC-4), and Edit/Remove
rendered as bare `text-primary`/`text-red-600` text links
([host-divisions-manager.tsx#L268-L283](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx#L268-L283))
that fall below the 44px M3/AA tap target and give the destructive Remove the
same visual weight as Edit. **Fix:** FormModal conversion (CC-5) + ConfirmSubmit
(CC-4) + `textButtonClass`/`secondaryButtonClass` with `tap-target` for the
row actions; demote Remove to a less prominent slot.

#### H-3 — Row-level action items sit below tap-target across host lists · **P3**

The `text-link` action pattern (`text-primary hover:underline`, ~16-20px tall)
recurs in host management lists (divisions, and similar patterns in group/team
member rows). It reads as a hyperlink, not an action, and misses the 44px target.
Cross-ref [accessibility.md](accessibility.md). **Fix:** standardize row actions
on `textButtonClass()` + the `tap-target` utility (Bundle 130).

---

## What's already good (don't regress)

- **Navigation** is genuinely persona-aware (grouped dropdowns, anon claim
  banner, notification bell, mobile bottom-nav per M3).
- **`/profile`** (P-3 above) — the reference layout for status-first hubs.
- **`ConfirmSubmitButton`** — the right confirmation _pattern_ (in-app dialog,
  full a11y); it only needs its _classes_ aligned (CC-1).
- **`EmptyState` copy** on `/events` is thoughtfully persona-branched
  (not-signed-in vs no-follows vs no-filters) — only the CTA buttons need the
  vocabulary fix.
- **Flash-banner + claim nudge** after guest RSVP
  ([rsvp-panel.tsx#L29-L37](../../apps/web/src/app/events/[id]/_components/rsvp-panel.tsx#L29-L37))
  is exactly the anon→claim funnel V-4 wants more of.

---

## Remediation log

### 2026-05-31 — P1 + highest-leverage quick wins (initial bundle)

Implemented this pass (verify chain green):

- **V-1 (P1) — fixed.** Landing "Create account" CTA now points to
  `/login?mode=sign-up`; removed the `'/signup' as Route` dead link.
- **CC-1 (partial) — `ConfirmSubmitButton` + create-event submit aligned.**
  `confirm-submit-button.tsx` default trigger and modal confirm now use
  `primaryButtonClass('md')`; cancel uses `secondaryButtonClass('md')`;
  destructive confirm keeps the red treatment (no canonical error-button class
  yet — see backlog). `form-primitives.tsx` `SubmitButton` now uses
  `primaryButtonClass('md')`. This propagates the canonical CTA to every
  RSVP/leave/buy/cancel surface and the create-event form in one change.
- **CC-1 / V-2 (partial) — landing + events-browse CTAs migrated** to
  `primaryButtonClass`/`secondaryButtonClass` (`app/page.tsx`,
  `app/events/page.tsx` header + `EmptyState`).

### 2026-05-31b — CC-2 field-vocabulary convergence + CC-4 (second bundle)

Implemented this pass (verify chain green: typecheck / lint / 621 tests / build):

- **CC-2 — fixed (16 of 17 forms).** New shared
  [field-styles.ts](../../apps/web/src/components/field-styles.ts) exports
  `fieldLabelClass` / `fieldSubLabelClass` / `fieldInputClass` / `fieldHintClass`
  / `fieldErrorClass`, matching the `TextField` chassis tokens so bare
  `<input>`/`<textarea>`/`<select>` fields and `TextField` can coexist without a
  seam. Migrated forms now import it (aliased to their existing local names so
  call sites were untouched): `form-primitives.tsx` (re-exports it, so all
  create/edit-event sections inherit), `divisions-repeater.tsx`,
  `host-divisions-manager.tsx`, `event-advanced-details-panel.tsx`,
  `sponsor-panel.tsx`, `guest-signup-form.tsx`, `claim-form.tsx`,
  `profile-form.tsx`, `add-profile-video-form.tsx`, `add-media-form.tsx`,
  `new-team-form.tsx`, `new-group-form.tsx`, `edit-group-form.tsx`,
  `community-listing-form.tsx`, `community-listing-edit-form.tsx`,
  `scoreboard/setup-form.tsx`. This collapsed the padding / label-size / focus-ring
  / `bg-bg`-vs-`bg-surface` drift onto one recipe (note: the compact host grids in
  divisions-repeater/host-divisions-manager move from `px-2 py-1.5` text-xs labels
  to the standard `px-3 py-2` text-sm — intentionally, for cross-form consistency).
  - **Intentional exceptions (NOT converged), documented so they're not "misses":**
    [match-row.tsx#L37](../../apps/web/src/app/events/[id]/schedule/_components/match-row.tsx#L37)
    (inline dense schedule-table cell — `rounded px-2 py-1`, no label/`mt-1`;
    the block field recipe would break the row layout) and
    [event-filter-form.tsx#L33](../../apps/web/src/app/events/_components/event-filter-form.tsx#L33)
    `selectClass` (compact filter-bar select, not an edit-form field). These are a
    different control class than labeled form fields.
- **CC-4 — fixed.** [host-divisions-manager.tsx](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx)
  "Remove division" no longer uses `window.confirm`; it's a
  `<form action={removeDivision.bind(...)} className="contents">` wrapping a
  `ConfirmSubmitButton` (`destructive`), matching every other delete in the app.

### Standing backlog (graded above, not yet done)

- **P2:** CC-1 remainder (header sign-up/sign-in pills + the other ~45 hand-rolled
  files), V-2/V-3 (login page primitives), P-1 (shared GuestSignupFields),
  H-1/H-2 (host form depth + divisions-manager FormModal). _CC-2 + CC-4 resolved
  2026-05-31b._
  - **CC-2 ratchet (do next so the convergence holds):** add a lint rule (or
    `grep` CI check) that flags a new local `const inputClass`/`labelClass`
    string literal, steering authors to import from `field-styles.ts` /
    `TextField`. Without it the 17→1 collapse will re-accumulate.
- **P3:** CC-3 (text-white token sweep — folds into CC-1), CC-5/H-2 (FormModal
  conversion — also in events-page-ux.md), V-4 (anon→claim host gate), P-2
  (StatusPill primitive), H-3 (row-action tap targets).
- **New primitive worth adding:** an `errorButtonClass`/`destructiveButtonClass`
  in `primary-button.tsx` so destructive confirms stop hand-rolling `bg-red-600`.

---

## How to re-run this audit

1. Re-measure the drift table: `grep -rn "hover:bg-primary/90" apps/web/src`,
   `grep -rn "inputClass =" apps/web/src`, `grep -rcn "text-white" apps/web/src`,
   vs `grep -rln "primaryButtonClass" apps/web/src` and `<TextField`.
2. Walk one screen per persona row in the table above and ask: is the primary
   action obvious, is it styled like the same action elsewhere, and does the edit
   form match the others?
3. Update the drift counts + this log; flip the README index row date.
