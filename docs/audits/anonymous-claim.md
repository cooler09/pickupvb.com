# Anonymous account-claim audit

_Last updated: 2026-06-11 (first-pass remediation)_

> **Status (2026-06-11, remediation bundle):** **All 10 findings closed**
> (uncommitted, quad-green). AC-7 landed once Manual Linking was enabled in the
> Supabase dashboard — `/claim` now leads with a one-click "Continue with
> Google" (`linkIdentity`) above the email form, skipping the
> email→confirm→password round-trip while preserving the guest's signups. AC-1,
> AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-9, AC-10 all shipped in the same bundle.
> New shared helper `buildClaimEmailRedirect`
> ([server-redirects.ts](../../apps/web/src/lib/server-redirects.ts)) now backs
> all three email-attach sites (claim form, guest RSVP, guest checkout). New
> unit test [claim/actions.test.ts](../../apps/web/src/app/claim/actions.test.ts)
> (10 cases) pins the validation / guard / open-redirect / friendly-error
> branches. **"Confirm email" is confirmed ENABLED on the Supabase project
> (2026-06-11)** — so AC-2 was an **active P1-severity stranding bug**, not a
> latent one: every guest who supplied an email and clicked the confirmation link
> was stranded password-less. All three email-attach sites (claim, guest RSVP,
> guest checkout) now route through `buildClaimEmailRedirect`, closing it. See
> remediation log below.
>
> **Status (2026-06-11):** New audit of the **anonymous → permanent account
> conversion** ("claim") flow — the path a Supabase anonymous-auth guest takes
> to attach an email + password so their signups follow them across devices.
> The core server flow is sound and well-guarded (open-redirect checks,
> rate-limiting, typed PII-safe logging — all carried over from the security
> audit). The gaps are in **reach and finish**: the claim entry point is
> **invisible on mobile** (where nearly all guest signups happen), guest
> email-confirmation links route to the **wrong redirect** and can strand a
> half-converted user, a `from=claim` hand-off param was **threaded but never
> wired up**, the host-gate error banners are **dead ends**, and the whole
> conversion has **no executable test** (the e2e is `test.fixme`). Several
> high-ROI streamlines (one-click Google claim via `linkIdentity`, prefilling
> the email the guest already gave) are untapped.
>
> Grades (as audited): **0 P1 · 4 P2 · 6 P3.** AC-2 was graded P2-pending-config
> at audit time; with "Confirm email" confirmed enabled it was in fact an
> **active P1** (see the finding) — so the effective tally is **1 P1 · 3 P2 ·
> 6 P3**, all now fixed.

## The flow, end to end

1. A guest RSVPs / buys a ticket → an anonymous `auth.users` row is minted
   (`signInAnonymously`) in [guest-actions.ts](../../apps/web/src/app/events/%5Bid%5D/guest-actions.ts)
   / [checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts).
   `is_anonymous: true`. Their display name (and optionally email) is synced to
   `profiles` + `auth.users` metadata.
2. Later they hit `/claim`
   ([page.tsx](../../apps/web/src/app/claim/page.tsx) →
   [claim-form.tsx](../../apps/web/src/app/claim/claim-form.tsx)) and submit
   name + email.
3. [claimAccount](../../apps/web/src/app/claim/actions.ts) saves the names
   immediately, then `updateUser({ email }, { emailRedirectTo })`. GoTrue can't
   set a password on an anon user without an email first, so this is a two-phase
   conversion: the email send, then a password step **after** the user clicks
   the confirmation link. Redirect → `/claim/check-email`.
4. The link lands on [/auth/callback](../../apps/web/src/app/auth/callback/route.ts),
   which exchanges the PKCE `code` for a now-non-anonymous session and forwards
   to `next` = `/reset-password?from=claim`.
5. [/reset-password](../../apps/web/src/app/reset-password/page.tsx) takes the
   password and honors the threaded `next` (e.g. the `/events/new` host gate
   that started the chain).

