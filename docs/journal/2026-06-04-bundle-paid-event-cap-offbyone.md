# Re-running personas after the co-host deploy: a paid-event-cap off-by-one (2026-06-04)

## Context

Continuation of [2026-06-04-bundle-persona-e2e-real-bugs.md](2026-06-04-bundle-persona-e2e-real-bugs.md).
That bundle authored + fixed three P1s; this one re-ran the suite **after the
co-host `canManage` + broadcast-RLS fixes were deployed to dev**, with two
goals: confirm the deploy, and separate the remaining "failures" into flake vs.
real. Everything ran **serially** (`workers: 1`) — see below.

Net: the deploy is confirmed, almost all of the residual failures were
parallel-load flake, and **one genuine product bug** fell out of a persona that
happened to have a clean account.

## What the serial re-run settled

- **`workers: 1` is now the config default.** The whole-suite parallel run
  (4 workers) had shown ~28 failures; re-run serially, ~16 passed untouched.
  The suite **always** targets shared dev (`PLAYWRIGHT_BASE_URL`; localhost is
  Turnstile-blocked), so parallel workers overload dev's serverless + Supabase
  auth rate limits (geocode-on-create throttling, Stripe-Checkout timeouts,
  flaky logins). Override with `--workers=N` for a deliberate parallel run.
  ([playwright.config.ts](../../apps/web/playwright.config.ts))

- **Steve (co-host) is green post-deploy** — 23/23, including the co-host
  `/edit`+`/manage` access test and the co-host broadcast. The `canManage`
  repo fix + the `broadcasts_insert_event_host → is_event_host` RLS migration
  did their job.

- **The paid-event cap RPC was wrongly suspected; it's correct.** A prior note
  feared dev's `host_paid_event_count_30d` "counted UI events but not the
  `armPaidEvent` admin fixtures." Probing the **live** RPC directly with the
  cleanup service-role client disproved it: it takes `p_user_id`, and inserting
  the exact `armPaidEvent` shape (event + division with `price_cents = 1500`)
  moved the count `0 → 1`. The deployed RPC matches migration
  [20260913000000](../../supabase/migrations/20260913000000_fix_host_paid_event_count_30d_event_divisions.sql)
  (counts `event_divisions.price_cents > 0`). All six Rachel cap/subscription
  tests pass serially — the earlier "subscription flip" + "cap drift" suspicions
  were both flake.

## The real bug: free-tier paid-event cap is off-by-one on the create path

Julie (free host) failed `second paid event in 30 days is blocked by the cap`.
Unlike the parallel noise, this reproduced serially. The 2nd create **was**
blocked — but by the **Stripe-setup gate**, not the cap:

```
Expected: /paid event per 30 days|upgrade to pro/i
Received: "You need to finish Stripe setup before you can charge for events…"
```

Probing both personas with the admin client pinned it down:

| persona             | `is_pro_host`          | subs  | why it matters                                                                                                      |
| ------------------- | ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| Julie (free-host)   | `false`                | `[]`  | genuinely free — a clean account                                                                                    |
| Rachel (lapsed-pro) | `true` (active yearly) | 1 row | Stripe-onboarded; her cap test passed only because she **also** carried a leaked prior paid event padding the count |

Root cause in [events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts):
the action checks the cap, **then** writes the open-play price onto the default
division. But `host_paid_event_count_30d` counts paid events by joining
`event_divisions WHERE price_cents > 0` — so at the cap-check moment the
just-inserted open-play event is **unpriced and invisible to the count**, while
`validateHostPaidEventCap(includesCurrentEvent: true)` assumes it's already
counted (it blocks on `count > CAP`, treating CAP as the in-flight allowance).
With `CAP = 1`: a free host with **one** prior paid event has `count = 1` at
check time (current not yet counted), `1 > 1` is false → allowed. Net effect:
**free hosts could create two paid events per 30 days instead of one.**

Tournaments/leagues were never affected — they price their divisions through the
create handler _before_ this block, so the in-flight event is counted. Only
open-play set the price afterward.

Why it hid: a non-Stripe free host (Julie) is stopped by the **Stripe gate** one
check later, so the cap bypass never produced a visible second event — it only
bites a free host who **is** Stripe-onboarded. And Rachel's pre-existing leaked
paid event masked it in her suite.

### Fix

