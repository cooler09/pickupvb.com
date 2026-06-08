'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { ValidationError, assertCleanName, maskPublicText } from '@pickupvb/domain';
import { requireRealUser } from '@/lib/server-auth';
import { hasProBenefits } from '@/lib/admin';
import { getServerSupabase } from '@/lib/supabase';
import { field, fieldOrNull } from '@/lib/form-data';
import { parsePriceCents } from '@/lib/money';

/**
 * Host-side recurring membership-plan management (ADR 0037 Phase 2). Selling
 * memberships is Pro-only (net-new — no clawback); enforced here via
 * `hasProBenefits`, mirroring passes / sponsor / badge slots. RLS on
 * `host_membership_plans` enforces ownership; this layer authorizes "may sell at
 * all" + validates input ranges (which mirror the DB CHECKs).
 */

const MANAGE_PATH = '/profile/billing/memberships';

function flash(code: string, msg?: string): never {
  const params = new URLSearchParams({ membership: code });
  if (msg) params.set('membership_msg', msg);
  redirect(`${MANAGE_PATH}?${params.toString()}` as Route);
}

export async function createMembershipPlanFromForm(
  _returnPath: string,
  formData: FormData,
): Promise<never> {
  const { user } = await requireRealUser(MANAGE_PATH);
  if (!(await hasProBenefits(user.id))) flash('pro');

  const rawTitle = field(formData, 'title');
  if (!rawTitle) flash('invalid', 'A plan title is required.');
  let title: string;
  try {
    title = assertCleanName(rawTitle);
  } catch (err) {
    if (err instanceof ValidationError) flash('invalid', 'Please choose a cleaner title.');
    flash('invalid', 'Invalid title.');
  }

  const rawDesc = fieldOrNull(formData, 'description', 280);
  const description = rawDesc ? maskPublicText(rawDesc) : null;

  const priceCents = parsePriceCents(field(formData, 'price_usd'));
  if (priceCents < 100 || priceCents > 1_000_000) {
    flash('invalid', 'Price must be between $1 and $10,000.');
  }

  const sb = await getServerSupabase();
  const { error } = await sb.from('host_membership_plans').insert({
    host_id: user.id,
    title,
    description,
    price_cents: priceCents,
  });
  if (error) flash('error', error.message);

  revalidatePath(MANAGE_PATH);
  flash('saved');
}

/** Stop selling a plan. Existing members keep their subscription until they cancel. */
export async function archiveMembershipPlan(planId: string, _formData: FormData): Promise<never> {
  const { user } = await requireRealUser(MANAGE_PATH);
  const sb = await getServerSupabase();
  const { error } = await sb
    .from('host_membership_plans')
    .update({ status: 'archived' })
    .eq('id', planId)
    .eq('host_id', user.id);
  if (error) flash('error', error.message);
  revalidatePath(MANAGE_PATH);
  flash('archived');
}

export async function reactivateMembershipPlan(
  planId: string,
  _formData: FormData,
): Promise<never> {
  const { user } = await requireRealUser(MANAGE_PATH);
  if (!(await hasProBenefits(user.id))) flash('pro');
  const sb = await getServerSupabase();
  const { error } = await sb
    .from('host_membership_plans')
    .update({ status: 'active' })
    .eq('id', planId)
    .eq('host_id', user.id);
  if (error) flash('error', error.message);
  revalidatePath(MANAGE_PATH);
  flash('reactivated');
}
