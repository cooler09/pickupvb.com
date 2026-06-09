# Legal & Footer Pages Audit

_Last updated: 2026-06-09_

Audit of the four footer-linked legal pages and the shared chrome that renders
them:

- [legal/terms/page.tsx](../../apps/web/src/app/legal/terms/page.tsx) — Terms of Service
- [legal/privacy/page.tsx](../../apps/web/src/app/legal/privacy/page.tsx) — Privacy Policy
- [legal/refunds/page.tsx](../../apps/web/src/app/legal/refunds/page.tsx) — Refund Policy
- [legal/accessibility/page.tsx](../../apps/web/src/app/legal/accessibility/page.tsx) — Accessibility statement
- [legal/layout.tsx](../../apps/web/src/app/legal/layout.tsx) — shared typographic wrapper
- [site-footer.tsx](../../apps/web/src/components/site-footer.tsx) — the footer that links them

Lens: rendering bugs, disclosure gaps / internal inconsistencies, UX
improvements, and stale code. **This is a doc-content + chrome audit, not a
substantive legal review** — it does not opine on whether the arbitration
clause, liability cap, or governing-law choice are advisable.

> **Status (2026-06-09):** First dedicated audit of this surface. **0 P1 · 3 P2
> · 8 P3 — all open.** The substantive legal _facts_ all cross-check against the
> code (trial length, refund windows, consent cookie, GPC, session-replay-off,
> and every data-retention window match the implementation exactly — see
> "What's already accurate" below). The findings are two real rendering bugs in
> the shared layout (L-1 `<ol>` has no numbers, L-2 `<h3>` unstyled), one
> subprocessor-list inconsistency (L-3 Terms omits PostHog), and a tail of P3
> disclosure/SEO/stale-code items. Nothing here is legally load-bearing, but L-1
> is visible on a live page. None fixed yet.

---

## What's already accurate (verified against code — don't re-verify on re-audit)

Every quantitative claim in the legal copy was traced to its source of truth and
**matches**:

