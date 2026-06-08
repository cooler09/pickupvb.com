import 'server-only';
import { getAdminSupabase } from './supabase-admin';

/**
 * A group's own Stripe Connect (Express) payout account (ADR 0038 Club tier).
 * Mirror of `host-stripe-account.ts` but keyed by `group_id`. All reads/writes
 * go through the admin client: `group_stripe_accounts` has no write RLS (the
 * onboarding action + `account.updated` webhook own writes) and the payout
 * resolver must read it for buyers who aren't group admins.
 */

export type GroupStripeAccount = {
  groupId: string;
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

type Row = {
  group_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

const COLS = 'group_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted';

function map(r: Row): GroupStripeAccount {
  return {
    groupId: r.group_id,
    accountId: r.stripe_account_id,
    chargesEnabled: r.charges_enabled,
    payoutsEnabled: r.payouts_enabled,
    detailsSubmitted: r.details_submitted,
  };
}

export async function getGroupStripeAccountStatus(
  groupId: string,
): Promise<GroupStripeAccount | null> {
  const { data } = await getAdminSupabase()
    .from('group_stripe_accounts')
    .select(COLS)
    .eq('group_id', groupId)
    .maybeSingle();
  return data ? map(data as Row) : null;
}

/** The Connect `acct_…` id, but only when `charges_enabled` — i.e. the account
 * can actually receive a destination charge. Null otherwise. */
export async function getGroupStripeAccount(groupId: string): Promise<string | null> {
  const account = await getGroupStripeAccountStatus(groupId);
  if (!account || !account.chargesEnabled) return null;
  return account.accountId;
}

export async function createGroupStripeAccount(groupId: string, accountId: string): Promise<void> {
  await getAdminSupabase()
    .from('group_stripe_accounts')
    .insert({ group_id: groupId, stripe_account_id: accountId });
}

export async function updateGroupStripeAccountStatusByGroup(
  groupId: string,
  status: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean },
): Promise<void> {
  await getAdminSupabase()
    .from('group_stripe_accounts')
    .update({
      charges_enabled: status.chargesEnabled,
      payouts_enabled: status.payoutsEnabled,
      details_submitted: status.detailsSubmitted,
    })
    .eq('group_id', groupId);
}

/** Mirror an `account.updated` webhook into the matching group row. Returns true
 * when a row matched (i.e. this is a group-owned Connect account). */
export async function mirrorGroupStripeAccountUpdate(
  accountId: string,
  status: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean },
): Promise<boolean> {
  const { data } = await getAdminSupabase()
    .from('group_stripe_accounts')
    .update({
      charges_enabled: status.chargesEnabled,
      payouts_enabled: status.payoutsEnabled,
      details_submitted: status.detailsSubmitted,
    })
    .eq('stripe_account_id', accountId)
    .select('group_id');
  return ((data as { group_id: string }[] | null)?.length ?? 0) > 0;
}
