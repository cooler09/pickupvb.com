/**
 * Pure helpers for recurring host memberships (ADR 0037 Phase 2). No DB /
 * framework imports so they unit-test in isolation. The "is active" rule mirrors
 * the `is_active_member` SQL (and `is_pro_host` — monetization M-2): trialing /
 * active always count; past_due counts only within a 30-day grace past the
 * current period end, so an abandoned past_due subscription can't grant access
 * forever if Stripe dunning is misconfigured.
 */

const PAST_DUE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type MembershipStatusFields = {
  status: string;
  currentPeriodEnd: string | null;
};

export function isMembershipActive(m: MembershipStatusFields, nowMs: number): boolean {
  if (m.status === 'trialing' || m.status === 'active') return true;
  if (m.status === 'past_due' && m.currentPeriodEnd) {
    const endMs = new Date(m.currentPeriodEnd).getTime();
    if (Number.isFinite(endMs)) return endMs > nowMs - PAST_DUE_GRACE_MS;
  }
  return false;
}