The server gate is [requireRealUser](../../apps/web/src/lib/server-auth.ts#L71)
(redirect anon → `/claim?next=…`); `isAnonymousUser` is the shared predicate.

---

## Findings

### AC-1 · Claim entry point is invisible on mobile — P2 (highest-ROI)

The desktop header renders a "Finish creating your account" CTA for anon
viewers
([site-header.tsx#L180-L184](../../apps/web/src/components/site-header.tsx#L180-L184)),
but the mobile surfaces don't:

- [MobileMenu](../../apps/web/src/components/mobile-menu.tsx#L146-L176) only
  receives `user: { displayName; initials } | null`, which is **null for anon
  users** (the header computes `userInfo` only for real users). So the drawer
  falls into the `else` branch and shows just **Sign in / Sign up** — no claim
  link.
- [BottomNavBar](../../apps/web/src/components/bottom-nav-bar.tsx#L80-L85) shows
  "Sign in" → `/login` for anyone not `isAuthenticated` (anon counts as
  not-authenticated).

Net effect: a guest on a phone — the dominant signup device — has **no
persistent path** back to claim their account. The only nudge is the per-event
`?rsvp=guest_joined` flash banner, which disappears on the next navigation.
Worse, the "Sign in" they _are_ shown leads to `/login`, where signing in with a
fresh email creates a brand-new account and **orphans their guest signups** (the
`/claim` page even warns about this for the desktop "Sign in instead" link).

**Fix:** thread an `isAnon` flag from `SiteHeader` into `MobileMenu` and render a
"Finish creating your account" → `/claim` link in the drawer's identity block
(mirror the desktop `tonalButtonClass` CTA). Optionally swap the bottom-nav
fourth slot from "Sign in" to a "Finish setup" affordance when anon. This is the
single highest-impact change in this audit — it's a conversion funnel that's
entirely dark on mobile.

### AC-2 · Guest email-confirmation links use the wrong redirect — P1 (confirmed active) — ✅ FIXED

When a guest supplies an email, both guest paths attach it with a bare
`updateUser({ email })` and **no `emailRedirectTo`**:

- [guest-actions.ts#L114](../../apps/web/src/app/events/%5Bid%5D/guest-actions.ts#L114)
- [checkout-actions.ts#L293](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts#L293)

If the Supabase project has "Confirm email" enabled, GoTrue sends a confirmation
link pointing at the **default Site URL**, not the claim chain. A guest who
clicks it confirms their email → `is_anonymous` flips to **false** → they now
have a **password-less permanent account**. From there the `/claim` page
short-circuits (`if (!is_anonymous) redirect('/profile')` —
[page.tsx#L31](../../apps/web/src/app/claim/page.tsx#L31)), so they can **never
set a password via claim**; recovery requires the `/forgot-password` detour.
That's a half-converted, stranded user.

**Fix:** pass `emailRedirectTo = ${origin}/auth/callback?next=/reset-password?from=claim`
in both guest email-attach calls (the same value
[claimAccount](../../apps/web/src/app/claim/actions.ts#L94) builds). Then _any_
confirmation click — guest-signup, guest-checkout, or claim — lands on the
set-password step. Bonus: this turns the optional-email guest path into a
**one-click email claim** (click link → set password → done) with no extra UI.

**Severity (resolved):** "Confirm email" is **confirmed ENABLED** on the Supabase
project (verified 2026-06-11), so this was an **active P1-severity stranding
bug** — every guest who supplied an email and clicked the confirmation link
flipped to a password-less permanent account and got bounced off `/claim`. Fixed
across all three email-attach sites via `buildClaimEmailRedirect`.

### AC-3 · `from=claim` is threaded but never consumed; reset-password copy is wrong for claim users — P2

[claimAccount](../../apps/web/src/app/claim/actions.ts#L90-L93) builds
`afterPassword = '/reset-password?from=claim…'`, but
[reset-password/page.tsx](../../apps/web/src/app/reset-password/page.tsx) never
reads `from` — it only reads `next`. The param is **dead code**, and its absence
leaves two rough edges for a first-time claimer:

- The page is framed as a _reset_: heading "Choose a new password", body "Pick
  something…". For a claim user this is their **first** password, not a reset.
- The expired-session fallback
  ([page.tsx#L67-L78](../../apps/web/src/app/reset-password/page.tsx#L67-L78))
  sends them to `/forgot-password` → "Request new link". A claim user has **no
  password to reset and often no confirmed email on file**, so that's a dead
  end; the correct recovery is to restart `/claim`.

**Fix:** read `from` (same `window.location.search` read already used for `next`
at submit time, or a Suspense-wrapped `useSearchParams`). When `from === 'claim'`:
swap the heading to "Set your password" / "Finish creating your account" and
point the expired-link CTA at `/claim` instead of `/forgot-password`. If you'd
rather not wire it, **delete the dead param** so the next reader isn't misled.

### AC-4 · Anon-gate error banners are dead ends (violates AGENTS pattern 15) — P2

The host-facing payout/subscription gates bounce anon users with a flash param,
and the banner tells them to claim but gives **no clickable path**:

- [billing/page.tsx#L119-L124](../../apps/web/src/app/profile/billing/page.tsx#L119-L124)
  — "…Finish claiming your account first." (no link)
- [billing/pro/page.tsx#L95-L99](../../apps/web/src/app/profile/billing/pro/page.tsx#L95-L99)
  — "You need a permanent account (with email) to subscribe." (no link)

[AGENTS.md pattern 15](../../AGENTS.md) requires host-facing gate alerts to carry
an actionable CTA (the recurring "…at /profile/billing" dead-end anti-pattern).
These are host-facing, so a CTA is warranted.

**Fix:** render a Link / `ErrorActionLink` to
`/claim?next=/profile/billing` and `/claim?next=/profile/billing/pro`
respectively, after the message.

### AC-5 · No executable test for the claim conversion — P3 (the "does it actually work" gap)

There is **no unit test** for `claimAccount` and the full claim e2e is
`test.fixme` — [persona-greg-anon.public.spec.ts#L49](../../apps/web/tests/e2e/persona-greg-anon.public.spec.ts#L49)
(`'claims the guest account → real login, RSVP history preserved, no
duplicates'`) was authored but never run. So the `safeNext` open-redirect
guards, the not-anon / no-session branches, and the rate-limit gate are all
unverified, and the cross-device "signups carry over" promise is untested.

**Fix:** add a web-unit test (`vi.mock` the supabase client + form-data boundary,
per [AGENTS.md testing](../../AGENTS.md)) covering: invalid email →
`fieldErrors.email`; viewer not anonymous → "already permanent"; `next` =
`//evil.com` / `/\evil.com` rejected (and `/events/new` preserved); rate-limit
block → friendly "try again in N minutes". Graduate the e2e from `fixme` against
dev when the Turnstile fixture is in place.

### AC-6 · Claim form re-asks for data the guest already gave — P3 (streamline)

The guest always supplied a `display_name` at signup and frequently an `email`
(it's offered as "optional — lets you claim this signup later" —
[guest-signup-fields.tsx#L46-L51](../../apps/web/src/app/events/%5Bid%5D/_components/guest-signup-fields.tsx#L46-L51)).
Both live on the anon `auth.users` / `profiles` row. But the claim page has the
`user` in hand
([page.tsx#L17-L20](../../apps/web/src/app/claim/page.tsx#L17-L20)) and still
renders **empty** name + email inputs
([claim-form.tsx](../../apps/web/src/app/claim/claim-form.tsx)).

**Fix:** read `user.email` + the profile's `first_name`/`last_name`/`display_name`
in the page and pass them as `defaultValue`s into `ClaimForm`. A guest who
already typed their email at signup then just clicks "Send confirmation email".

### AC-7 · One-click "Continue with Google" claim via `linkIdentity` — P3 — ✅ FIXED 2026-06-11

The entire email → confirm → password round-trip can be skipped. Supabase
`auth.linkIdentity({ provider: 'google' })` attaches a Google identity to the
**existing** anon user — preserving every guest signup — in a single OAuth
redirect, no email, no password. Today claim is email-only, and the OAuth button
([google-button.tsx](../../apps/web/src/app/login/_components/google-button.tsx))
uses `signInWithOAuth`, which on an anon session would **not** link (it warns
"signups won't merge automatically").

**Fix:** add a "Continue with Google" button to `/claim` that calls
`linkIdentity` (browser client) instead of `signInWithOAuth`, completing via the
existing `/auth/callback`. Requires **Manual Linking** enabled in the Supabase
dashboard. This is the most impactful streamline for users who have a Google
account.

### AC-8 · Anon users who deep-link `/profile` aren't nudged to claim — P3

[load-profile-page.ts#L143](../../apps/web/src/app/profile/_loaders/load-profile-page.ts#L143)
only guards `if (!user) redirect('/login')`. An anon user who navigates straight
to `/profile` gets a degraded, mostly-empty hub instead of the claim prompt —
inconsistent with `requireRealUser`, which exists for exactly this.

**Fix:** redirect anon → `/claim?next=/profile` (or render an inline "finish
creating your account" prompt in place of the hub). Cheap consistency win.

### AC-9 · Raw Supabase error surfaced on claim (unfriendly + enumeration) — P3

[claimAccount#L112-L114](../../apps/web/src/app/claim/actions.ts#L112-L114)
returns `emailErr.message` verbatim. If the email already belongs to another
account, the user sees GoTrue's raw "A user with this email address has already
been registered", which is (a) jargon and (b) discloses registration state
(account enumeration).

**Fix:** map the known "already registered" error to friendly copy with a CTA —
"That email is already linked to an account — sign in instead" + a `/login`
link — and keep the message non-committal for unknown errors. (The
enumeration tradeoff is shared across the auth surface; low severity, but the
claim copy is the worst offender.)

### AC-10 · Claim CTAs drop the `next` hand-off — P3

Several claim entry points link to bare `/claim`, so after setting a password the
user lands on the `/events` default instead of where they intended:

- Header CTA — [site-header.tsx#L181](../../apps/web/src/components/site-header.tsx#L181)
- Pricing CTA — [pricing/page.tsx#L162](../../apps/web/src/app/pricing/page.tsx#L162)
  (a user claiming _in order to subscribe_ bounces to `/events`, not back to
  pricing)
- Check-email "Use a different email" — [check-email/page.tsx#L36](../../apps/web/src/app/claim/check-email/page.tsx#L36)
  (drops the in-flight `next`)

**Fix:** thread `next` on each (`/claim?next=/pricing`, etc.); the claim action
and `/reset-password` already honor it end-to-end.

---

## Remediation log

### 2026-06-11 — first-pass bundle (uncommitted, quad-green)

All 10 findings closed. AC-7 landed after Manual Linking was enabled in the
Supabase dashboard (2026-06-11); the rest shipped in the same bundle.

| Finding   | What landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC-1**  | `SiteHeader` now passes `isAnon` to `MobileMenu`; the drawer's identity block renders a primary "Finish creating your account" → `/claim` CTA (with "Sign in instead") for anon viewers instead of the signed-out Sign in / Sign up pair. ([site-header.tsx](../../apps/web/src/components/site-header.tsx), [mobile-menu.tsx](../../apps/web/src/components/mobile-menu.tsx))                                                                                                                                                                                                                                                                                                                            |
| **AC-2**  | New `buildClaimEmailRedirect(next?)` helper centralizes the `/auth/callback?next=/reset-password?from=claim` redirect; wired into the claim action **and** both guest email-attach paths (`updateUser({ email }, { emailRedirectTo })`), so any confirmation click lands on set-password instead of the default Site URL. Guest paths thread `next=/events/{id}`. ([server-redirects.ts](../../apps/web/src/lib/server-redirects.ts), [guest-actions.ts](../../apps/web/src/app/events/%5Bid%5D/guest-actions.ts), [checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts)) **"Confirm email" confirmed ENABLED 2026-06-11 → this was an active P1 stranding bug, now closed.** |
| **AC-3**  | `/reset-password` reads `from=claim` and switches copy ("Set your password" / "Last step…" / "Set password" / "Account created") and the expired-link recovery (→ `/claim`, not `/forgot-password`). ([reset-password/page.tsx](../../apps/web/src/app/reset-password/page.tsx))                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **AC-4**  | Anon-gate banners on `/profile/billing` + `/profile/billing/pro` now carry a `/claim?next=…` CTA. ([billing/page.tsx](../../apps/web/src/app/profile/billing/page.tsx), [pro/page.tsx](../../apps/web/src/app/profile/billing/pro/page.tsx))                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **AC-5**  | New [claim/actions.test.ts](../../apps/web/src/app/claim/actions.test.ts) — 10 cases: invalid email, no-session, already-permanent, `next` threading + both open-redirect rejections, check-email `next` carry-through, rate-limit block, friendly/ generic error mapping. Full e2e still `test.fixme` (Turnstile-gated).                                                                                                                                                                                                                                                                                                                                                                                 |
| **AC-6**  | `/claim` prefills first/last/email from the guest's `profiles` row (splitting `display_name` as a fallback) + `user.email`/`new_email`. ([claim/page.tsx](../../apps/web/src/app/claim/page.tsx), [claim-form.tsx](../../apps/web/src/app/claim/claim-form.tsx))                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **AC-8**  | `load-profile-page` redirects anon viewers → `/claim?next=/profile`. ([load-profile-page.ts](../../apps/web/src/app/profile/_loaders/load-profile-page.ts))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **AC-9**  | `claimAccount` maps "already registered" → friendly sign-in copy and keeps unknown GoTrue errors generic (no raw-message leak). ([claim/actions.ts](../../apps/web/src/app/claim/actions.ts))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **AC-10** | `next` threaded on the pricing CTA (`/claim?next=/pricing`) and carried through the claim action → `/claim/check-email` → "Use a different email". Header CTA left global (no single return path). ([pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx), [claim/actions.ts](../../apps/web/src/app/claim/actions.ts), [check-email/page.tsx](../../apps/web/src/app/claim/check-email/page.tsx))                                                                                                                                                                                                                                                                                                  |
| **AC-7**  | **Landed** (Manual Linking enabled 2026-06-11). New [claim-google-button.tsx](../../apps/web/src/app/claim/claim-google-button.tsx) calls `supabase.auth.linkIdentity({ provider: 'google' })` to attach a Google identity to the existing anon user (preserves signups, no email/password). `/claim` leads with it above an "Or use email" divider; redirect → `/auth/callback?next={safeNext ?? /profile}`; already-linked-elsewhere errors map to friendly sign-in copy. ([claim/page.tsx](../../apps/web/src/app/claim/page.tsx))                                                                                                                                                                     |
