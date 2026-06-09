# 2026-06-08 — Sponsor slot: decouple entitlement from content (SP-1/SP-2)

## Context

Follow-up to the same-day sponsor-slot focused audit
([monetization.md § "Sponsor slot focused audit"](../audits/monetization.md)).
That pass shipped the five P3 quick wins (SP-3…SP-7) and flagged two P2s with a
shared root cause: the à-la-carte **entitlement** (`access_kind`, `paid_at`,
`purchased_by_user_id`, `stripe_*`) was stored **on the same `event_sponsors`
row** as the sponsor **content**. That coupling produced:

- **SP-1 (re-charge risk):** `removeSponsor` `DELETE`s the whole row, so a free
  host who paid $3 to unlock the slot lost the entitlement and would be charged
  again on re-add.
- **SP-2 (stuck host):** the authoring gate ("Pro OR paid") was also applied to
  removal, so a host who created a sponsor while Pro and then let Pro lapse
  could no longer remove their own sponsor — the block kept rendering publicly,
  unmanageable.

Badges had already solved exactly this. The badge migration
([20260907000000](../../supabase/migrations/20260907000000_event_badge_access.sql))
even calls out the divergence in its preamble: _"Unlike the sponsor slot (one
row per event holding both the content and the access flag), badges are
multi-row, so the capability unlock lives in its own per-event table."_ This
bundle brings the sponsor slot to the same shape.

## Decisions

- **Mirror `event_badge_access`, don't patch in place.** The alternative —
  keep one row and have `removeSponsor` null the content fields instead of
  deleting — was rejected: `event_sponsors.name` is `NOT NULL CHECK(length 1..80)`,
  so "unlocked but empty" has no representable state without relaxing the content
  constraint and teaching every reader to treat a content-less row as "no
  sponsor." A dedicated `event_sponsor_access` table is the proven pattern, keeps
  the content table honest, and makes the gate read identical to badges'
  `badgeSlotPaid`. New migration
  [20261006000000_event_sponsor_access.sql](../../supabase/migrations/20261006000000_event_sponsor_access.sql).

- **Drop the 5 entitlement columns from `event_sponsors` (don't leave them dead).**
  Backfill runs first — only `access_kind='ala_carte' AND paid_at IS NOT NULL`
  rows move to the new table. Pro-authored rows carried `access_kind='pro',
paid_at NULL`; that entitlement is re-derived from `hasProBenefits(host)` at
  runtime and was never load-bearing as stored data, so dropping it loses
  nothing. `DROP COLUMN` cascades to the dependent `access_kind` CHECK and the
  payment-intent partial index. Leaving the columns as dead would invite
  re-coupling — the whole point of the fix.

- **Split the webhook write, entitlement first.** The `sponsor_slot`
  completion handler now calls `unlockSponsorSlot` (writes
  `event_sponsor_access`) **then** `upsertSponsorSlot` (now content-only). Order
  matters for intent (the unlock is the thing the host bought); both upsert on
  `event_id`, so a redelivered webhook stays idempotent. The blank-name early
  return is unchanged (the authoring form requires a name; metadata always
  carries one).

- **Removal is no longer entitlement-gated.** `removeSponsor` keeps only
  `assertCanManage` and deletes just the content row — the `event_sponsor_access`
  row survives, so a re-add is free (SP-1) and a lapsed-Pro manager can still
  delete their own sponsor (SP-2). The panel's Remove button condition dropped
  from `sponsor && canUseSponsors` to `sponsor &&` — safe because the panel only
  renders on the manager-gated edit page.

- **Domain port split into two value shapes.** `PaidSponsorSlot` is now content
  (`name/blurb/linkUrl/logoUrl/discountCode`); `PaidSponsorAccess` is the
  entitlement (`purchasedByUserId/checkoutSessionId/paymentIntentId/paidAt`),
  identical in shape to `PaidBadgeSlot`. Kept them as two named interfaces rather
  than reusing `PaidBadgeSlot` so the call sites read for what they are.

- **Entitlement reads move to the admin client.** `event_sponsor_access` has
  RLS on with **no client policies** (mirrors `event_badge_access`) — it's a
  session-less Stripe mirror (AGENTS pitfall #8). The action gate's new
  `sponsorSlotPaid` reads via `getAdminSupabase()`; the edit page already used
  the admin client for its side-loads, so it just gained one more `.maybeSingle()`.

## Tests

- Repo (`supabase-event-payment-repository.test.ts`): `upsertSponsorSlot` now
  asserts a **content-only** payload plus an explicit
  `not.toHaveProperty('access_kind' | 'paid_at')` guard (fails against the old
  coupled write); new `unlockSponsorSlot` test pins the `event_sponsor_access`
  upsert.
- Webhook (`checkout.test.ts`): the sponsor test asserts both `unlockSponsorSlot`
  (entitlement) and the content-only `upsertSponsorSlot`; the blank-name test now
  asserts **neither** is called.

`pnpm typecheck && lint && test && build` green. `database.types.ts` hand-edited
to add `event_sponsor_access` + slim `event_sponsors` (regenerate on the next
deployed `gen:types`).

## Follow-ups (deferred from the audit)

- **SP-8** — extract a shared `guardManage()` helper; the three sponsor actions
  still copy-paste a catch block that mis-reports unexpected errors as
  "unauthorized."
- **SP-9** — panel header "Sponsor slot (Pro)" still misleads free hosts who can
  buy à-la-carte.
- **SP-10** — no unit test on the server-action gate branch selection itself
  (Pro → save, free+paid → save, free+unpaid → checkout).
