# 0010. Open-in-new-tab pattern for Server Action redirects

- **Status:** Accepted
- **Date:** 2026-05-22

## Context

Several flows (Stripe Customer Portal, Stripe Connect onboarding/login,
Stripe Checkout for Pro) need to open a URL in a new tab _after_ a
server-side roundtrip that mints a single-use URL (a Stripe Billing
Portal session, an Account Link, a Checkout Session). The natural
expression is:

```tsx
<form action={createPortalSession} target="_blank">
  <button>Manage billing</button>
</form>
```

It doesn't work. Next.js Server Actions submit via `fetch`, not a real
form submission, so `target="_blank"` is silently ignored — the action
runs, returns a `redirect()`, and the current tab navigates. Every time
this pattern is rediscovered the first attempt is a `<form target>` that
appears broken with no error.

Naïve workarounds also have failure modes:

- `onClick` calls the action, awaits the URL, then `window.open(url)`. By
  the time the URL resolves the click is no longer treated as a user
  gesture, and popup blockers refuse to open the window.
- Use a server `redirect()` to a same-tab interstitial page that has a
  `<meta refresh>` to the Stripe URL. Doubles the latency and bounces the
  user through an empty page.
- Pre-fetch the URL on render. Defeats Stripe's expectation that
  Checkout/Portal session URLs are created at the moment of click and
  are short-lived.

## Decision

Use a small client component,
[`apps/web/src/components/open-in-new-tab-button.tsx`](../../apps/web/src/components/open-in-new-tab-button.tsx),
that:

1. Opens an `about:blank` placeholder window **synchronously** inside the
   `onClick` handler. Browsers treat this as a user gesture so the popup
   blocker stays out of the way.
2. Calls the supplied `getUrl: () => Promise<string | null>` (typically
   a server action) to mint the destination URL.
3. Sets `win.location.href = url` once the promise resolves.
4. Falls back to same-tab navigation if the placeholder was blocked
   anyway, closes it and shows an `alert(nullMessage)` if the action
   returned `null`, and closes it + alerts on throw.

The placeholder is opened with no `noopener` flag because most browsers
return `null` from `window.open` when `noopener` is passed, which would
defeat the navigation. All destinations are first-party-controlled
Stripe URLs so the relaxation is intentional and scoped.

The server action keeps the typed `Result`/throw shape from
[AGENTS.md](../../AGENTS.md)'s "Server-action error handling" rule — it
just returns the URL (or `null`) instead of calling `redirect()`.

Used by:

- [apps/web/src/app/profile/billing/page.tsx](../../apps/web/src/app/profile/billing/page.tsx)
  (manage billing portal, Connect onboarding).
- [apps/web/src/app/profile/billing/pro/page.tsx](../../apps/web/src/app/profile/billing/pro/page.tsx)
  (Pro Checkout).
- [apps/web/src/app/pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx)
  (Pro upgrade from pricing).

## Consequences

- ✅ One reusable component covers every "server-action ⇒ open-in-new-tab"
  flow. New flows reuse it instead of re-discovering the
  `target="_blank"` dead-end.
- ✅ The user gesture is preserved, so popup blockers don't fire on
  default settings.
- ✅ The destination URL is minted on click, matching Stripe's short-lived
  session expectations.
- ❌ Slightly worse no-JS story: this is a `'use client'` component, so
  visitors with JS disabled get no button at all. Acceptable because
  every consumer is a Stripe redirect that itself requires JS.
- ❌ Omitting `noopener` means the opened tab has `window.opener` set on
  the destination. Acceptable here because every destination is a
  first-party Stripe URL; **do not generalize this component for
  user-supplied / external URLs without adding the `noopener` guard
  back in.**

## Alternatives considered

- **Wait for Next.js to honor `<form target="_blank">` on Server Actions.**
  Tracked upstream but no resolution as of Next 16. Not blocking-grade.
- **Drop the new-tab requirement and `redirect()` to Stripe in the same
  tab.** The current tab loses its state (notification context, RSVP
  draft, …) and we'd need to re-build it on return. Worse UX for the
  small win of no client component.
- **Server-render an `<a target="_blank" rel="noopener">` with a
  pre-minted URL.** Pre-minting risks expiry. Also leaks the (one-time)
  Stripe URL into the rendered HTML.
- **Inline the placeholder-open logic at every call site.** Done once,
  hated immediately — the popup-blocker / fallback / null-message
  handling is too fiddly to copy-paste.
