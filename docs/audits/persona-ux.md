# Persona UX / UI Audit

_Last updated: 2026-06-01_

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

| Drift                                                          | Count                                                                       | Canonical                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Old primary-button recipe (`hover:bg-primary/90`)              | ~~68 / 51 files~~ → **0** (CC-1 ✅ 2026-05-31d; ratchet-locked)             | `primaryButtonClass` — **61 files**            |
| Local `inputClass =` field vocabularies                        | ~~17~~ → **1 shared** (CC-2 ✅ 2026-05-31b; 2 compact-inline exceptions)    | `field-styles.ts` + `TextField`                |
| `text-white` hardcoded on buttons (vs `text-primary-fg` token) | ~~64~~ → **0** (CC-1 absorbed most; CC-3 ✅ 2026-06-01j cleared the last 5) | `text-primary-fg` token                        |
| Native `window.confirm` for destructive actions                | ~~1~~ → **0** (CC-4 ✅ 2026-05-31b)                                         | in-app `ConfirmSubmitButton` dialog everywhere |

That ratio (≈5:1 hand-rolled:canonical on buttons; 17 forked field styles) is the
mechanical reason the UI "doesn't feel clean for action items and edit forms." It
also corroborates m3-alignment.md's ~5% adoption figure from the user-flow side.

---

## Findings

### Cross-cutting (the consistency layer every persona touches)

#### CC-1 — Button vocabulary has forked five ways · **P2** · ✅ resolved 2026-05-31d

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

#### CC-3 — `text-white` hardcoded on primary buttons · **P3** · ✅ resolved 2026-06-01j

Primary CTAs used literal `text-white` instead of the `text-primary-fg` token
`primaryButtonClass` emits — cosmetically fine on the current palette but breaks
if the primary hue ever shifts light (the fg would need to go dark). **Resolved:**
the CC-1 sweep absorbed most (64→ a handful as call sites adopted
`primaryButtonClass`); a 2026-06-01j re-measure found `text-white` down to **26
total**, of which only **5** were the real violation (`text-white` on
`bg-primary`). Fixed all 5 — `free-agent-signup-panel.tsx`'s SubmitButton (a
hand-rolled `bg-primary … text-white hover:opacity-90`, a CC-1 ratchet miss
because it used `hover:opacity-90` not `hover:bg-primary/90`) → `primaryButtonClass('md')`;
the `auth-mode-tabs` active tab + the notification/messages count badges →
`text-primary-fg`. `bg-primary`+`text-white` is now **0**. The remaining ~21
`text-white` are correct foregrounds on amber/emerald/red/violet badges (no
`text-primary-fg` applies there).

#### CC-4 — Destructive-confirm UX is inconsistent · **P2** · ✅ resolved 2026-05-31b

Everywhere except one place, destructive actions use the in-app
`ConfirmSubmitButton` modal (native `<dialog>`, `aria-modal`, focus trap).
[host-divisions-manager.tsx#L242-L246](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx#L242-L246)
uses the browser's `window.confirm` for "Remove division" — a different,
unstyled, non-themeable dialog for one of the more consequential host actions.
**Fix:** replace with `ConfirmSubmitButton` (wrap `removeDivision` in a small
`<form action={...}>`), matching every other delete in the app.

#### CC-5 — Inline-expand edit pattern shoves content around · **P3** · ✅ resolved 2026-06-01f

`host-divisions-manager` expanded a **16-field** edit form inline per row — the
exact "inline disclosure leaks context for a focused subtask" problem the
events-page-ux audit already solved for the walk-in team form by moving it into
`FormModal`. **Fixed (done):** both per-row **Edit** and the section-level
**"+ Add division"** now open the same `DivisionForm` inside
[form-modal.tsx](../../apps/web/src/components/form-modal.tsx) (`size="lg"`), with
`CloseOnSettled` dismissing the modal when the server action settles and
`ModalActions` owning the Cancel/Submit row. The `editingId`/`adding` state
machine is gone — Radix owns each modal's open state. See H-2 for the rest of the
bundle (row-action tap targets + button convergence).

#### CC-6 — CC-1 ratchet has a `hover:opacity-90` blind spot · **P3** · ⚠ open (surfaced 2026-06-01k)

The CC-1 button ratchet (2026-05-31d) forbids the **old** recipe's tell —
`hover:bg-primary/90` — but a second hand-rolled filled-primary recipe uses
`bg-primary text-primary-fg … hover:opacity-90` instead, which the ratchet
doesn't catch. Found incrementally: 1 in `free-agent-signup-panel` (fixed in
CC-3, 2026-06-01j), 3 in `player-viewer-actions` (fixed 2026-06-01k), and a
re-measure (`grep "bg-primary" | grep "hover:opacity-90"`) shows **17 more**
still live — e.g.
[setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx),
[no-bracket-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/no-bracket-view.tsx),
[host-ad-hoc-teams-panel.tsx](../../apps/web/src/app/events/[id]/_components/host-ad-hoc-teams-panel.tsx),
[format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx),
[walk-in-team-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/walk-in-team-form.tsx),
[brackets/page.tsx](../../apps/web/src/app/brackets/page.tsx),
[share-link.tsx](../../apps/web/src/components/share-link.tsx),
[consent-banner.tsx](../../apps/web/src/components/consent-banner.tsx),
[profile/billing/page.tsx](../../apps/web/src/app/profile/billing/page.tsx) (+
`business-info-form`, `billing/analytics`, `sentry-test`). These are genuine
hand-rolled primary buttons that should be `primaryButtonClass`. **Fix:** an
exact-string codemod `bg-primary … hover:opacity-90` → `primaryButtonClass(size)`
(same shape as the CC-1 sweep), then **extend the ratchet** to also flag a
`hover:opacity-90` literal co-located with `bg-primary` (or just flag
`hover:opacity-90` on a filled button — confirm no legitimate non-button use
first). Until then "CC-1 ratchet-locked" is only true for the `/90` recipe.

