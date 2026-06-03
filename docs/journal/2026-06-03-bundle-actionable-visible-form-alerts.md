# Actionable + always-visible form alerts (2026-06-03)

## Context

User-driven UX bundle, three asks in sequence:

1. "On any error message for finishing Stripe payments, give the user a link
   so they can complete it." The host-charges gate returned a flat string
   (`…finish Stripe setup at /profile/billing…`) with the path baked into
   prose — not clickable.
2. "Are there other areas that could benefit from this?" → swept the same
   anti-pattern out of the free-tier paid-event cap.
3. "When an alert happens (error or not) the user may be scrolled down and
   miss it — make sure they always see it." → a reveal hook applied across
   every in-place form alert.

No audit backs this; it's a direct usability pass. Touches the same form
surfaces as [persona-ux.md](../audits/persona-ux.md) but is orthogonal to
its open backlog.

## Decisions

- **Typed `errorAction` on form state, not string-parsing.** Rather than
  sniff the error text for a URL in the view, the gate helpers now return a
  structured `cta: { href, label }` alongside `reason`, threaded into a new
  optional `errorAction` field on `CreateEventState` / `EditEventState`. A
  shared [`ErrorActionLink`](../../apps/web/src/components/error-action-link.tsx)
  renders it (or nothing). End-to-end typed; no fragile substring match.
- **Link only where the viewer can act.** The Stripe/Pro CTAs attach to
  **host-facing** errors (create/edit event), where the person seeing the
  message owns the fix. The **attendee-facing** "host hasn't finished payment
  setup" copy (tip jar, RSVP `host_not_ready`) got **no** link — a guest
  can't complete the host's onboarding, so a link would mislead.
- **Bracket cap: trim the URL, don't add a link.** `/brackets/new` already
  renders a real "Upgrade to Pro" button next to `cap.reason`, so adding a
  second link would duplicate it. Just removed the raw `/profile/billing/pro`
  from the prose. The paid-event cap (shown only via form error, no button)
  got the full `cta`.
- **Scroll-into-view + focus over toast/sticky** (user's pick). These are
  errors the user must _act on_ (fix a field, upgrade, finish Stripe), so the
  message belongs inline next to the form; a toast auto-dismisses and a
  sticky banner is intrusive. Moving focus to the alert is the WCAG
  error-summary pattern — keyboard/SR users land on it, not just sighted
  users at the top of a long form.
- **Reveal only when off-screen.** [`useAlertReveal`](../../apps/web/src/components/use-alert-reveal.ts)
  reads `getBoundingClientRect()` and skips the scroll when the alert is
  already fully visible — otherwise a short form would jar-jump to re-center
  an alert the user can already see. Focus moves either way (with
  `preventScroll` so it never cancels the smooth scroll).
- **Trigger on the form-state object, not the message string.** `useFormState`
  hands back a fresh object each submit, so keying the effect on `state`
  re-fires even when the _same_ error repeats. For the `useState`-based
  forms (walk-in, import, auth) the error value is the trigger — identical
  repeats are a non-issue because React bails the re-render anyway.
- **Attach ref to the existing `role="alert"` node; wrap only `<Alert>`.**
  To avoid layout churn, `ref` + `tabIndex={-1}` + `outline-none` went
  straight onto existing `<p role="alert">` / `<div role="alert">` elements.
  Only the `<Alert>` primitive (no ref forwarding) and error/success _pairs_
  got a wrapper div.

## Changes

New primitives:

- `components/error-action-link.tsx` — renders an optional `{ href, label }`
  after an error (one-click fix). Server-safe; casts to `Route` per repo
  typedRoutes convention.
- `components/use-alert-reveal.ts` — `(trigger, active) => ref`; scrolls the
  alert into view (when off-screen) and focuses it on each change.

Actionable links:

- `lib/host-stripe-account.ts` — `requireHostChargesEnabled` returns `cta`
  (+ `HOST_BILLING_PATH`, `ErrorActionLink` type); URL dropped from prose.
- `lib/host-paid-event-cap.ts` — `PaidEventCapResult` gains `cta`
  (`Upgrade to Pro →`); URL dropped from prose.
- `lib/standalone-bracket-cap.ts` — URL trimmed from prose (page already
  renders the Upgrade button).
- `events/new/actions.ts`, `events/[id]/edit/actions.ts` — form states gain
  `errorAction`; Stripe + cap branches thread `.cta`.

Reveal sweep (25 forms on the hook): event create/edit; claim; group
new/edit; team new; profile, business-info, handle-editor; guest-signup;
community new/edit; host/captain broadcast panels; add-media,
add-profile-video; cancel-event / delete-group / delete-team danger zones;
bracket walk-in; admin community-import; login, Google button,
forgot-password, reset-password. Success-bearing forms reveal on success too
("error or not").

## Patterns observed

- **Baking a route into an error string is a recurring anti-pattern.** Found
  in three cap/gate messages. The fix shape: return a typed
  `cta: { href, label }` on the result object and render it with
  `ErrorActionLink` — never `…at /some/path…` in prose. Promoted to AGENTS.md
  (pattern #15).
- **Form-level alerts should reveal themselves.** Any new client form with an
  in-place error/success alert should wire `useAlertReveal(state, active)` and
  attach the ref to its `role="alert"` node. Also in AGENTS.md #15.
- **`role="alert"` announces; focus is the keyboard complement.** The aria-live
  region already speaks the message; moving focus is what brings a keyboard /
  scrolled user _to_ it. The two are not redundant.

## Follow-ups

- **Server-rendered flash alerts** — `event-flash-banners`, the badge/sponsor
  edit panels, `account/delete`, `brackets/new`. These render from
  `searchParams` in **server** components after a redirect (scroll resets to
  top), so the client hook can't attach. A small `RevealOnMount` client
  wrapper would cover them if the post-redirect-scroll case proves to bite.
  Deferred — different mechanism, lower value.
- **`conversation-view` chat composer** — skipped; the chat owns its
  scroll-to-bottom behavior and auto-revealing the composer error would fight
  it. Revisit only if chat-send errors are reported as missed.
- **`format-picker-form`** — its `role="alert"` is a per-format inline
  validation note in a flex row, not a form-level banner; left as-is.
