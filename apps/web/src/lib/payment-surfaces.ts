/**
 * Per-surface kill switches for the two destination-charge surfaces — tips and
 * paid tickets.
 *
 * Both route money through `createDestinationCheckoutSession`, which creates the
 * charge on the **platform** account (`transfer_data.destination`, no
 * `on_behalf_of`). PickupVB is therefore the merchant of record: a chargeback
 * debits *our* balance plus the dispute fee, not the connected account's — while
 * `transfer_data` has already moved the funds out to the host. That asymmetry is
 * why these surfaces need a switch that can be thrown without writing code under
 * pressure.
 *
 * Deliberately **no `server-only` import** — same reasoning as
 * `rate-limit-key.ts`: this stays a pure, unit-testable env read. Neither
 * variable carries a `NEXT_PUBLIC_` prefix, so Next never inlines them into the
 * client bundle; call these from server code only and pass the result down as a
 * prop (see `TipJar`'s `tippingEnabled`).
 *
 * Context: `.scratch/tip-fraud-response/map.md`.
 */

/**
 * Tips: **opt-in**. Enabled only when `TIPS_ENABLED` is exactly `'true'`.
 *
 * Default-off is the entire point of the switch — it makes the *deploy* the fix.
 * The inverse shape (on by default, killed by a `TIPS_DISABLED` var) takes two
 * correct steps to stop an active abuse, and forgetting the second ships a
 * deploy that looks like a fix while money keeps moving. A missing, empty, or
 * misspelled value can only fail closed.
 *
 * Do not "tidy" this into a truthy check. `Boolean(process.env[...])` would make
 * `TIPS_ENABLED=false` mean *enabled*.
 */
export function isTippingEnabled(): boolean {
  return process.env['TIPS_ENABLED'] === 'true';
}

/**
 * Paid tickets: **opt-out**. Disabled only when `TICKET_CHECKOUT_DISABLED` is
 * exactly `'true'`.
 *
 * This knowingly inverts the default-off rule above. Ticket sales are the actual
 * business — bounded by event capacity and carrying the 5% platform fee — so
 * taking them offline is a deliberate act, performed if the abuse migrates off
 * tips, not a side effect of deploying this module.
 *
 * The asymmetric *names* are load-bearing: whoever reads the Vercel env list
 * should be able to tell the opt-in (`TIPS_ENABLED`) from the kill switch
 * (`TICKET_CHECKOUT_DISABLED`) without opening this file.
 */
export function isTicketCheckoutEnabled(): boolean {
  return process.env['TICKET_CHECKOUT_DISABLED'] !== 'true';
}
