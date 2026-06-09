# Create-Event Page UX Audit

_Last updated: 2026-06-09_

Audit of the host-facing create flow at
[apps/web/src/app/events/new/](../../apps/web/src/app/events/new/) — the page
([page.tsx](../../apps/web/src/app/events/new/page.tsx)), the client form
([new-event-form.tsx](../../apps/web/src/app/events/new/new-event-form.tsx)),
its `_components/` sections, and the server action
([actions.ts](../../apps/web/src/app/events/new/actions.ts)).

Goal (per the request that kicked this off): keep the **common case** —
a free open-play pickup night — fast and obvious, while preserving the
**advanced controls** (multi-division tournaments, leagues, off-platform
registration, per-division pricing, templates) for power hosts. Find bugs,
gaps, streamlining opportunities, and stale code.

> **Status (2026-06-09 — remediation bundle 1 shipped, quad-green, uncommitted):**
> First dedicated pass on this surface. The form is in good shape overall — the
> type-driven section reshaping is clean, the sticky CTA + echo-on-error +
> `useAlertReveal` plumbing is solid, and the anon-gate (persona-ux V-4) already
> landed. Findings **CE-1 … CE-13**: **0 P1 · 3 P2 · 10 P3.**
>
> **Bundle 1 fixed the 3 P2s + 4 cheap P3s — CE-1, CE-2, CE-3, CE-5, CE-6, CE-7,
> CE-13** (see remediation log below). **Bundle 2 closed CE-1's deferred
> follow-up** — saved templates now round-trip the `AdvancedDetailsPanel` fields
> (venue / series / fundraiser / theme tags / sanctioning), so template apply is
> fully complete. **Remaining open: CE-4, CE-8, CE-9, CE-10, CE-11, CE-12** —
> all P3, deferred (a11y roving-tabindex, skill-tier grouping, create-time photo,
> contextual cap banner, by-position edit parity, required-field markers).
> Cross-refs: persona-ux V-4 (anon gate) and CC-1 (submit button) already closed;
> this audit does not re-open them.

## Remediation log — 2026-06-09 (bundle 2)

Quad-green, uncommitted. **Closes the CE-1 deferred follow-up: advanced-detail
fields now round-trip through templates.**

The create form renders `AdvancedDetailsPanel` with `hideExternal` and
previously passed it **no `initial`**, so applying a saved template restored the
top-level + division fields (bundle 1) but left venue / series / fundraiser /
theme tags / sanctioning blank — even though `toPayload` already captured them.
[visibility-section.tsx](../../apps/web/src/app/events/new/_components/visibility-section.tsx)
now maps `templateValues → AdvancedDetailsInitial` via a local
`advancedInitialFromValues()` and passes it as `initial` (spread so a
template-less mount stays `undefined` → panel closed/blank). The panel
auto-opens (`hasInitialAdvanced`) when a template carried any of these, so the
host sees what was prefilled.

- **One-off dates stay excluded.** `registrationClosesAt` is in
  `TEMPLATE_OMIT_FIELDS` (alongside `startsAt` / `endsAt`), so it's never saved
  and the mapper leaves it blank — applying a template never resurfaces a past
  deadline.
- **External registration was already covered** — it round-trips via the parent
  form's `isExternal` state + `ExternalFields`' `val(values, …)` defaults, not
  this panel, so `hideExternal` is untouched.
- **Edit form unaffected** — it passes its own `initial.extensions`; this mapper
  is create-only.

With this, template apply on the create form is complete: type, basics,
when/where, divisions, pricing, **and** advanced details all restore.

## Remediation log — 2026-06-09 (bundle 1)

Quad-green (`pnpm typecheck && lint && test && build`), uncommitted. **CE-1,
CE-2, CE-3, CE-5, CE-6, CE-7, CE-13.**

