/**
 * Exposure caps for **unproven host accounts** — the anti-abuse posture decided
 * in `.scratch/tip-fraud-response/issues/07-host-vetting-bar.md`.
 *
 * Why caps rather than a signup gate: in the 2026-09-14→17 card-testing
 * incident the operator went from signup to charging stolen cards in **8–10
 * minutes, three times over**, and cleared every identity check on the way —
 * email verification passed in under a minute using iCloud Hide My Email
 * aliases, and Stripe's own KYC (`details_submitted`) completed in 25–62
 * seconds. Identity vetting is therefore not an available control; it is the
 * control we already had.
 *
 * What the operator cannot rotate cheaply is **account age** and **charge
 * attempts against a single event**. Those are the two axes here. Note it is
 * explicitly NOT IP: the 20/hr per-IP limit on guest checkout worked correctly
 * and they simply rotated IPs (~58 throwaway anon sessions in 110 minutes), so
 * adding IP-keyed limits buys nothing.
 *
 * Pure + dependency-free on purpose, so it stays unit-testable — same reasoning
 * as `rate-limit-key.ts`. The impure half lives in `new-host-limits.ts`.
 */

/** Below this age, a host account is "unproven" and its events are capped. */
export const NEW_HOST_WINDOW_DAYS = 7;

/**
 * Checkout sessions a single event may open per hour while its host is
 * unproven.
 *
 * Calibration: the attack opened **27–30 paid sessions per event within about
 * an hour**; a genuine first-time host fills an open play with roughly 8–12
 * signups spread over days. Five per hour sits an order of magnitude below the
 * attack and well above organic demand — even a popular event hitting it is
 * only delayed, not refused.
 */
export const NEW_HOST_EVENT_CHECKOUTS_PER_HOUR = 5;

/** Daily ceiling for the same event, so the hourly cap can't just be waited out. */
export const NEW_HOST_EVENT_CHECKOUTS_PER_DAY = 20;

/**
 * Is this host account still inside the unproven window?
 *
 * `now` is injected rather than read from the clock so this stays pure and
 * testable, and so it can't trip the repo's React-Compiler purity rule if it is
 * ever pulled into a render path.
 *
 * **Fails closed.** A missing or unparseable `createdAt` is treated as new: the
 * cost of capping a legitimate established host at 5 checkouts/hour is a short
 * delay, while the cost of waving through an account we cannot age is the
 * incident this module exists to prevent.
 */
export function isNewHostAccount(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return true;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  const ageMs = now.getTime() - created;
  // A createdAt in the future is nonsense — treat it as new rather than trusting it.
  if (ageMs < 0) return true;
  return ageMs < NEW_HOST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
