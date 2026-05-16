# Stripe webhooks

The handler at [`apps/web/src/app/api/webhooks/stripe/route.ts`](../apps/web/src/app/api/webhooks/stripe/route.ts)
consumes a fixed set of events. Configure your webhook endpoint in the Stripe
Dashboard to deliver exactly these — extra events are ignored but waste quota
and cloud the logs.

## Endpoint

- **URL:** `https://<your-domain>/api/webhooks/stripe`
- **Signing secret env var:** `STRIPE_WEBHOOK_SECRET`
- **Connect:** the same endpoint must have **"Listen to events on Connected
  accounts"** toggled **on**. The handler dispatches both platform and Connect
  events from a single endpoint / single signing secret.

## Required events

### Platform account events

| Event | Purpose |
|---|---|
| `checkout.session.completed` | Confirms RSVPs, writes ticket purchase row |
| `checkout.session.expired` | Releases reserved seats |
| `charge.refunded` | Removes attendee, writes audit row, fires `payment.refunded` notification |
| `payment_intent.payment_failed` | Payment failure handling |
| `customer.subscription.created` | Subscription provisioning |
| `customer.subscription.updated` | Subscription state changes |
| `customer.subscription.deleted` | Subscription cancellation |

### Connect events

These fire on connected hosts' accounts; `event.account` is set to the
`acct_…` id.

| Event | Purpose |
|---|---|
| `account.updated` | Connect onboarding status changes (charges_enabled, payouts_enabled, requirements) |
| `payout.paid` | Fires `host.payout.paid` notification to the host |

## Notes

- Adding a new event type? Add a `case` in the `switch (event.type)` block in
  the route handler, then update this doc.
- If you ever split platform vs. Connect into two endpoints, you'll need a
  second signing-secret env var; the current code assumes one.
- Idempotency is enforced by inserting `event.id` into the
  `stripe_webhook_events` table before dispatch — re-deliveries are no-ops.
