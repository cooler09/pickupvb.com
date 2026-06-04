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

## The Stripe buy/roster failures: a collapsed `<details>` + a consent overlay

> **Correction (2026-06-04, post-deploy).** An earlier draft of this entry
> blamed a _webhook cache gap_ (no Stripe webhook evicts `eventCacheTag`) and
> shipped a fix that adds `updateTag`/`revalidatePath` to the checkout / refund /
> expired handlers. **That diagnosis was wrong** and the fix changed nothing for
> these tests. Deploying it left all four Stripe roster tests (Marcus buy +
> refund-inside + refund-outside, Mark CSV) still red on the **same** poll. The
> section below is the real cause; the webhook-eviction code is kept only as
> incidental cache hygiene for sponsor/badge purchases (see Follow-ups).

The DB was always correct — a watcher proved the participant goes `pending →
paid` within ~20s, and `getDetail` (the **uncached**, admin-client read that
computes `isAttending`) returns the attendee fine (verified by replaying its
exact query). The roster button simply wasn't _findable_ in the UI, for two
stacked reasons:

1. **The "Sign up" panel is a native `<details>` that auto-collapses once you're
   signed up.** [event-signup-area.tsx](../../apps/web/src/app/events/[id]/_components/event-signup-area.tsx)
   computes `defaultOpen = !viewerSignedUp` — correct UX (collapse the CTA after
   you're in), but it puts the "Cancel sign-up" button inside a collapsed
   disclosure, so Playwright's visible-only `getByRole(...).count()` returns 0.

2. **The diagnostic that should have caught this hung.** A first fix expanded the
   section by **clicking the `<summary>`** — but the analytics **consent banner**
   ("Accept"/"Decline") overlays the page, so the click waited on actionability
   and hung to the 240s test timeout. The failure screenshot, frozen mid-hang on
   an early iteration, showed "Pay online" and sent the investigation chasing a
   phantom `isAttending: false`.

### Fix

A shared [`expandSignupSection(page)`](../../apps/web/tests/e2e/_helpers/stripe.ts)
helper force-opens the disclosure via the DOM —
`details.evaluate((el) => (el.open = true))` — rather than clicking, so the
consent overlay can't intercept it. It's a no-op when the section is already
open or absent (free events, signed-out views). Applied to every spot that looks
for the post-signup "Cancel sign-up" / "Cancel sign-up & refund" control across
`persona-marcus-buyer`, `persona-mark-pro-host`, and `event-attendance` (the two
negative `count == 0` asserts get it too, so they assert an _absent_ button
rather than a merely _hidden_ one). With it, all four roster tests pass on dev —
**no deploy needed** (it's a test-only change). The product behaviour was correct
the whole time.

### The same collapse hit tournament/league registration (+ two fixture bugs)

The disclosure isn't just open-play. The tournament/league "Register" panel uses
`defaultOpen = !viewerRegistered`, and `viewerRegistered` counts **captaining a
team** (`event.viewerCaptainedTeams`) — so it defaults collapsed for any captain
(Adam P9, Bianca P10) and for a free agent already in the pool (Tyler P11),
hiding the "Register a team" / "Sign up solo" radios and the team picker. Same
120s hang. Broadened `expandSignupSection` to match the "Register" summary
(`/sign up|register/i`) and applied it across `persona-adam-captain`,
`persona-bianca-captain`, and `persona-tyler-free-agent`.

Two fixture bugs hid behind it (`_helpers/league.ts`):

1. **No free-agent tab.** The league fixture's division never set
   `allow_free_agents`, so `freeAgentEnabled` was false and the "Sign up solo"
   radio never rendered — added `allow_free_agents: true` (the roster-tournament
   fixture already had it).
2. **Signups closed.** The fixture starts the event **1h in the past** (in-season,
   for the schedule UI), so `signupsOpen` (`!hasStarted`) was false and the whole
   register section was absent — the page showed a "Schedule" section instead.
   Added an `upcoming` option (future start) so the registration flows get an
   open signup section while the schedule specs keep the in-season default.

All three persona-captain/free-agent registration tests pass on dev.

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
  Checkout (`4242`) → redirect, failing only at the (collapsed-`<details>`)
  roster poll.

- **Stripe webhook poll default raised 45s → 90s.** A correct robustness
  improvement (the bundle-96 tip-jar test documented dev cold-start webhook
  latency >45s), though _not_ what fixed the roster tests — that was
  `expandSignupSection`. Since [`pollUiFor`](../../apps/web/tests/e2e/_helpers/stripe.ts)
  exists **only** to wait on webhook-driven UI mutations, 90s is now its default
  (a satisfied condition still returns on the first check, so passing polls don't
  slow down).

## Follow-ups

- **Deploy the cap fix** → the Julie cap e2e goes green on dev (the roster fix is
  test-only and already green).
- **Decide on the webhook cache-eviction code.** It was shipped on the wrong
  diagnosis and does **nothing** for the roster tests (`getDetail`/`isAttending`
  is an uncached fresh read). It _is_ still correct, if minor, hygiene for the
  **sponsor_slot / badge_slot** checkout kinds — those mutate genuinely-cached
  side-loads (`loadEventSponsorCached`, `loadEventBadgesCached`). Keep it for
  that, or revert it to keep the payment path lean — either is defensible; it's
  not load-bearing.
- **Mark persona repointed (resolved).** The `mark` persona pointed at
  `…+pro-host@gmail.com` (Pro, _no_ Stripe Connect account), but the spec is
  titled "Mark Delgado" — a real, separate dev account `…+mark@gmail.com` that's
  **both** Pro **and** Stripe-Connect-onboarded (`acct_…`, `charges_enabled`).
  Fixed by pointing `TEST_PRO_HOST_EMAIL` → `…+mark@gmail.com` in `.env.local`
  (verified `+mark` signs in with `TEST_USER_PASSWORD`). Result: persona-mark is
  green except a flaky 5s `waitFor` in the sponsor-logo upload (unrelated).
  (Aside: the local `.env.local` carried a **live** Stripe key — swapped to the
  sandbox key; it never touched the e2e, which use deployed dev's test key.)
- **Leaked-fixture hygiene:** Rachel carried a residual paid event (count 1
  after a clean run) — the cap arms/cleanups mostly work, but the >1h teardown
  sweep is the only backstop for a same-run leak. Not worth a fixture rework
  yet; noted so the next cap-debugging session expects it.