#### V-1 — Landing "Create account" CTA 404s · **P1**

[page.tsx#L278-L283](../../apps/web/src/app/page.tsx#L278-L283) — the guest
footer CTA links to `/signup`, which has **no route and no redirect** (verified:
`redirects()` in [next.config.mjs](../../apps/web/next.config.mjs) only handles
www→apex; no `app/signup/page.tsx`). The `'/signup' as Route` cast suppresses the
`typedRoutes` build error that would otherwise catch it. Every other signup entry
point uses `/login?mode=sign-up`. This is a dead "Create account" button on the
marketing page, squarely in the prioritized visitor→signup funnel.
**Fix (done 2026-05-31):** point it at `/login?mode=sign-up`.

#### V-2 — Signup entry points are visually/behaviorally divergent · **P2** · ✅ resolved 2026-06-01e

The same "create an account / host" intent was rendered with different styling and
sizes across the funnel: header "Sign up" pill, landing hero/host-pitch/footer
CTAs (`px-5 py-2.5` / `px-4 py-2.5`), all `text-white`, none using the canonical
class. The landing CTAs (2026-05-31) and the "Sign up" pill (CC-1 sweep) were
already done; this pass finished the **header + mobile-drawer auth cluster**.
**Fixed (done):** the **Sign in / Sign up** pair now reads as the canonical M3
**Outlined + Filled** pair on both surfaces —
[site-header.tsx](../../apps/web/src/components/site-header.tsx) "Sign in" went
from a bare `hover:text-primary text-sm` nav text-link to
`secondaryButtonClass('sm')` (pairing with the Filled `primaryButtonClass('sm')`
"Sign up"), and [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx)
"Sign in" went from a hand-rolled `border-border-base hover:bg-fg/5` button to
`secondaryButtonClass('md')`. The anon **"Finish creating your account"** claim
nudge — the last hand-rolled recipe in that cluster
(`border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 …`) — moved to
`tonalButtonClass('sm')` (M3 Filled-tonal, the right medium-emphasis weight for a
nudge sitting beside the Filled "Sign up"). _Pre-existing behavioral note, not
changed: the desktop header shows anon users the claim nudge, but the mobile
drawer's anon branch shows only Sign in / Sign up — surfacing the claim nudge in
the drawer is a separate V-4-family follow-up, left out of this button-vocabulary
pass._

#### V-3 — The auth front door bypasses the design system · **P2** · ✅ resolved 2026-06-01c

[login/page.tsx](../../apps/web/src/app/login/page.tsx) — the highest-intent
page in the funnel hand-rolled its inputs
(`border-border-base mt-1 w-full rounded-md border px-3 py-2`, a bare `<label>` >
`<span>` > `<input>` with no `htmlFor`/`id` wiring) instead of `TextField`.
**Fixed (done):** migrated the email + password fields to
[TextField](../../apps/web/src/components/text-field.tsx) — the M3 outlined
chassis now owns the label/`id` a11y wiring (was missing), the focus ring, and
the sign-up "At least 8 characters." helper via `supportingText`. The sign-in
"Forgot password?" link moved out of the `<label>` (a link nested in a label was
a minor a11y wart) into a sibling under the field. The submit was already
canonical (`primaryButtonClass('md')`, migrated in the CC-1 sweep) and the
`GoogleButton` stays as-is, per the plan. Form-level errors still surface through
the existing `<Alert>` (the page uses a single `error` state, not per-field
`fieldErrors`, so `TextField`'s `errors` prop is intentionally left unset).

#### V-4 — Anonymous users are funneled into host depth with no claim nudge · **P3** · ✅ resolved 2026-06-01

`/events/new` only guarded `if (!user)`
([events/new/page.tsx#L31-L33](../../apps/web/src/app/events/new/page.tsx#L31-L33)),
so an `is_anonymous` user was shown the full create-event form — and the home page
([page.tsx#L161](../../apps/web/src/app/page.tsx#L161)), events header
([events/page.tsx#L251](../../apps/web/src/app/events/page.tsx#L251)), and Host
nav dropdown all surface "Host an event" to them (the checks use `user`, which is
truthy for anon). Hosting needs a claimed account + Stripe payout to be useful,
so anon hosts hit a wall mid-form.

**Fix (done):** added a page-level gate to
[events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx) —
`if (isAnonymousUser(user)) redirect('/claim?next=/events/new')` — directly
mirroring the existing gate on
[teams/new/page.tsx](../../apps/web/src/app/teams/new/page.tsx). Because **every**
entry point named above funnels to `/events/new`, this single gate routes anon
users from all of them (home CTAs, events header, profile "Host an event" tile
[PR-6], the Host nav dropdown, and direct URLs) to the claim flow instead of the
bare form — matching the house convention, where `/teams/new`'s own entry CTAs
likewise link straight through and rely on the gate. The submit action
([events/new/actions.ts#L46](../../apps/web/src/app/events/new/actions.ts#L46))
already rejected anon as a backstop, so this is the matching UX gate.
_Known limitation (shared with `/teams/new`, pre-existing, not introduced here):
the claim email-confirmation flow redirects to `/reset-password?from=claim` and
does **not** propagate `?next=`, so the user isn't auto-returned to `/events/new`
after claiming — see Follow-ups._

---

### Player / attendee

#### P-1 — "Sign up as a guest" looks like three different features · **P2** · ✅ resolved 2026-06-01d

The everyday guest-RSVP action item was built two different ways depending on the
event's price model: the free-event form
([guest-signup-form.tsx](../../apps/web/src/app/events/[id]/guest-signup-form.tsx))
already used the CC-2 `field-styles.ts` recipe, but the paid-event checkout form
([paid-ticket-panel.tsx](../../apps/web/src/app/events/[id]/_components/paid-ticket-panel.tsx))
hand-rolled its own `border-border-base bg-background … px-3 py-2 text-sm` inputs
with `text-xs` labels and dropped the `autoComplete`/`maxLength` attributes —
same persona, same intent, two field treatments.
**Fixed (done):** extracted one
[GuestSignupFields](../../apps/web/src/app/events/[id]/_components/guest-signup-fields.tsx)
(name + email, `emailRequired` prop, optional per-field `errors`) consumed by both
panels, on the shared `field-styles.ts` recipe. The paid form picked up the
`autoComplete="name"`/`maxLength` it was missing for free; the free form's
`emailRequired={false}` keeps the "(optional — lets you claim this signup later)"
hint, the paid form's `emailRequired` keeps email required for the receipt. No
`'use client'` on the shared component (bare inputs + class strings), so the
client `GuestSignupForm` and the server `PaidTicketPanel` both render it; field
names (`display_name`/`email`) unchanged, so the server actions are untouched.
_The "login fallback" the original finding listed is the "Already have an account?
Sign in" link, not a third form — out of scope._

#### P-2 — "You're in" status pills use four ad-hoc color treatments · **P3** · ✅ resolved 2026-06-01h

The signup-confirmation pill was re-declared per panel (primary-tinted in
`rsvp-panel.tsx`; emerald/amber/primary variants in `paid-ticket-panel.tsx`) —
identical chassis, copy-pasted color. **Fixed (done):** extracted
[StatusPill](../../apps/web/src/components/status-pill.tsx) with a `tone` prop
(`primary` / `success` / `pending` / `neutral`), keeping the intentional
semantics (paid = green, pending = amber) in one place. `paid-ticket-panel.tsx`'s
`PAYMENT_PILL` map now carries a `tone` instead of a full `className`, and the
fallback "You're signed up" pill + the `rsvp-panel.tsx` pill both render
`<StatusPill>`. No `'use client'` on the component (pure `<span>`), so both
server panels render it directly. _The host-facing `PAYMENT_PILL` in
`host-ad-hoc-teams-panel.tsx` (extra `refunded` state + dynamic amount suffixes)
is a richer, separate pill — left as an optional follow-up; the new `neutral`
tone is there for it when wanted._

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

#### H-1 — The primary host edit form diverges from the design system · **P2** · ✅ resolved 2026-06-01f

The create/edit event form (the most important, most-used host surface) ran
entirely on the **local** [form-primitives.tsx](../../apps/web/src/app/events/new/_components/form-primitives.tsx)
— its own `inputClass`/`labelClass`/`SubmitButton` — a parallel design system.
**Resolved:** verified the convergence already landed across the earlier bundles
and confirmed it end-to-end — `form-primitives.tsx` now **re-exports**
`fieldInputClass`/`fieldLabelClass` from the shared
[field-styles.ts](../../apps/web/src/components/field-styles.ts) (CC-2,
2026-05-31b), so every create/edit-event section that imports `inputClass`/
`labelClass` from it is on the one canonical vocabulary; its `SubmitButton` uses
`primaryButtonClass('md')` (CC-1, 2026-05-31). The remaining local controls
(`SegmentedControl`, `TypeCard`) are genuine custom widgets, not field/button
vocabulary drift, so they're correctly left local. No code change needed this
pass — status flipped after verification.

#### H-2 — Divisions manager is the densest action-item offender · **P2**

[host-divisions-manager.tsx](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx)
stacked four of the issues above in one component: a 5th local `inputClass`
(CC-2), inline 16-field expand (CC-5), `window.confirm` (CC-4), and Edit/Remove
rendered as bare `text-primary`/`text-red-600` text links that fell below the
44px M3/AA tap target and gave the destructive Remove the same visual weight as
Edit. **Resolved (done):** all four are now closed —

- **CC-2 (5th `inputClass`)** ✅ 2026-05-31b (re-exports `field-styles.ts`).
- **CC-4 (`window.confirm`)** ✅ 2026-05-31b (`ConfirmSubmitButton`).
- **CC-5 (inline expand)** ✅ 2026-06-01f — Edit + "+ Add division" now open the
  `DivisionForm` in a `FormModal` (see CC-5 above).
- **Row actions** ✅ 2026-06-01f — **Edit** is now `secondaryButtonClass('sm')` +
  `tap-target` (a 48px outlined affordance, the prominent row action); **Remove**
  is a borderless red `state-layer` + `tap-target` button — demoted (no
  border/fill) so it no longer carries Edit's weight, but still ≥44px. The
  modal's own Cancel/Submit went to `secondaryButtonClass('md')` /
  `primaryButtonClass('md')` via `ModalActions`.

#### H-3 — Row-level action items sit below tap-target across host lists · **P3** · ◑ mostly 2026-06-01k

The `text-link` / tiny-bordered action pattern (`text-primary hover:underline` or
`px-2 py-1 text-xs` ≈ 24px) recurs in host management lists and misses the 44px
target. Cross-ref [accessibility.md](accessibility.md). **Fix:** standardize row
actions on the button vocabulary + the `tap-target` utility (Bundle 130).
**Progress:**

- **Divisions** rows ✅ 2026-06-01f (via H-2).
- **Group manage-members** rows ✅ 2026-06-01k —
  [member-row-item.tsx](../../apps/web/src/app/groups/[id]/members/_components/member-row-item.tsx)
  role toggles → `neutralButtonClass('sm') + tap-target`, Remove →
  `errorOutlinedButtonClass('sm') + tap-target` (was `px-2 py-1 text-xs` ≈ 24px).
- **Profile/group viewer-action clusters** ✅ canonicalized 2026-06-01k —
  [player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx)
  - [group-viewer-actions.tsx](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx)
    routed to `primaryButtonClass` / `neutralButtonClass` / `secondaryButtonClass`
    (this also fixed 3 CC-1 `hover:opacity-90` misses — see new finding below).
    _tap-target intentionally **not** added to these — they're profile-header CTA
    clusters sharing a row with `ShareLink`, and the 32px `sm` height is the
    app-wide sm-button question tracked in accessibility.md, not a tiny-row offender._
- **`members-section.tsx`**: its only row affordance is the member **card link**
  (a full-row `flex … p-2` link, already > 44px tall), not a sub-tap-target
  button — nothing to change.

**Remaining:** the same neutral row-action pattern in other lists
(`attendee-list`, `friends-list`, `my-teams-panel`, `invite-response`,
`extra-members-form`) — now a safe mechanical pass with `neutralButtonClass`
available (folds into the secondary-convergence item).

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

### 2026-05-31c — CC-2 ratchet (lock the convergence)

- **CC-2 ratchet — shipped.** Added two `no-restricted-syntax` selectors to the
  existing block in [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs)
  (alongside the M3 shape-scale ratchet): a `VariableDeclarator` named
  `^(input|label|select)Class$` with a string- **or** template-**literal** RHS is
  now an error, pointing authors at `@/components/field-styles` / `TextField`. The
  literal-RHS check means the `form-primitives.tsx` re-exports (Identifier RHS) and
  `field-styles.ts` itself (different names) are not flagged. The two documented
  exceptions opt out with `// eslint-disable-next-line no-restricted-syntax -- …`
  - a reason ([event-filter-form](../../apps/web/src/app/events/_components/event-filter-form.tsx),
    [match-row](../../apps/web/src/app/events/[id]/schedule/_components/match-row.tsx)).
    Verified the rule both passes the converged tree and fires on a hand-rolled
    probe. This closes the "without a ratchet the 17→1 collapse re-accumulates" risk
    — same strategy as m3-alignment.md's shape-scale lock.

### 2026-05-31d — CC-1 sweep + button ratchet (close the button drift)

- **CC-1 — fixed (all 47 remaining files).** An exact-string codemod
  (`/tmp/cc1-codemod.mjs`, mapping each hand-rolled class string → `primaryButtonClass('sm'|'md')`
  - preserved layout extras like `w-full` / `shrink-0` / `text-center`) migrated
    the 59 remaining `bg-primary hover:bg-primary/90 … text-white` buttons across 47
    files to the canonical filled button: every form submit (`SubmitBtn`/`SubmitButton`
    in the converged forms), error pages, marketing/nav (`site-header` sign-up pill,
    `mobile-menu`, `pricing`, `community`, `profile/billing/pro`), and event panels
    (`event-hero`, `tip-jar`, `event-sticky-cta`, RSVP/team panels, broadcast panels).
    Manual fixes after the codemod: `event-filter-form.tsx` (codemod inserted the
    import inside a multi-line first import — moved it out) and `community/page.tsx`
    (height-matched "Apply" filter button → `` `${primaryButtonClass('sm')} h-[34px]` ``).
    `primaryButtonClass` adoption: 11 → **61 files**; `hover:bg-primary/90`
    occurrences: 68 → **0**.
- **CC-1 ratchet — shipped.** Two more `no-restricted-syntax` selectors in
  [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs)
  (`Literal` / `TemplateElement` matching `hover:bg-primary/90`) make the old
  recipe a lint error — no exceptions, since the sweep hit zero. Verified clean
  tree passes + probe fires. AGENTS.md pattern 11 already covers the convention.

### 2026-06-01 — V-4 anon→claim host gate

- **V-4 — fixed.** [events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx)
  now gates anonymous users with
  `if (isAnonymousUser(user)) redirect('/claim?next=/events/new')`, directly
  mirroring the existing gate on
  [teams/new/page.tsx](../../apps/web/src/app/teams/new/page.tsx). Because every
  host entry point (home CTAs, events header, profile "Host an event" tile [PR-6],
  the Host nav dropdown, direct URLs) funnels to `/events/new`, this single
  page-level gate routes anon users from all of them to the claim flow — matching
  the house convention, where `/teams/new`'s own entry CTAs link straight through
  and rely on the gate. The submit action already rejected anon as a backstop.
  Closes the profile-hub audit's **PR-6** and the home audit's **H-5** cross-refs.
  Journal:
  [2026-06-01-anon-host-gate.md](../journal/2026-06-01-anon-host-gate.md).

### 2026-06-01b — `/pricing` secondary/outlined-button convergence

First bite of the standing **secondary/outlined-button** backlog item (the
`border-border-base hover:bg-fg/5` / hand-rolled `border-primary … text-primary`
patterns → `secondaryButtonClass`). Scoped to `/pricing` because it's a
high-intent visitor→host conversion surface where the Free-vs-Pro CTA hierarchy
should read as a clean M3 **Filled (recommended) vs. Outlined (alternative)**
pair, and its CTAs were still three different hand-rolled recipes after the CC-1
filled-button sweep.

- **Fixed (4 CTAs) in
  [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx).** All
  medium-emphasis / alternative actions now route through
  `secondaryButtonClass('md')`:
  - Free-tier **"Host a free event"** — was the neutral
    `border-border-base bg-surface hover:bg-fg/5 … font-medium` recipe; now the
    canonical outlined button (`+ w-full`). Reads as the deliberate
    lower-emphasis alternative to the Pro card's Filled CTA.
  - Active-subscriber **"Manage subscription ↗"** (`OpenInNewTabButton`) — same
    neutral recipe → `secondaryButtonClass('md') + w-full`.
  - Trial **monthly** submit — was a 4th forked outlined recipe
    (`border-primary bg-surface text-primary hover:bg-primary/10 …`, its own
    `disabled:opacity-60`) → `secondaryButtonClass('md') + w-full`; the
    **yearly** submit stays `primaryButtonClass('md')` (Filled), preserving the
    intentional "save $20/yr" nudge toward the Filled option.
- **Layout bug fixed alongside.** The monthly `<form>` carried a vestigial
  `grid grid-cols-1 gap-2 sm:grid-cols-2` with a single child, so the monthly
  button rendered **half-width on ≥sm** while the yearly button below it was
  full-width — an asymmetric stack. Dropped the grid; both trial CTAs now stack
  full-width and aligned. Verify chain green (typecheck / lint / 125 web tests /
  build).

_Not converted (intentional): the Pro card's signed-out / anon CTAs were already
`primaryButtonClass('md')` (correct — they're the card's headline action); the
comparison-table and FAQ have no buttons._

### 2026-06-01c — V-3 login-page field primitives

- **V-3 (P2) — fixed.** [login/page.tsx](../../apps/web/src/app/login/page.tsx)
  email + password inputs migrated from the hand-rolled
  `border-border-base mt-1 w-full rounded-md border px-3 py-2` recipe to the
  [TextField](../../apps/web/src/components/text-field.tsx) primitive. Wins: the
  chassis now wires `htmlFor`/`id` (the bare `<label><span>` pattern had none),
  paints the M3 focus ring, and renders the sign-up length hint through
  `supportingText` (spread conditionally per `exactOptionalPropertyTypes`). The
  sign-in "Forgot password?" link moved out of the `<label>` into a sibling under
  the field. The submit button was already `primaryButtonClass('md')` (CC-1
  sweep), so this pass was inputs-only. Verify chain green (typecheck / lint /
  625 tests / build). This leaves **P-1** (`GuestSignupFields`) as the last
  field-vocabulary P2 — login was the higher-intent surface, so it went first.

### 2026-06-01d — P-1 shared `GuestSignupFields`

- **P-1 (P2) — fixed.** Extracted
  [GuestSignupFields](../../apps/web/src/app/events/[id]/_components/guest-signup-fields.tsx)
  — the name + email pair shared by the free guest-RSVP form
  ([guest-signup-form.tsx](../../apps/web/src/app/events/[id]/guest-signup-form.tsx))
  and the paid guest-checkout form inside
  [paid-ticket-panel.tsx](../../apps/web/src/app/events/[id]/_components/paid-ticket-panel.tsx).
  The paid form was the offender (its own `bg-background … text-sm` inputs,
  `text-xs` labels, missing `autoComplete`/`maxLength`); both now share the CC-2
  `field-styles.ts` recipe. The component takes `emailRequired` (paid = required
  for the receipt; free = optional + claim-later hint) and an optional per-field
  `errors` map (the free panel's `useFormState`; the paid redirect-to-Stripe flow
  passes none). Deliberately no `'use client'` so it drops into both the client
  form and the server panel; the posted field names are unchanged so
  `guest-actions.ts` / `checkout-actions.ts` are untouched. Net: removed ~30 lines
  of forked markup and a local `<Err>` helper. Verify chain green (typecheck /
  lint / 625 tests / build). Closes the last field-vocabulary P2 — the remaining
  P2s (V-2 header pills, H-1/H-2 host-form depth) are button- or layout-shaped,
  not field-vocabulary.

### 2026-06-01e — V-2 header + mobile-drawer auth cluster

- **V-2 (P2) — fixed.** Converged the signup-funnel auth cluster onto the
  canonical button vocabulary, closing the last of V-2:
  - **Sign in / Sign up** is now the M3 **Outlined + Filled** pair on both
    [site-header.tsx](../../apps/web/src/components/site-header.tsx) (desktop
    `secondaryButtonClass('sm')` + `primaryButtonClass('sm')`) and
    [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx) (drawer
    `secondaryButtonClass('md')` + `primaryButtonClass('md')`). Desktop "Sign in"
    was a bare nav text-link; the mobile one was a hand-rolled neutral-outlined
    button — they now match each other and the rest of the app.
  - The anon **"Finish creating your account"** claim nudge (the last hand-rolled
    recipe in the desktop cluster) moved from a bordered tonal recipe to
    `tonalButtonClass('sm')` (M3 Filled-tonal) — medium emphasis, sits cleanly
    beside the Filled "Sign up" without competing.
    Verify chain green (typecheck / lint / 625 tests / build). With V-2 done, the
    signup-funnel button drift (V-1 dead link, V-2 entry-point divergence) is fully
    closed; the only remaining P2s are the **host-form** items (H-1/H-2).

### 2026-06-01f — H-1 verified done + H-2/CC-5 divisions-manager FormModal

The host-form P2s. Together with V-2 (2026-06-01e) this clears the **last
remaining P2s** in the audit.

- **H-1 (P2) — verified done, status flipped.** The create/edit-event form's
  field + submit convergence had already landed across earlier bundles
  ([form-primitives.tsx](../../apps/web/src/app/events/new/_components/form-primitives.tsx)
  re-exports `field-styles.ts` per CC-2; `SubmitButton` uses `primaryButtonClass`
  per CC-1). Confirmed end-to-end; the only local controls left
  (`SegmentedControl`, `TypeCard`) are genuine custom widgets, not vocabulary
  drift. No code change — flipped after verification.
- **H-2 + CC-5 (P2 + P3) — fixed.** Rewrote
  [host-divisions-manager.tsx](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx):
  - **CC-5 / FormModal:** the inline 16-field `DivisionForm` (per-row Edit **and**
    "+ Add division") now opens inside `FormModal` (`size="lg"`), with
    `CloseOnSettled` closing it when the server action settles and `ModalActions`
    owning the Cancel/Submit row. The `editingId`/`adding` `useState` machine is
    gone — Radix owns each modal's open state. This kills the "inline disclosure
    shoves the page around" problem, matching the walk-in team form pattern.
  - **Row-action tap targets (H-2/H-3):** **Edit** → `secondaryButtonClass('sm')`
    - `tap-target` (48px outlined, the prominent action); **Remove** → a
      borderless red `state-layer` + `tap-target` button — demoted (no border/fill)
      but still ≥44px, keeping its destructive red. "+ Add division" →
      `secondaryButtonClass('md')`.
  - **Form buttons:** the modal's Cancel/Submit moved from hand-rolled recipes to
    `secondaryButtonClass('md')` / `primaryButtonClass('md')`.
  - The action bindings are unchanged (`addDivisionFromForm` /
    `updateDivisionFromForm` / `removeDivision`, all already `revalidatePath`), so
    `division-actions.ts` is untouched.
    Verify chain green (typecheck / lint / 625 tests / build).
- **H-3 (P3) — partial.** Divisions rows done above; the same row-action pattern
  in the group/team member rows remains (see H-3).

With H-1/H-2 closed, **all P2s in this audit are resolved.** What's left is the
P3 backlog below.

### 2026-06-01g — `errorButtonClass` primitive + filled-destructive adoption

First P3 after the P2 closeout. The "rule of three" had fired — the destructive
filled recipe `bg-red-600 … text-white hover:bg-red-700` was hand-rolled in 6+
places (`ConfirmSubmitButton`'s confirm + four danger-zone panels), so the
primitive earned its place.

- **`errorButtonClass(size)` added** to
  [primary-button.tsx](../../apps/web/src/components/primary-button.tsx) —
  mirrors `primaryButtonClass` (same `SIZING`/`BASE`/state-layer/lift) but uses
  the M3 **`error` role tokens** `bg-md-error` / `text-md-on-error` instead of a
  hardcoded `bg-red-600 text-white`. **Why tokens, not literals:** the role
  tokens are already defined for both themes
  ([globals.css](../../apps/web/src/app/globals.css)), so the button now tracks
  dark mode — where M3 flips error to a light container with a dark label —
  rather than staying a fixed dark-red/white that ignored the theme. (Worth an
  eyeball in dark mode: the filled error button is intentionally lighter there,
  per M3.)
- **Adopted in the 5 filled-destructive call sites:**
  [confirm-submit-button.tsx](../../apps/web/src/components/confirm-submit-button.tsx)
  (destructive confirm — the audit's named target),
  [delete-group-panel.tsx](../../apps/web/src/app/groups/[id]/edit/delete-group-panel.tsx),
  [delete-team-panel.tsx](../../apps/web/src/app/teams/[id]/_components/delete-team-panel.tsx),
  [cancel-event-panel.tsx](../../apps/web/src/app/events/[id]/edit/cancel-event-panel.tsx),
  [account/delete/page.tsx](../../apps/web/src/app/profile/account/delete/page.tsx).
  Verify chain green (typecheck / lint / 625 tests / build).
- **Deliberately not migrated (different shape, follow-up):** text-red
  (divisions Remove, group/team member rows), outlined-red (host-ad-hoc "Remove
  team", community report buttons), and the compact `board-view.tsx` reset. Those
  want a `textButtonClass`/`secondaryButtonClass`-style **error** variant, not the
  Filled one — a small follow-up once a second destructive shape is actually
  needed twice. No `no-restricted-syntax` ratchet on `bg-red-600` this pass: the
  token appears legitimately on alert **containers** (`bg-red-50` etc.), so a
  naive ratchet would false-positive; revisit if filled-destructive drift recurs.

### 2026-06-01h — P-2 StatusPill + secondary-convergence re-scope

- **P-2 (P3) — fixed.** Extracted
  [StatusPill](../../apps/web/src/components/status-pill.tsx) (`tone`:
  `primary`/`success`/`pending`/`neutral`); the four ad-hoc pills in
  `rsvp-panel.tsx` + `paid-ticket-panel.tsx` now render it (`PAYMENT_PILL` maps
  to a `tone`, not a `className`). Verify chain green (typecheck / lint / 625
  tests / build).
- **Secondary/outlined-button convergence — re-scoped, NOT swept.** Re-measured
  `grep -rn "hover:bg-fg/5" … | grep border` → **84** occurrences, not the ~30
  estimated, and the set is **heterogeneous**: it mixes genuine secondary
  buttons (Sign out, "Go home", Cancel) with **non-buttons that must stay
  neutral** — card-style clickable rows (`flex … border p-3`: `members-section`,
  `event-media-link`, `brackets/page`, `video-embed`), radio-card `<label>`s
  (`profile-form.tsx`), the Google sign-in button (deliberate neutral branding),
  and dashed toggle/add chips (`templates-section`, `setup-view`). A blanket
  `→ secondaryButtonClass` (which is **primary-tinted**: `border-primary
text-primary`) would wrongly recolor all of those. **Decision:** this is not a
  mechanical sweep — it needs a curated pass that first separates "secondary
  action button" from "neutral surface/affordance," and likely a _neutral_
  outlined recipe for the latter rather than forcing everything to the
  primary-tinted Outlined. Re-graded with that scope below; `/pricing`
  (2026-06-01b) remains the one done slice where the primary-tint was correct.

### 2026-06-01i — text + outlined error button variants

Completes the destructive-button family started by `errorButtonClass` (Filled,
2026-06-01g). Both new variants mirror an existing one but on the M3 `error` role
token, so destructive actions now have a canonical home at every emphasis level:

- **`errorOutlinedButtonClass(size)`** (mirrors `secondaryButtonClass`) and
  **`errorTextButtonClass(size)`** (mirrors `textButtonClass`) added to
  [primary-button.tsx](../../apps/web/src/components/primary-button.tsx)
  (`border-md-error`/`text-md-error`).
- **Adopted (clean fits):**
  - **Text:** the divisions **Remove**
    ([host-divisions-manager.tsx](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx))
    — was the hand-rolled `text-red-600` left behind in 2026-06-01f → now
    `errorTextButtonClass('sm') + tap-target`.
  - **Outlined:** the danger-zone **"Delete group…" / "Delete team…"** triggers
    ([delete-group-panel.tsx](../../apps/web/src/app/groups/[id]/edit/delete-group-panel.tsx),
    [delete-team-panel.tsx](../../apps/web/src/app/teams/[id]/_components/delete-team-panel.tsx))
    — were hand-rolled `border-red-300 bg-white … dark:…` recipes → now
    `errorOutlinedButtonClass('sm')`, replacing the bespoke dark-mode variants
    with token theming. (The Filled "Yes, delete" confirm they reveal is
    `errorButtonClass` from 2026-06-01g — clean Outlined→Filled escalation.)
  - Verify chain green (typecheck / lint / 625 tests / build).
- **Deliberately not migrated (documented):** the host-ad-hoc "Remove team"
  button (dense `text-xs` row — would mismatch its neutral `text-xs` siblings;
  needs an `xs` size we don't have), the community **report** buttons (tinted
  `bg-red-50` + bespoke dark variants — a _tonal_-error look, not outlined), and
  the group/team **member-row** removes (neutral border, red **on hover** only —
  a softer treatment that belongs to the H-3 curated pass). A `errorTonalButtonClass`
  is the remaining gap if the tinted report buttons ever want converging.

### 2026-06-01j — CC-3 `text-white`→token (re-measure + clear the last 5)

- **CC-3 (P3) — fixed.** Re-measured (the drift table still said 64): `text-white`
  is down to **26 total**, only **5** on `bg-primary` (the real
  `text-primary-fg`-token violation). Fixed all 5:
  - [free-agent-signup-panel.tsx](../../apps/web/src/app/events/[id]/_components/free-agent-signup-panel.tsx)
    SubmitButton — a hand-rolled `bg-primary … text-white hover:opacity-90`
    primary button the CC-1 ratchet missed (it forbids `hover:bg-primary/90`, not
    `hover:opacity-90`) → `primaryButtonClass('md')`.
  - [auth-mode-tabs.tsx](../../apps/web/src/app/login/_components/auth-mode-tabs.tsx)
    active tab + [messages-nav-link.tsx](../../apps/web/src/components/messages-nav-link.tsx)
    / [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)
    count badges → `text-primary-fg` (pure token swap, no visual change on the
    current palette, dark-mode-safe).
    `bg-primary`+`text-white` is now **0**; drift table updated. The remaining ~21
    `text-white` are correct on amber/emerald/red/violet badges. _Ratchet note: a
    `no-restricted-syntax` rule can't cleanly catch `bg-primary`+`text-white` (they
    arrive as separate tokens / template literals), so no ratchet added; the
    free-agent miss shows the `hover:opacity-90` escape hatch is the more likely
    future regression vector than `text-white` itself._

### 2026-06-01k — H-3 member rows + `neutralButtonClass` (the missing variant)

The secondary-convergence re-scope (2026-06-01h) concluded the ~84 neutral
`border-border-base hover:bg-fg/5` buttons need a **neutral** canonical home, not
the primary-tinted `secondaryButtonClass`. Built it and used it to clear H-3's
member rows.

- **`neutralButtonClass(size)` added** to
  [primary-button.tsx](../../apps/web/src/components/primary-button.tsx) — M3
  outlined-neutral (`border-border-base text-fg bg-transparent` + state-layer),
  deliberately matching the existing look so converging onto it is a
  no-visual-change dedup. This unblocks the broader secondary-convergence sweep.
- **H-3 group manage-members rows** ([member-row-item.tsx](../../apps/web/src/app/groups/[id]/members/_components/member-row-item.tsx)):
  role toggles → `neutralButtonClass('sm') + tap-target`; Remove →
  `errorOutlinedButtonClass('sm') + tap-target` (was `px-2 py-1 text-xs` ≈ 24px,
  now ≥44px).
- **Profile/group viewer-action clusters** canonicalized
  ([player-viewer-actions.tsx](../../apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx),
  [group-viewer-actions.tsx](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx)):
  neutral buttons → `neutralButtonClass`, "Host an event" → `secondaryButtonClass`,
  and **3 CC-1 `hover:opacity-90` misses** → `primaryButtonClass` (see CC-6).
- **Discovered CC-6** — 17 more `hover:opacity-90` hand-rolled primary buttons the
  CC-1 ratchet doesn't catch (logged as a new finding; sweep deferred).
- Verify chain green (typecheck / lint / 625 tests / build). Scoped adoption of
  `neutralButtonClass` to the H-3 surfaces only this pass — the full ~80-site
  convergence is now a safe mechanical follow-up.

### Standing backlog (graded above, not yet done)

- **P2: none remaining.** _All resolved: H-1/H-2 (host form depth +
  divisions-manager FormModal) 2026-06-01f; V-2 (header/mobile auth cluster)
  2026-06-01e; P-1 (shared `GuestSignupFields`) 2026-06-01d; V-3 (login field
  primitives) 2026-06-01c; CC-1 + CC-2 + CC-4 2026-05-31b–d — both the field and
  primary-button vocabularies are now ratchet-locked._
- **P3:** H-3 (row-action tap targets — **divisions + group manage-members +
  viewer-action clusters done 2026-06-01f/k**; other lists — `attendee-list`,
  `friends-list`, `my-teams-panel`, `invite-response`, `extra-members-form` —
  remain, now a safe `neutralButtonClass + tap-target` pass);
  **CC-6** (CC-1 `hover:opacity-90` ratchet blind spot — **17 hand-rolled primary
  buttons** still live; codemod + extend ratchet);
  secondary/outlined-button convergence (**re-scoped 2026-06-01h; unblocked
  2026-06-01k** — `neutralButtonClass` now exists, so the curated sweep is
  neutral→`neutralButtonClass` (no-visual-change) + genuine secondary actions →
  `secondaryButtonClass`; **`/pricing` done 2026-06-01b**, H-3 surfaces done
  2026-06-01k, ~75 sites remain). _Error-button family complete 2026-06-01g/i;
  the only remaining destructive gap is an `errorTonalButtonClass` for the tinted
  community report buttons. P-2 (StatusPill) resolved 2026-06-01h; CC-5 (FormModal
  conversion) resolved 2026-06-01f._
- **Error-button family** ✅ **complete 2026-06-01g/i.**
  [primary-button.tsx](../../apps/web/src/components/primary-button.tsx) now
  exports `errorButtonClass` (Filled, 2026-06-01g — 5 adopters),
  `errorOutlinedButtonClass` (2026-06-01i — the two danger-zone delete triggers),
  and `errorTextButtonClass` (2026-06-01i — the divisions Remove), all on the M3
  `error` role token, mirroring `primaryButtonClass` / `secondaryButtonClass` /
  `textButtonClass`. _Remaining destructive shapes left as documented
  non-migrations: an `errorTonalButtonClass` for the tinted community **report**
  buttons (`bg-red-50` + dark variants); the host-ad-hoc "Remove team" (dense
  `text-xs` row, needs an `xs` size); the member-row red-**on-hover** removes
  (H-3); and the compact `bg-red-600` in `board-view.tsx`._
- **Claim `?next=` propagation (P3, pre-existing, surfaced by V-4):** the claim
  email-confirmation flow ([claim/actions.ts#L88-L90](../../apps/web/src/app/claim/actions.ts#L88-L90))
  hardcodes the post-confirmation redirect to `/reset-password?from=claim` and
  drops the `?next=` from the `/claim` URL, so neither the V-4 host gate nor the
  `/teams/new` gate auto-returns the user to where they were headed. Thread `next`
  through `emailRedirectTo` (and `/auth/callback`) to honor it. Affects both gates.

---

## How to re-run this audit

1. Re-measure the drift table: `grep -rn "hover:bg-primary/90" apps/web/src`,
   `grep -rn "inputClass =" apps/web/src`, `grep -rcn "text-white" apps/web/src`,
   vs `grep -rln "primaryButtonClass" apps/web/src` and `<TextField`.
2. Walk one screen per persona row in the table above and ask: is the primary
   action obvious, is it styled like the same action elsewhere, and does the edit
   form match the others?
3. Update the drift counts + this log; flip the README index row date.