- **CE-1 — templates now round-trip divisions and stop capturing one-off
  fields.** `toPayload` excludes `title` / `startsAt` / `endsAt` /
  `registrationClosesAt` via a `TEMPLATE_OMIT_FIELDS` set
  ([template-actions.ts](../../apps/web/src/app/events/new/template-actions.ts)),
  so applying a template no longer re-seeds a stale title or a past date.
  `DivisionsRepeater` gained an `initialValues` prop + a module-level
  `rowsFromValues()` (the inverse of the server's `div_${i}_*` parse) and an
  exported `anyDivisionPaidFromValues()`; the rows + `nextKey` initializers seed
  from it, and `FormatSection` passes `values` down + seeds its
  `hasPaidDivision` state from the same helper (no mount-effect — respects
  AGENTS pattern 5)
  ([divisions-repeater.tsx](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx),
  [format-section.tsx](../../apps/web/src/app/events/new/_components/format-section.tsx)).
  Echo-on-error is unaffected (the form doesn't remount on error, so client rows
  still survive; `initialValues` is only read on mount).
- **CE-2 — partial-create failures now roll back.** The "Host as group" update
  and the tournament/league payment-settings update both `events.delete(result.id)`
  on failure and return a "Nothing was created — please try again" error,
  matching the existing open-play pricing rollback
  ([actions.ts](../../apps/web/src/app/events/new/actions.ts)). No more orphaned
  event / duplicate-resubmit path.
- **CE-3 — type cards show a keyboard focus ring** via
  `has-focus-visible:ring-2 has-focus-visible:ring-primary/70` on the `TypeCard`
  label
  ([form-primitives.tsx](../../apps/web/src/app/events/new/_components/form-primitives.tsx)).
- **CE-5 — dead `div_${i}_present` hidden input removed.**
- **CE-6 — `useState(requireAtLeastOne ? 1 : 1)` collapsed** into the seeded
  `nextKey` initializer (same edit as CE-1).
- **CE-7 — payment markup de-duplicated.** Extracted `OffPlatformToggle`,
  `PaymentInstructionsField`, `AbsorbServiceFeeCheckbox`, and
  `PassProcessingFeeCheckbox` leaves in
  [payment-fields.tsx](../../apps/web/src/app/events/new/_components/payment-fields.tsx);
  both `PricingSubsection` and `PaymentSettingsSubsection` consume them (each
  keeps its own layout wrappers). ~80 duplicated lines collapsed.
- **CE-13 — the "Host as" select renders only when `hostableGroups.length > 0`**
  ([basics-section.tsx](../../apps/web/src/app/events/new/_components/basics-section.tsx)).

**Deferred follow-up surfaced during the bundle:** the create form's
`AdvancedDetailsPanel` (venue / series / fundraiser / theme tags / sanctioning)
takes no `initial`, so templates never round-tripped those fields either —
pre-existing, out of CE-1's scope. **→ Closed in bundle 2** (see above).
Separately, CE-7's edit-form duplication of the same fee checkboxes was left
as-is (different `pricingLocked` disabled states + copy) — still deferred.

## Findings (CE-1 … CE-13)

| ID    | Sev | Status   | Theme            | One-line                                                                                              |
| ----- | --- | -------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| CE-1  | P2  | ✅ fixed | Bug / power-host | Applying a saved template silently drops all divisions; templates also over-capture title + date.     |
| CE-2  | P2  | ✅ fixed | Bug / data       | Two post-create update failures leave an orphaned event with no rollback → duplicate-create risk.     |
| CE-7  | P2  | ✅ fixed | DRY              | `PricingSubsection` ↔ `PaymentSettingsSubsection` duplicate ~80 lines of payment markup.              |
| CE-3  | P3  | ✅ fixed | A11y             | Event-type cards hide the radio `sr-only` and never show a keyboard focus ring (WCAG 2.4.7).          |
| CE-4  | P3  | open     | A11y             | `SegmentedControl` announces `role=radiogroup`/`radio` but has no roving tabindex / arrow keys.       |
| CE-5  | P3  | ✅ fixed | Stale code       | `div_${i}_present` hidden input is emitted per row but never read by the server action.               |
| CE-6  | P3  | ✅ fixed | Stale code       | `useState(requireAtLeastOne ? 1 : 1)` — both ternary branches are `1`.                                |
| CE-8  | P3  | open     | Consistency      | Per-division skill-tier select is a flat 7-option list; open-play uses the grouped `SkillTierSelect`. |
| CE-9  | P3  | open     | Gap / streamline | No hero-image upload at create time — host must create, then go to `/edit` to add a photo.            |
| CE-10 | P3  | open     | Streamline       | `atPaidEventCap` banner greets every capped free host, even one creating a free event.                |
| CE-11 | P3  | open     | Gap (parity)     | "By position" capacity + position roster are create-only; edit can't reach or tune them.              |
| CE-12 | P3  | open     | Clarity          | Required fields (title, address, dates) carry no required marker; only optional ones are labeled.     |
| CE-13 | P3  | ✅ fixed | Streamline       | "Host as" select renders a useless single-option dropdown when the host manages zero groups.          |

---

## CE-1 — Templates silently drop divisions and over-capture one-off fields · P2

**Where:**
[divisions-repeater.tsx#L136-L137](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx#L136-L137)
(no seeding path) and
[template-actions.ts#L16-L25](../../apps/web/src/app/events/new/template-actions.ts#L16-L25)
(`toPayload`).

Templates are the marquee power-host convenience, and they're broken for the
exact hosts who'd use them — tournament/league organizers. Two problems:

1. **Divisions don't round-trip.** Applying a template navigates to
   `?template=<id>`, which re-seeds `useFormState`'s initial `values` and
   remounts the form (the `key` in
   [page.tsx#L110-L125](../../apps/web/src/app/events/new/page.tsx#L110-L125)).
   Top-level fields restore via `val(values, …)`, but `DivisionsRepeater`
   initializes from `useState(() => requireAtLeastOne ? [newRow(0)] : [])` and
   has **no `values`/`initialRows` prop** — so a saved tournament with 4
   divisions applies as the top-level fields plus **one blank division row**.
   The `div_*` keys are sitting in `templateValues`, unread.
2. **The snapshot over-captures.** `toPayload` copies _every_ string field,
   including `title`, `startsAt`, and `endsAt`. Applying a template therefore
   re-seeds a stale title and a **past start date** — the opposite of a
   reusable setup.

**Fix:** (a) give `DivisionsRepeater` an optional `initialRows` prop and parse
the `div_${i}_*` keys out of `templateValues` (the server action already knows
this shape — mirror its parse) to seed rows on apply; (b) in `toPayload`,
exclude `title`, `startsAt`, `endsAt` (and arguably `description`) so a
template captures format/pricing/location/divisions, not one-off specifics.
The same `initialRows` path also future-proofs echo-on-error if the repeater
ever remounts.

> Note: echo-on-error for divisions currently _works by accident_ — on a failed
> submit the form does **not** remount (only `state` updates), so the
> repeater's client rows survive. The bug is specific to the template-apply
> remount. Don't "fix" echo-on-error by removing the remount `key`; fix the
> seeding.

## CE-2 — Partial post-create failures orphan the event (no rollback) and invite duplicates · P2

**Where:** the "Host as group" update
[actions.ts#L338-L350](../../apps/web/src/app/events/new/actions.ts#L338-L350)
and the tournament/league payment-settings update
[actions.ts#L411-L424](../../apps/web/src/app/events/new/actions.ts#L411-L424).

Both run _after_ `createEvent.execute` has already inserted the row. On failure
they return `{ ...snapshot, error }` to the form **without** deleting the event
and **without** redirecting. The host is left on a fully-populated form showing
an error — for an event that already exists. Re-submitting creates a
**duplicate**. Contrast the open-play pricing / cap / Stripe branches
([actions.ts#L375-L404](../../apps/web/src/app/events/new/actions.ts#L375-L404)),
which deliberately `await supabase.from('events').delete()` to roll back before
returning the error.

**Fix:** make these two branches consistent with the rollback branch — either
`events.delete(result.id)` and return the error (so a retry is clean), or
treat the event as created and `redirect('/events/${result.id}?created=1&…')`
with a flash param noting the one setting that didn't stick (group host /
fee settings), so the host edits rather than resubmits. Rolling back is the
safer default given the duplicate risk.

## CE-3 — Event-type cards have no visible keyboard focus · P3 (a11y)

**Where:**
[form-primitives.tsx#L106-L140](../../apps/web/src/app/events/new/_components/form-primitives.tsx#L106-L140)
(`TypeCard`).

The card hides its radio with `className="sr-only"` and only restyles on
`checked` (`border-primary bg-primary/5 ring-2`). There is **no focus style**,
so a keyboard user tabbing Open play → Tournament → League sees no indication
of where focus is — a WCAG 2.4.7 (Focus Visible) gap on the form's first
interactive control.

**Fix:** add a focus ring driven by the inner radio, e.g.
`has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/70` (or
`focus-within:`) on the `<label>`. Pairs naturally with the existing `checked`
ring.

## CE-4 — `SegmentedControl` is a non-conformant radiogroup · P3 (a11y)

**Where:**
[form-primitives.tsx#L142-L178](../../apps/web/src/app/events/new/_components/form-primitives.tsx#L142-L178).

It renders `role="radiogroup"` with `role="radio"` buttons, but every button is
in the tab order and there's no arrow-key navigation or roving `tabindex`. A
screen-reader user is told "radio group" and then can't operate it the way the
role promises (arrow keys to move selection). Used for the Unlimited / Fixed /
By-position capacity selector.

**Fix:** implement roving tabindex + ArrowLeft/ArrowRight (Home/End) handling so
only the active option is tabbable, matching the ARIA radiogroup pattern — or,
if simpler, drop the radio roles and present it as a labeled button group
(`aria-pressed`). Given this is the only segmented control in the form, the
button-group route is lower-risk.

## CE-5 — Dead `div_${i}_present` hidden input · P3 (stale code)

**Where:**
[divisions-repeater.tsx#L180](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx#L180).

Each row emits `<input type="hidden" name={`div*${idx}\_present`} value="1" />`,
but the server action keys entirely off `div_count` + `div*${i}\_label`([actions.ts#L160-L164](../../apps/web/src/app/events/new/actions.ts#L160-L164))
and never reads`\_present` (confirmed: the only occurrence in the repo is the
emit site). Remove it.

## CE-6 — Redundant `nextKey` initializer · P3 (stale code)

**Where:**
[divisions-repeater.tsx#L137](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx#L137):
`const [nextKey, setNextKey] = useState(requireAtLeastOne ? 1 : 1);`. Both
branches evaluate to `1`. Simplify to `useState(1)` (the comment-worthy intent —
"keys start after the seeded row 0" — is the same either way).

## CE-8 — Per-division skill-tier select diverges from the open-play one · P3 (consistency)

**Where:**
[divisions-repeater.tsx#L251-L267](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx#L251-L267)
vs. the shared
[`SkillTierSelect` (form-primitives.tsx#L57-L95)](../../apps/web/src/app/events/new/_components/form-primitives.tsx#L57-L95).

Open-play and external surfaces render the tier ladder grouped under
Beginner / Intermediate / Advanced / Competitive `<optgroup>`s; the per-division
repeater hand-rolls a **flat** 7-option `<select>` with no grouping. A host
configuring a multi-division tournament sees a different, less-legible ladder
than they saw a section earlier. Fold the repeater's select onto the same
grouped structure (the repeater can't reuse `SkillTierSelect` verbatim because
of its indexed `name`/controlled value, but it can share the `<optgroup>`
markup or a small `SkillTierOptions` fragment).

## CE-9 — No photo at create time · P3 (gap / streamline)

**Where:** create has no hero upload; `HeroImageUpload` requires an
`entityId`
([hero-image-upload.tsx#L27](../../apps/web/src/components/hero-image-upload.tsx#L27))
and only appears on `/events/[id]/edit`.

The common host flow produces an event whose card has no image until the host
separately navigates to edit and uploads one — a known friction point for an
events product where the photo drives click-through. The chicken-and-egg
(`entityId` doesn't exist pre-insert) is real, so this is a P3, not a quick fix.

**Fix options:** (a) on the post-create event page (`?created=1`), surface a
prominent "Add a cover photo" nudge wired to the existing upload; or (b) a
two-phase upload (stage to a temp path, attach on insert). (a) is far cheaper
and probably sufficient.

## CE-10 — Paid-event-cap banner greets free-event hosts too · P3 (streamline)

**Where:**
[page.tsx#L100-L109](../../apps/web/src/app/events/new/page.tsx#L100-L109).

`atPaidEventCap` renders an info `Alert` at the very top of the form for any
capped free host, regardless of whether they intend to charge. The copy
mitigates it ("Free events are always unlimited"), but a host setting up a free
pickup night is greeted by a monetization wall above the whole form. The
client-side `StripeOnboardingBanner` already models the better pattern — it only
escalates once a price > 0 is entered.

**Fix:** show the cap notice contextually inside the pricing subsection (or only
once `priceUsd > 0`), mirroring the `blocking` logic in
[payment-fields.tsx#L41-L59](../../apps/web/src/app/events/new/_components/payment-fields.tsx#L41-L59).
The proactive top-of-page nudge (monetization O-4) can stay, but as a calmer
inline note rather than the first thing a free host sees.

## CE-11 — "By position" capacity is create-only; edit can't reach it · P3 (parity gap)

**Where:** create's 3-way `SegmentedControl`
([open-play-body.tsx#L66-L135](../../apps/web/src/app/events/new/_components/open-play-body.tsx#L66-L135))
vs. edit's 2-way radio
([edit-event-form.tsx#L255-L299](../../apps/web/src/app/events/%5Bid%5D/edit/edit-event-form.tsx#L255-L299)).

Edit exposes only Unlimited / Fixed — never By-position, and never the position
roster counts. A host who picks the wrong capacity mode at create (or wants to
tune the roster afterward) can't do it from edit. Either expose by-position +
the roster grid in the edit form, or document the limitation at create so the
host knows the position roster is set-once.

## CE-12 — Required fields carry no required marker · P3 (clarity)

**Where:** e.g. title
([basics-section.tsx#L34-L48](../../apps/web/src/app/events/new/_components/basics-section.tsx#L34-L48)),
the address block
([location-fields.tsx](../../apps/web/src/app/events/new/_components/location-fields.tsx)),
and the start/end pickers
([when-where-section.tsx#L60-L87](../../apps/web/src/app/events/new/_components/when-where-section.tsx#L60-L87)).

Optional fields are explicitly labeled `(optional)`, but required ones have no
positive marker — a host can't tell title / address / city / country / dates are
mandatory until the `required` attribute or Zod fires on submit. Add a
consistent required affordance (asterisk + a legend, or `aria-required` echoed
visually) so the contract is visible up front. Low-effort, improves
first-attempt success.

## CE-13 — "Host as" dropdown is noise when the host owns no groups · P3 (streamline)

**Where:**
[basics-section.tsx#L66-L86](../../apps/web/src/app/events/new/_components/basics-section.tsx#L66-L86).

The select renders unconditionally, so a host who manages zero groups sees a
single-option "Host as: Yourself" dropdown plus its helper text — pure noise for
the most common (individual host) case. Render the field only when
`hostableGroups.length > 0`; otherwise omit it (hosting as yourself is the
default the server already assumes).

---

## Won't-do / deliberate (for the next auditor)

- **`export const dynamic = 'force-dynamic'`** on the page
  ([page.tsx#L13](../../apps/web/src/app/events/new/page.tsx#L13)) is **correct
  here** — the page reads `cookies()`/`auth.getUser()` and is host-private
  (`robots: noindex`). This is not the public-page `force-dynamic` anti-pattern
  (AGENTS pattern 3).
- **External-toggle promoted to section 1** (and `AdvancedDetailsPanel
hideExternal`) is intentional — flipping it reshapes the whole form, so it
  earns top billing while staying out of the advanced panel.
- **Templates are Pro-only** by design; the non-Pro affordance is a slim upsell
  link, not a disabled control. Leave as-is.
  </content>
  </invoke>
