/**
 * Pure cost-splitting logic for the free cost-split tool
 * (`/tools/cost-split`). Splits a total across attendees, evenly or by share
 * weights, in integer **cents** so the per-person amounts always sum back to
 * the exact total (largest-remainder rounding). Reuses the shared roster parse
 * ([`../../_lib/roster.ts`](../../_lib/roster.ts)) — the optional trailing
 * number on a line is read as a share weight here.
 *
 * Fully deterministic (no randomness), so callers can derive results live in
 * render.
 */

import { parseRoster } from '../../_lib/roster.js';

export type Person = { name: string; shares: number };
export type Allocation = { name: string; shares: number; cents: number };

/** Dollars (possibly fractional) → integer cents. */
export function toCents(dollars: number): number {
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

/**
 * Parse pasted attendees — one per line, optional trailing number read as a
 * **share weight** (default 1; negatives clamped to 0, so "Alex 0" pays
 * nothing). "Sam 2" means Sam covers two shares.
 */
export function parsePeople(raw: string): Person[] {
  return parseRoster(raw).map((p) => ({
    name: p.name,
    shares: p.rating === undefined ? 1 : Math.max(0, p.rating),
  }));
}

/**
 * Split `totalCents` across `people` by share weight. Each person gets the
 * floor of their exact share; the leftover cents go to the largest fractional
 * remainders, so the allocations always sum to exactly `totalCents`.
 */
export function splitCost(totalCents: number, people: readonly Person[]): Allocation[] {
  if (people.length === 0) return [];
  const totalShares = people.reduce((sum, p) => sum + p.shares, 0);
  if (totalShares <= 0 || totalCents <= 0) {
    return people.map((p) => ({ name: p.name, shares: p.shares, cents: 0 }));
  }

  const raw = people.map((p) => (totalCents * p.shares) / totalShares);
  const cents = raw.map((r) => Math.floor(r));
  const remainder = totalCents - cents.reduce((sum, c) => sum + c, 0);

  // Hand the leftover cents to the largest fractional parts (fair rounding).
  const byFrac = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    const target = byFrac[k % byFrac.length];
    if (target) cents[target.i] = (cents[target.i] ?? 0) + 1;
  }

  return people.map((p, i) => ({ name: p.name, shares: p.shares, cents: cents[i] ?? 0 }));
}

/** Sum of all allocated cents — equals the input total when shares > 0. */
export function allocationTotal(allocations: readonly Allocation[]): number {
  return allocations.reduce((sum, a) => sum + a.cents, 0);
}

/** True if any attendee carries a non-default share weight. */
export function hasUnevenShares(people: readonly Person[]): boolean {
  return people.some((p) => p.shares !== 1);
}

/** Format integer cents as a "$0.00" string. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Render the split as a plain-text block for the "Copy" button. */
export function formatCostText(allocations: readonly Allocation[]): string {
  return allocations.map((a) => `${a.name}: ${formatCents(a.cents)}`).join('\n');
}
