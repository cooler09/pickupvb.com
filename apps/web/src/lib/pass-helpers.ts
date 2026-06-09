/**
 * Pure helpers for season passes (ADR 0037). No DB / framework imports so they
 * unit-test in isolation — the credit-accounting and expiry rules live here,
 * the SQL just enforces the same invariants under concurrency.
 */

/** Credits a buyer can still redeem. Never negative even if the counter drifts. */
export function creditsRemaining(creditsTotal: number, creditsUsed: number): number {
  return Math.max(0, creditsTotal - creditsUsed);
}

/**
 * When a purchase's credits expire, given the pass's `expires_in_days`. Returns
 * null when the pass never expires (`expiresInDays == null`). Computed from the
 * paid-at instant so the clock starts at payment, not at create.
 */
export function computePassExpiresAt(
  paidAtIso: string,
  expiresInDays: number | null,
): string | null {
  if (expiresInDays == null) return null;
  const paidMs = new Date(paidAtIso).getTime();
  if (!Number.isFinite(paidMs)) return null;
  return new Date(paidMs + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
}

/** True once the purchase's credits have expired. A null expiry never expires. */
export function isPassExpired(expiresAtIso: string | null, nowMs: number): boolean {
  if (!expiresAtIso) return false;
  const expMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expMs)) return false;
  return expMs <= nowMs;
}

export type PassBalance = {
  creditsTotal: number;
  creditsUsed: number;
  paymentStatus: string;
  expiresAt: string | null;
};

/** A purchase is redeemable when it's paid, has credits left, and isn't expired. */
export function isPassRedeemable(balance: PassBalance, nowMs: number): boolean {
  return (
    balance.paymentStatus === 'paid' &&
    creditsRemaining(balance.creditsTotal, balance.creditsUsed) > 0 &&
    !isPassExpired(balance.expiresAt, nowMs)
  );
}

/** Per-session value of a pass, in cents — for "$8 / session" display copy. */
export function perSessionCents(priceCents: number, creditCount: number): number {
  if (creditCount <= 0) return priceCents;
  return Math.round(priceCents / creditCount);
}
