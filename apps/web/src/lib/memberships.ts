import 'server-only';
import { getServerSupabase } from './supabase';
import { isMembershipActive } from './membership-helpers';

/**
 * Recurring host-membership read facade (ADR 0037 Phase 2). Thin Supabase reads,
 * same facade-over-port shape as `pro.ts` / `passes.ts` (AGENTS pattern #10) —
 * no aggregate invariant (status is mirrored from Stripe). Writes are server
 * actions + the subscription webhook; this file is reads.
 */

export type MembershipPlan = {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  priceCents: number;
  status: 'active' | 'archived';
  createdAt: string;
};

export type Membership = {
  id: string;
  planId: string;
  hostId: string;
  titleSnapshot: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
};

type PlanRow = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  status: string;
  created_at: string;
};

type MembershipRow = {
  id: string;
  plan_id: string;
  host_id: string;
  title_snapshot: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

const PLAN_COLS = 'id, host_id, title, description, price_cents, status, created_at';
const MEMBERSHIP_COLS =
  'id, plan_id, host_id, title_snapshot, status, current_period_end, cancel_at_period_end';

function mapPlan(row: PlanRow): MembershipPlan {
  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    description: row.description,
    priceCents: row.price_cents,
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: row.created_at,
  };
}

function mapMembership(row: MembershipRow, nowMs: number): Membership {
  return {
    id: row.id,
    planId: row.plan_id,
    hostId: row.host_id,
    titleSnapshot: row.title_snapshot,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    isActive: isMembershipActive(
      { status: row.status, currentPeriodEnd: row.current_period_end },
      nowMs,
    ),
  };
}

/** Active plans a host is selling — buyer-facing (RLS exposes active rows). */
export async function listActiveMembershipPlans(hostId: string): Promise<MembershipPlan[]> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_membership_plans')
    .select(PLAN_COLS)
    .eq('host_id', hostId)
    .eq('status', 'active')
    .order('price_cents', { ascending: true });
  return ((data as PlanRow[] | null) ?? []).map(mapPlan);
}

/** A host's own plans (active + archived) for the management page. */
export async function listOwnMembershipPlans(hostId: string): Promise<MembershipPlan[]> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_membership_plans')
    .select(PLAN_COLS)
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });
  return ((data as PlanRow[] | null) ?? []).map(mapPlan);
}

export async function getMembershipPlan(planId: string): Promise<MembershipPlan | null> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_membership_plans')
    .select(PLAN_COLS)
    .eq('id', planId)
    .maybeSingle();
  return data ? mapPlan(data as PlanRow) : null;
}

/** The member's memberships (all hosts) for /profile/passes. */
export async function listMemberMemberships(
  memberUserId: string,
  nowMs: number,
): Promise<Membership[]> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_memberships')
    .select(MEMBERSHIP_COLS)
    .eq('member_user_id', memberUserId)
    .order('created_at', { ascending: false });
  return ((data as MembershipRow[] | null) ?? []).map((r) => mapMembership(r, nowMs));
}

/** The member's active membership to a specific host, if any (drives PassPanel). */
export async function getActiveMembershipForHost(
  memberUserId: string,
  hostId: string,
  nowMs: number,
): Promise<Membership | null> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_memberships')
    .select(MEMBERSHIP_COLS)
    .eq('member_user_id', memberUserId)
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });
  const rows = (data as MembershipRow[] | null) ?? [];
  for (const r of rows) {
    const m = mapMembership(r, nowMs);
    if (m.isActive) return m;
  }
  return null;
}

/** Active-member count + monthly gross for a host's management page. */
export async function hostMembershipStats(
  hostId: string,
  nowMs: number,
): Promise<{ activeMembers: number; monthlyGrossCents: number }> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_memberships')
    .select('status, current_period_end, plan:host_membership_plans!inner(price_cents)')
    .eq('host_id', hostId);
  type Row = {
    status: string;
    current_period_end: string | null;
    plan: { price_cents: number } | null;
  };
  const rows = (data as Row[] | null) ?? [];
  let activeMembers = 0;
  let monthlyGrossCents = 0;
  for (const r of rows) {
    if (isMembershipActive({ status: r.status, currentPeriodEnd: r.current_period_end }, nowMs)) {
      activeMembers += 1;
      monthlyGrossCents += r.plan?.price_cents ?? 0;
    }
  }
  return { activeMembers, monthlyGrossCents };
}
