# 2026-06-08 — Club follow-ups: multi-admin Pro + club analytics/earnings (O-2a/b/c)

## Context

Closing the three O-2 v1 deferrals (ADR 0038 follow-up): **O-2a** multi-admin Pro,
**O-2b** club analytics, **O-2c** club payout income in-app. All confirmed by the
audit's fix pointers + sensible defaults (owner/admin-only gate; Club-active
required; O-2b+O-2c as one dashboard) — no new product forks.

## Decisions

- **O-2a is a single-site gate widening.** Every Pro perk already routes through
  `hasProBenefits` (the discipline reinforced by the referral comp work, ADR
  0039), so granting Club admins Pro was one `||` there:
  `subscription OR platform-admin OR referral-comp OR Club-admin`. The Club-admin
  check is a SECURITY DEFINER RPC `user_has_club_benefits` (same 30-day past_due
  grace as the other gates), read via the admin client + `React.cache` like its
  siblings. **Owner/admin only** (not plain members) — adding a member never
  grants Pro; promoting to admin does, which is the club's choice. Generous by
  design: a Club admin gets the 2.5% fee, unlimited paid events,
  passes/memberships, sponsor/badge, etc. on _all_ their events.

- **O-2b + O-2c ship as one club dashboard,** not two surfaces — they're the same
  audience (group owner/admin) and naturally read together. `/groups/[slug]/analytics`
  (slug-resolved like the rest of `/groups/[id]`), gated owner/admin + Club (else
  an upsell to `/groups/[slug]/billing`). Two scopes: **engagement** over
  `host_group_id` (events hosted, attendees), **payout income** over
  `payout_group_id` (gross/refunded/net/est-payout, YTD + all-time + per-event).

- **Admin-client reads, on purpose.** A group owner/admin is generally not the
  event host, so the per-host RLS on `event_payment_audit` / participants
  wouldn't grant them these rows. The page authorizes owner/admin + Club at the
  app layer, then the loader reads on the admin client. The earnings math reuses
  the existing ledger helpers (`groupAuditRowsByPaymentIntent`,
  `estimatePlatformFeeCents`); the fee is estimated at the Pro rate (2.5%) since
  club-routed events are hosted by Club admins, who are now Pro (O-2a) — with the
  same "Stripe dashboard is the final word" disclaimer as the per-host page.

## Surfaces

Migration `20261004000000_club_member_pro_benefits.sql` (`user_has_club_benefits`
RPC). `lib/club.ts` (`hasClubProBenefits`), `lib/admin.ts` (`hasProBenefits`
widened). Dashboard: `groups/[id]/analytics/page.tsx` +
`_loaders/load-club-dashboard.ts`; linked from the group billing page. Hand-edited
DB types. Docs: ADR 0038 follow-up, features.md, monetization.md (O-2a/b/c ✅ +
remediation log), README.

## Deferred

O-5 (SMS/Twilio), O-8 (white-label branding), O-9 (waiver e-sign). The club
dashboard is read-only (no pagination on the per-event table yet — clubs are
small; revisit if a club accrues hundreds of paid events). Club payout income is
still not in the _per-user_ earnings page / tax CSV (it lives on the club
dashboard instead) — fine, since it's the group's income, not an individual's.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green (0 lint errors;
all suites; the new `/groups/[id]/analytics` route built). Migration **not**
applied locally (deploy-gated). Unverified against a live env: that a Club admin
actually flips Pro across surfaces (the `hasProBenefits` widening), and the club
dashboard's payout-income numbers against real club-routed sales. Run on dev
after deploy.
