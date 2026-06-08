/**
 * Shared read-projection helpers for the receipts + earnings surfaces. Both read
 * `event_payment_audit` and fold its rows into one transaction per Stripe
 * payment intent; that fold was copy-pasted across four readers with subtle
 * drift (receipts-tax R-7), so it lives here once, unit-tested (R-4).
 */

/** Minimal `event_payment_audit` shape the fold needs. */
export interface AuditLedgerRow {
  id: string;
  action: 'paid' | 'refunded';
  amount_cents: number;
  payment_intent_id: string | null;
  occurred_at: string;
}

/** Money + timing fields derived for one transaction. */
export interface LedgerTransaction {
  /** `payment_intent_id`, or a synthetic `audit:<row-id>` for off-platform / legacy rows. */
  paymentIntentId: string;
  paidCents: number;
  refundedCents: number;
  netCents: number;
  /** Earliest paid `occurred_at`; falls back to the first row seen for the key. */
  paidAt: string;
  /** Latest refunded `occurred_at`, or null when nothing was refunded. */
  refundedAt: string | null;
}

/**
 * Fold raw audit rows into one transaction per payment intent (a paid charge
 * and its refunds net out), keyed by `payment_intent_id` with a synthetic
 * `audit:<row-id>` fallback for off-platform / legacy rows.
 *
 * `project` maps a row to the per-transaction static fields (event title, city,
 * host, …), taken from the **first** row seen for each key; return `null` to
 * skip a row entirely (e.g. a missing `!inner` event join — preserves the
 * callers' `if (!r.events) continue` guard). The result is in first-seen order;
 * callers sort as they need.
 */
export function groupAuditRowsByPaymentIntent<R extends AuditLedgerRow, X extends object>(
  rows: readonly R[],
  project: (row: R) => X | null,
): Array<LedgerTransaction & X> {
  const byKey = new Map<string, LedgerTransaction & X>();
  for (const r of rows) {
    const fields = project(r);
    if (fields === null) continue;
    const key = r.payment_intent_id ?? `audit:${r.id}`;
    const existing = byKey.get(key);
    if (existing) {
      if (r.action === 'paid') {
        existing.paidCents += r.amount_cents;
        if (r.occurred_at < existing.paidAt) existing.paidAt = r.occurred_at;
      } else {
        existing.refundedCents += r.amount_cents;
        if (existing.refundedAt === null || r.occurred_at > existing.refundedAt) {
          existing.refundedAt = r.occurred_at;
        }
      }
      existing.netCents = existing.paidCents - existing.refundedCents;
    } else {
      const paidCents = r.action === 'paid' ? r.amount_cents : 0;
      const refundedCents = r.action === 'refunded' ? r.amount_cents : 0;
      const base: LedgerTransaction = {
        paymentIntentId: key,
        paidCents,
        refundedCents,
        netCents: paidCents - refundedCents,
        paidAt: r.occurred_at,
        refundedAt: r.action === 'refunded' ? r.occurred_at : null,
      };
      // `fields` (X) and the money fields are disjoint in every caller; the
      // money keys win on the off chance a projection collides.
      byKey.set(key, { ...fields, ...base } as LedgerTransaction & X);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Estimated platform fee (cents) for a net amount at a fee rate (e.g. `0.05`).
 * A deterministic estimate only — Stripe's processing fee is separate and the
 * Express dashboard is authoritative.
 */
export function estimatePlatformFeeCents(netCents: number, feeRate: number): number {
  return Math.round(netCents * feeRate);
}
