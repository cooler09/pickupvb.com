# 2026-06-08 — Referrals + comped Pro (O-3), conversion nudges (O-4), Club follow-ups tracked

## Context

Closing out the cheaper monetization opportunities after the big O-1/O-7/O-2
builds: **O-3** (referral credit → free Pro), **O-4** (convert harder on shipped
levers — no new product), plus **tracking** the three deferred Club follow-ups so
they aren't lost. O-9 (waiver e-sign) confirmed deferred. O-3 forks confirmed:
**comp via our own Pro gate** + **≥3 paid events** to qualify. Design of record:
[ADR 0039](../adr/0039-referrals-pro-grants.md).

## Decisions

- **O-3 reward = comp grant, not Stripe coupon.** A `pro_grants` row
  (`granted_until`) is honored by `hasProBenefits` (OR'd alongside subscription +
  admin), so a comped host gets the full Pro surface with zero Stripe plumbing,
  works for non-subscribers, and stacks. `is_pro_host` is untouched — the comp is
  layered in the **app gate** only. The durable rule this reinforces: **every Pro
  perk gates on `hasProBenefits`, never bare `isPro`** (comp + admin only unlock
  through the former). The grant check is a `React.cache`'d admin read (no
  `cookies()` → safe in cached contexts), the same shape as the other gate reads.

- **O-3 attribution = first-touch, new-accounts-only, best-effort.** `/r/<userId>`
  drops a 30-day cookie (or attributes immediately if already signed in); the auth
  callback records the `referrals` row **only inside its existing "<60s-old new
  account" block**, so an established host clicking a ref link isn't attributed.
  `unique(referred_user_id)` + a zero-events guard + a no-self-refer CHECK keep it
  clean. Milestone (`maybeQualifyReferral`) runs after a paid-event publish in
  `new/actions.ts`, awaited (completes before redirect) but fully self-guarding so
  it can't break event creation.

- **O-3 qualify = ≥3 paid events.** High-intent, resists fake-signup farming —
  the referred host has to do real organizing work. Counted distinct + paid +
  status-agnostic (same notion as the paid-event cap).

- **O-4 is pure conversion, no schema.** A proactive cap banner on `/events/new`
  for free hosts already at the rolling-30d paid-event cap (before they fill the
  form, not just at submit). Annual framing: the Pro billing page de-emphasizes
  the monthly button (secondary) and badges yearly "Best value · save $X" so
  annual reads as the default; the pricing page already led with yearly. Formal
  A/B deferred until there's a framework.

- **Club follow-ups tracked, not built.** Recorded in monetization.md
  Opportunities as O-2a (multi-admin Pro — would widen the Pro gate; needs a
  per-surface review), O-2b (club analytics dashboard), O-2c (club payout income
  in the per-user earnings page — graded P2, since a host can't see club income
  in-app today, only in Stripe). Each carries a concrete fix pointer.

## Surfaces

Migration `20261003000000_referrals_pro_grants.sql` (`pro_grants`, `referrals`).
`lib/referrals.ts` + `lib/pro-grants.ts`; `hasProBenefits` extended
([admin.ts](../../apps/web/src/lib/admin.ts)). `/r/[code]` route, auth-callback
attribution, `new/actions.ts` milestone hook. Pro-page referral section +
comped-Pro note. O-4: `/events/new` cap banner, Pro-page annual framing.
Hand-edited DB types. Docs: ADR 0039 + index, features.md (referrals subsection),
monetization.md (O-3/O-4 ✅ + Club follow-ups O-2a/b/c + remediation log).

## Deferred

O-2a/b/c (Club follow-ups), O-5 (SMS/Twilio), O-8 (white-label branding), O-9
(waiver e-sign). Referral leaderboard / referred-side reward.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green (0 lint errors;
all suites; the new `/r/[code]` route built). Migration **not** applied locally
(deploy-gated). Unverified end-to-end against a live env: the `/r/` → cookie →
signup → attribution → ≥3-paid-events → grant → `hasProBenefits` flip chain
(several steps span auth + webhook-adjacent timing). Run it on dev after deploy.