- **Pro trial = 14 days.** [refunds/page.tsx#L13](../../apps/web/src/app/legal/refunds/page.tsx#L13)
  - [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx#L61) ↔
    `trial_period_days: 14` in [pro/actions.ts#L86](../../apps/web/src/app/profile/billing/pro/actions.ts#L86).
- **Refund window = 24h default, 0–720h Pro-configurable.**
  [refunds/page.tsx#L43-L56](../../apps/web/src/app/legal/refunds/page.tsx#L43-L56)
  ↔ `DEFAULT_REFUND_WINDOW_HOURS = 24` / `MAX_REFUND_WINDOW_HOURS = 720`
  ([money.ts#L10-L12](../../apps/web/src/lib/money.ts#L10-L12)).
- **Consent cookie = `pickupvb_consent`, 180-day life.**
  [privacy/page.tsx#L177](../../apps/web/src/app/legal/privacy/page.tsx#L177) ↔
  `CONSENT_COOKIE` + `CONSENT_COOKIE_MAX_AGE_S = 60*60*24*180`
  ([consent.ts#L20-L21](../../apps/web/src/lib/consent.ts#L20-L21)).
- **GPC honored as default-deny.** [privacy/page.tsx#L177-L179](../../apps/web/src/app/legal/privacy/page.tsx#L177-L179)
  ↔ `Sec-GPC` handling in [consent.ts#L39-L50](../../apps/web/src/lib/consent.ts#L39-L50).
- **"We do not enable session replay."** [privacy/page.tsx#L169](../../apps/web/src/app/legal/privacy/page.tsx#L169)
  ↔ `disable_session_recording: true` ([posthog-provider.tsx#L97](../../apps/web/src/components/posthog-provider.tsx#L97)).
- **All four retention windows.** Privacy §6
  ([privacy/page.tsx#L199-L217](../../apps/web/src/app/legal/privacy/page.tsx#L199-L217))
  ↔ the pg_cron jobs in
  [20260627000000_retention_cron_jobs.sql](../../supabase/migrations/20260627000000_retention_cron_jobs.sql):
  notification outbox 90d sent / 30d failed, in-app 30d read / 180d unread,
  marketing attribution 24mo. Server logs 90d is a stated infra window.
- **Stripe / Supabase / Vercel / Resend / Sentry / Turnstile** are all real,
  live integrations (Sentry config, [turnstile.ts](../../apps/web/src/lib/turnstile.ts),
  [email-resend.ts](../../apps/web/src/lib/email-resend.ts), etc.).
- **Self-serve account deletion exists** ([profile/account/delete](../../apps/web/src/app/profile/account/delete/page.tsx)),
  backing Terms §16 and Privacy §6.

Internal cross-references in the Terms (the "READ SECTION 14" pointer, the
§16 survival list, the §6→Refund-Policy link) all resolve to the right sections.

---

## Findings

### L-1 — Ordered list renders with no numbers or indent on the Refund Policy · **P2**

The shared layout restores list styling for `<ul>` only —
`'[&_li]:my-1 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6'`
([layout.tsx#L9](../../apps/web/src/app/legal/layout.tsx#L9)) — and there is **no
`[&_ol]` rule.** Tailwind v4 preflight (`@import 'tailwindcss'` in
[globals.css#L1](../../apps/web/src/app/globals.css#L1)) resets `ol` to
`list-style: none; margin: 0; padding: 0`. The Refund Policy's only ordered
list — the **"How to request a refund"** steps
([refunds/page.tsx#L122-L134](../../apps/web/src/app/legal/refunds/page.tsx#L122-L134)) —
therefore renders as three flush-left, unmarked lines. The steps read as an
ordered procedure ("cancel from the event page… then… then email"), so losing
the `1./2./3.` markers degrades comprehension on a live legal page.

**Fix:** add an ordered-list rule to the layout class array, mirroring the `ul`
one:

```ts
'[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
```

(`[&_li]:my-1` already covers item spacing for both.)

### L-2 — `<h3>` subheadings are unstyled on the Privacy Policy · **P2**

[layout.tsx#L6-L7](../../apps/web/src/app/legal/layout.tsx#L6-L7) styles `h1` and
`h2` against the M3 type scale but defines **no `[&_h3]` rule.** The Privacy
Policy uses four `<h3>` subheads — "Information you provide", "Information
collected automatically", "Information from third parties"
([privacy/page.tsx#L31](../../apps/web/src/app/legal/privacy/page.tsx#L31),
[#L57](../../apps/web/src/app/legal/privacy/page.tsx#L57),
[#L78](../../apps/web/src/app/legal/privacy/page.tsx#L78)) and "California
residents (CCPA / CPRA)"
([#L261](../../apps/web/src/app/legal/privacy/page.tsx#L261)). They fall back to
the browser default `h3` (wrong size, wrong margins, off the M3 scale the rest
of the page uses), so the §1 sub-structure reads as visually flat.

**Fix:** add an `h3` rule to the layout, e.g.:

```ts
'[&_h3]:text-title-md [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold',
```

(Privacy is the only page using `<h3>` today; the rule future-proofs the others.)

### L-3 — Terms §11 subprocessor list omits PostHog · **P2**

Terms "Third-party services" enumerates "Stripe, Supabase, Vercel, Resend,
Sentry, and Cloudflare Turnstile"
([terms/page.tsx#L242-L244](../../apps/web/src/app/legal/terms/page.tsx#L242-L244)),
but **omits PostHog** — which the Privacy Policy discloses prominently as the
analytics processor, both in the subprocessor list
([privacy/page.tsx#L136](../../apps/web/src/app/legal/privacy/page.tsx#L136)) and
in the cookies section
([privacy/page.tsx#L162-L180](../../apps/web/src/app/legal/privacy/page.tsx#L162-L180)).
PostHog is live ([posthog-provider.tsx](../../apps/web/src/components/posthog-provider.tsx)).
The two documents should name the same processors.

**Fix:** add "PostHog" to the Terms §11 sentence so it matches Privacy §4.

### L-4 — Accessibility page is missing from the sitemap · **P3**

[sitemap.ts#L82-L86](../../apps/web/src/app/sitemap.ts#L82-L86) advertises the
"stable legal pages" — `/legal/privacy`, `/legal/terms`, `/legal/refunds` — but
**not `/legal/accessibility`**, which was added later (last reviewed 2026-06-03)
and never folded into the list. It's footer-linked like the others and is the
only legal page that bothers to set a canonical
([accessibility/page.tsx#L7](../../apps/web/src/app/legal/accessibility/page.tsx#L7)),
so the omission is clearly an oversight.

**Fix:** add
`{ url: \`${BASE}/legal/accessibility\`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 }`
to the legal block.

### L-5 — Web-push subscription data is undisclosed in the Privacy Policy · **P3**

The app persists Web Push subscriptions (endpoint + keys — device-identifying
data) and purges them after 90 days unused
([20260701000000_retention_team_invites_push_subs.sql#L49](../../supabase/migrations/20260701000000_retention_team_invites_push_subs.sql#L49)),
but Privacy §1 ("Information we collect")
([privacy/page.tsx#L29-L88](../../apps/web/src/app/legal/privacy/page.tsx#L29-L88))
and the §6 retention list
([#L199-L217](../../apps/web/src/app/legal/privacy/page.tsx#L199-L217)) never
mention push subscriptions.

**Fix:** add a "Push subscription" bullet to §1 (collected when you enable
notifications) and a retention line to §6 (purged 90 days after last use).

### L-6 — Privacy §6 retains an "SMS body" the platform never sends · **P3**

Privacy §6 describes retaining the "rendered email / **SMS** body and the
delivery address"
([privacy/page.tsx#L200-L204](../../apps/web/src/app/legal/privacy/page.tsx#L200-L204)),
but the SMS channel is **not implemented** — the delivery worker marks every
`sms` row `skipped` with reason `sms-adapter-not-implemented`
([worker/route.ts#L104-L106](../../apps/web/src/app/api/notifications/worker/route.ts#L104-L106)),
and no phone number is listed among collected data in §1. The copy is
forward-looking (it mirrors the `notification_outbox` schema, which has an SMS
column), but as written it discloses processing that doesn't occur.

**Fix:** either drop "SMS" until the channel ships (and re-add it, with a
"phone number" entry in §1, when it does), or leave a note that the SMS channel
is not yet active. Low urgency — over-disclosure, not under-disclosure.

### L-7 — "Change your consent by clearing site cookies" is poor UX and slightly wrong · **P3**

Privacy §5 tells users they can change their analytics choice "at any time by
clearing site cookies"
([privacy/page.tsx#L176-L179](../../apps/web/src/app/legal/privacy/page.tsx#L176-L179)).
Clearing site cookies also deletes the auth/session cookies — i.e. it logs the
user out — and there is no in-product control to re-open the consent banner.
This is the only documented path to revoke consent.

**Fix:** add a "Cookie preferences" affordance (a footer link or a profile
setting that re-shows [consent-banner.tsx](../../apps/web/src/components/consent-banner.tsx),
which already supports Accept/Decline) and reword §5 to point at it instead of
"clear cookies."

### L-8 — Only the Accessibility page declares a canonical URL · **P3**

[accessibility/page.tsx#L7](../../apps/web/src/app/legal/accessibility/page.tsx#L7)
sets `alternates: { canonical: '/legal/accessibility' }`; terms, privacy, and
refunds set `title`/`description` but no canonical
([terms/page.tsx#L3-L6](../../apps/web/src/app/legal/terms/page.tsx#L3-L6) and
the equivalents). For consistency and to harden against any query-param
duplication, all four should declare a canonical.

**Fix:** add `alternates: { canonical: '/legal/<slug>' }` to the other three
`metadata` exports.

### L-9 — Sitemap `lastModified` for legal pages is build time, not the document date · **P3**

The three legal entries use `lastModified: now`
([sitemap.ts#L84-L86](../../apps/web/src/app/sitemap.ts#L84-L86)), so every crawl
reports the page as "modified today" even though each page carries a real
`LAST_UPDATED` constant (e.g. Terms "May 18, 2026"). This trains crawlers to
distrust the signal.

**Fix:** export each page's `LAST_UPDATED` (or a shared map) and feed the parsed
date into the sitemap entry's `lastModified`.

### L-10 — Redundant `as Route` casts in the footer · **P3 (stale code)**

The Legal column casts every href — `'/legal/terms' as Route`, etc.
([site-footer.tsx#L35-L38](../../apps/web/src/components/site-footer.tsx#L35-L38)) —
while the Product column passes `/events`, `/pricing`, `/tools` **uncast** and
compiles fine ([#L26-L28](../../apps/web/src/components/site-footer.tsx#L26-L28)).
With `typedRoutes`, the `/legal/*` static routes are already members of the
`Route` union, so the four casts are redundant (likely a leftover from before
the pages existed).

**Fix:** drop the `as Route` casts and confirm with `pnpm typecheck`. If they
turn out to still be required, that itself signals a route-typing quirk worth a
one-line comment.

### L-11 — Footer uses array-index keys for one list but href keys for the other · **P3 (nit)**

[site-footer.tsx#L72](../../apps/web/src/components/site-footer.tsx#L72) keys the
`links` map with `key={i}` while the `extras` map immediately below keys with
`key={link.href}` ([#L79](../../apps/web/src/components/site-footer.tsx#L79)).
Harmless for a static list, but inconsistent.

**Fix:** key both with `link.href`.

---

## Remediation log

_None yet — audit authored 2026-06-09._
