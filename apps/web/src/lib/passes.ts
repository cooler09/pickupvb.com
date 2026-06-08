import 'server-only';
import { getServerSupabase } from './supabase';
import { creditsRemaining, isPassRedeemable } from './pass-helpers';

/**
 * Season-pass read facade (ADR 0037). Thin wrapper over Supabase reads, kept in
 * `apps/web/src/lib` so pages can list passes / balances without threading a
 * repo through — same facade-over-port shape as `pro.ts` (AGENTS pattern #10).
 * There is no aggregate invariant to protect; the credit-accounting invariant
 * lives in SQL (the `redeem_pass_credit` RPC + the credits_used counter). Writes
 * are server actions ([pass-actions.ts]) + the Stripe webhook; this file is reads.
 */

export type HostPass = {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  creditCount: number;
  priceCents: number;
  expiresInDays: number | null;
  status: 'active' | 'archived';
  createdAt: string;
};

export type PassPurchase = {
  id: string;
  passId: string;
  hostId: string;
  titleSnapshot: string;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  expiresAt: string | null;
  paymentStatus: string;
  paidAt: string | null;
  createdAt: string;
};

type HostPassRow = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  credit_count: number;
  price_cents: number;
  expires_in_days: number | null;
  status: string;
  created_at: string;
};

type PassPurchaseRow = {
  id: string;
  pass_id: string;
  host_id: string;
  title_snapshot: string;
  credits_total: number;
  credits_used: number;
  expires_at: string | null;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
};

const HOST_PASS_COLS =
  'id, host_id, title, description, credit_count, price_cents, expires_in_days, status, created_at';
const PURCHASE_COLS =
  'id, pass_id, host_id, title_snapshot, credits_total, credits_used, expires_at, payment_status, paid_at, created_at';

function mapHostPass(row: HostPassRow): HostPass {
  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    description: row.description,
    creditCount: row.credit_count,
    priceCents: row.price_cents,
    expiresInDays: row.expires_in_days,
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: row.created_at,
  };
}

function mapPurchase(row: PassPurchaseRow): PassPurchase {
  return {
    id: row.id,
    passId: row.pass_id,
    hostId: row.host_id,
    titleSnapshot: row.title_snapshot,
    creditsTotal: row.credits_total,
    creditsUsed: row.credits_used,
    creditsRemaining: creditsRemaining(row.credits_total, row.credits_used),
    expiresAt: row.expires_at,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

/** Active passes a host is selling — buyer-facing (RLS exposes active rows). */
export async function listActiveHostPasses(hostId: string): Promise<HostPass[]> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_passes')
    .select(HOST_PASS_COLS)
    .eq('host_id', hostId)
    .eq('status', 'active')
    .order('price_cents', { ascending: true });
  return ((data as HostPassRow[] | null) ?? []).map(mapHostPass);
}

/** A host's own passes (active + archived) for the management page. */
export async function listOwnHostPasses(hostId: string): Promise<HostPass[]> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_passes')
    .select(HOST_PASS_COLS)
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });
  return ((data as HostPassRow[] | null) ?? []).map(mapHostPass);
}

/** One pass by id (any status). Used to snapshot title/price/credits at purchase. */
export async function getHostPass(passId: string): Promise<HostPass | null> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('host_passes')
    .select(HOST_PASS_COLS)
    .eq('id', passId)
    .maybeSingle();
  return data ? mapHostPass(data as HostPassRow) : null;
}

/** A buyer's paid purchases (all hosts), newest first — for /profile/passes. */
export async function listBuyerPasses(buyerUserId: string): Promise<PassPurchase[]> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('pass_purchases')
    .select(PURCHASE_COLS)
    .eq('buyer_user_id', buyerUserId)
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: false });
  return ((data as PassPurchaseRow[] | null) ?? []).map(mapPurchase);
}

/**
 * The buyer's purchases for a specific host that are redeemable right now
 * (paid, credits left, not expired). Drives the "Use a pass credit" affordance
 * on an eligible event.
 */
export async function getRedeemablePassesForHost(
  buyerUserId: string,
  hostId: string,
  nowMs: number,
): Promise<PassPurchase[]> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('pass_purchases')
    .select(PURCHASE_COLS)
    .eq('buyer_user_id', buyerUserId)
    .eq('host_id', hostId)
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: true });
  return ((data as PassPurchaseRow[] | null) ?? []).map(mapPurchase).filter((p) =>
    isPassRedeemable(
      {
        creditsTotal: p.creditsTotal,
        creditsUsed: p.creditsUsed,
        paymentStatus: p.paymentStatus,
        expiresAt: p.expiresAt,
      },
      nowMs,
    ),
  );
}

/** Gross pass revenue collected by a host (buyer-paid totals), for the mgmt page. */
export async function hostPassRevenue(
  hostId: string,
): Promise<{ count: number; grossCents: number }> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('pass_purchases')
    .select('amount_paid_cents')
    .eq('host_id', hostId)
    .eq('payment_status', 'paid');
  const rows = (data as { amount_paid_cents: number | null }[] | null) ?? [];
  return {
    count: rows.length,
    grossCents: rows.reduce((sum, r) => sum + (r.amount_paid_cents ?? 0), 0),
  };
}