Move the open-play division price-set **above** the cap check in
[new/actions.ts](../../apps/web/src/app/events/new/actions.ts), so the in-flight
event is counted and `includesCurrentEvent: true` is accurate. Tournament/league
paths are untouched (already priced). The **edit** path
([edit/actions.ts](../../apps/web/src/app/events/[id]/edit/actions.ts)) is
correct as-is: its cap check runs only on a `curPriceCents === 0` free→paid flip,
where the division genuinely isn't priced yet, so its `includesCurrentEvent:
false` accurately reflects an uncounted current event.

The regression is the **Julie** persona e2e (`persona-julie-free-host`,
`second paid event in 30 days is blocked`). It's deploy-gated — it asserts
against dev, which still runs the old code until this ships. This is a web-layer
ordering bug in a server action (no domain/application surface to unit-test);
`validateHostPaidEventCap` itself is correct, so the e2e is the right surface.

## Second real bug: paid buyers see a stale roster (webhook cache gap)

Making the Marcus fixture self-provisioning (below) let the buy flow actually
run — and it failed, but **not** at the payment. A DB watcher running alongside
the test captured the truth:

```
[13s] event created                       participants=[]                      audit=[]
[22s] "Pay online" clicked                 participants=[{attendee, pending}]   audit=[]
[35s] checkout.session.completed webhook   participants=[{attendee, paid}]      audit=[paid]
```

Marcus is a **paid attendee in the DB within ~20s**. Yet the test's 90s UI poll
for the "Cancel sign-up" roster button never passed. Root cause: the event-detail
page side-loads (roster included) are wrapped in `unstable_cache` with a 60s TTL,
tagged `eventCacheTag(id)`
([event-detail-cache.ts](../../apps/web/src/app/events/[id]/_loaders/event-detail-cache.ts)).
**No Stripe webhook anywhere evicts that tag** — `grep` across
`lib/webhooks/` + `app/api/` for `updateTag`/`revalidatePath`/`revalidateTag`
came back empty. So `handleCheckoutCompleted` flips the payment to `paid` in the
DB but the cached page keeps serving the pre-purchase roster until the TTL lapses.

This is a real production UX bug, not just an e2e artefact: **a buyer returning
from Stripe Checkout doesn't see themselves on the roster for up to a minute.**
It's the webhook-shaped twin of AGENTS.md pattern #1 ("every mutation must
`updateTag(eventCacheTag(id))`") — the pattern was only ever applied to server
actions; the webhooks, which are the _other_ place event state mutates, were
missed. (It also explains why raising the poll to 90s wasn't enough — the stale
window isn't bounded by the 60s `unstable_cache` TTL alone once the CDN/page
render cache is layered on; the only fix is to actively evict.)

### Fix

All three event-mutating Stripe webhook handlers now evict after their writes —
`updateTag(eventCacheTag(eventId))` + `revalidatePath(\`/events/${eventId}\`)`:

- [checkout.ts](../../apps/web/src/lib/webhooks/checkout.ts)
  `handleCheckoutCompleted` (buy / team / sponsor / badge) — one eviction at the
  single fall-through exit, since every kind mutates page-cached state.
- `handleCheckoutExpired` (abandon → freed spot).
- [charge.ts](../../apps/web/src/lib/webhooks/charge.ts) `handleChargeRefunded`
  (refund → roster row deleted) — inside the `if (att)` block where `eventId` is
  known.

Done as one pattern rather than only the buy path (a partial pattern costs more
than none — AGENTS.md). `updateTag` is a valid Route-Handler primitive in Next 16
(already imported repo-wide), and every eviction is **wrapped in try/catch +
`log.warn`** so a revalidation hiccup can never fail the webhook → trigger a
Stripe retry / duplicate processing. Both unit suites mock `next/cache` inert
(the eviction is plumbing the e2e validates, not unit behaviour — AGENTS.md).
Deploy-gated: the Marcus buy + refund-inside e2es confirm it post-deploy.

## Also in this bundle

- **Marcus Stripe fixture is self-provisioning now.** The stripe-host is
  Stripe-onboarded but free-tier, and the 30d cap is status-agnostic (a
  cancelled event still occupies the slot), so every prior Stripe run left it
  permanently capped. `withStripeHostPaidEvent` now flips it to Pro just-in-time
  via the `host-subscription` admin helper (`setHostSubscriptionStatus(active)`)
  and restores in `finally` — no manual provisioning. Falls back to the
  cap-block skip when the admin client is unset.
  ([persona-marcus-buyer.authed.spec.ts](../../apps/web/tests/e2e/persona-marcus-buyer.authed.spec.ts))
  Running it confirmed the flip works **and** the stripe-host's Connect account
  has `charges_enabled`: the test cleared `createPaidEvent` (uncapped) →
  Checkout (`4242`) → redirect, failing only at the first webhook `pollUiFor`.

- **Stripe webhook poll default raised 45s → 90s.** A correct robustness
  improvement (the bundle-96 tip-jar test documented dev cold-start webhook
  latency >45s), though _not_ what fixed the buy test — that was the cache
  eviction above. Since [`pollUiFor`](../../apps/web/tests/e2e/_helpers/stripe.ts)
  exists **only** to wait on webhook-driven UI mutations, 90s is now its default
  (a satisfied condition still returns on the first check, so passing polls don't
  slow down). The buy + refund-inside Marcus tests bumped to a 240s case timeout
  to fit two to three sequential 90s polls on a cold env.

## Follow-ups

- **Deploy the cap fix + the webhook cache eviction**, then the Julie cap e2e
  and the Marcus buy e2e go green on dev. Both are deploy-gated (assert against
  dev).
- **Promote the webhook-eviction rule.** All three handlers are fixed, but the
  rule — _webhook-driven mutations must evict the event cache, exactly like
  mutating server actions_ — deserves a sibling line to AGENTS.md pattern #1 so
  the next webhook author doesn't re-introduce the gap. The **team-refund**
  branches in `handleChargeRefunded` (`refundTeamRegistrationIfAny` /
  `refundRosterTeamPaymentIfAny`, lines 79–80) still don't evict — they don't
  surface `event_id` without an extra lookup; low priority (team refunds are
  rarer) but the same class.
- **Mark CSV statement test** still skips: it needs Mark's **pro-host** account
  Stripe-Connect-onboarded on dev (his CSV must reflect a paid event _he_ hosts;
  the stripe-host's events won't appear). One-time manual Stripe test-mode
  onboarding for `TEST_PRO_HOST_EMAIL`.
- **Leaked-fixture hygiene:** Rachel carried a residual paid event (count 1
  after a clean run) — the cap arms/cleanups mostly work, but the >1h teardown
  sweep is the only backstop for a same-run leak. Not worth a fixture rework
  yet; noted so the next cap-debugging session expects it.
