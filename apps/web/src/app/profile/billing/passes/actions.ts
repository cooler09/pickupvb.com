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
 * Host-side season-pass management (ADR 0037). Creating/selling passes is a
 * Pro-only capability (net-new — no clawback); enforced here in the action via
 * `hasProBenefits`, mirroring the sponsor/badge slots. RLS on `host_passes`
 * enforces ownership (host_id = auth.uid()); this layer authorizes "may sell at
 * all" + validates the input ranges (which also mirror the DB CHECKs).
 */

const MANAGE_PATH = '/profile/billing/passes';

function flash(code: string, msg?: string): never {
  const params = new URLSearchParams({ pass: code });
  if (msg) params.set('pass_msg', msg);
  redirect(`${MANAGE_PATH}?${params.toString()}` as Route);
}

export async function createPassFromForm(_returnPath: string, formData: FormData): Promise<never> {
  const { user } = await requireRealUser(MANAGE_PATH);
  if (!(await hasProBenefits(user.id))) flash('pro');

  const rawTitle = field(formData, 'title');
  if (!rawTitle) flash('invalid', 'A pass title is required.');
  let title: string;
  try {
    title = assertCleanName(rawTitle);
  } catch (err) {
    if (err instanceof ValidationError) flash('invalid', 'Please choose a cleaner title.');
    flash('invalid', 'Invalid title.');
  }

  const rawDesc = fieldOrNull(formData, 'description', 280);
  const description = rawDesc ? maskPublicText(rawDesc) : null;

  const creditCount = Math.floor(Number(field(formData, 'credit_count')));
  if (!Number.isFinite(creditCount) || creditCount < 1 || creditCount > 100) {
    flash('invalid', 'Credits must be between 1 and 100.');
  }

  const priceCents = parsePriceCents(field(formData, 'price_usd'));
  if (priceCents < 100 || priceCents > 1_000_000) {
    flash('invalid', 'Price must be between $1 and $10,000.');
  }

  const expiresRaw = fieldOrNull(formData, 'expires_in_days');
  let expiresInDays: number | null = null;
  if (expiresRaw) {
    const n = Math.floor(Number(expiresRaw));
    if (!Number.isFinite(n) || n < 1 || n > 730) {
      flash('invalid', 'Expiry must be 1–730 days, or left blank for never.');
    }
    expiresInDays = n;
  }

  const sb = await getServerSupabase();
  const { error } = await sb.from('host_passes').insert({
    host_id: user.id,
    title,
    description,
    credit_count: creditCount,
    price_cents: priceCents,
    ...(expiresInDays != null ? { expires_in_days: expiresInDays } : {}),
  });
  if (error) flash('error', error.message);

  revalidatePath(MANAGE_PATH);
  flash('saved');
}

/** Stop selling a pass. Already-sold credits keep working. */
export async function archivePass(passId: string, _formData: FormData): Promise<never> {
  const { user } = await requireRealUser(MANAGE_PATH);
  const sb = await getServerSupabase();
  const { error } = await sb
    .from('host_passes')
    .update({ status: 'archived' })
    .eq('id', passId)
    .eq('host_id', user.id);
  if (error) flash('error', error.message);
  revalidatePath(MANAGE_PATH);
  flash('archived');
}

/** Resume selling an archived pass. */
export async function reactivatePass(passId: string, _formData: FormData): Promise<never> {
  const { user } = await requireRealUser(MANAGE_PATH);
  if (!(await hasProBenefits(user.id))) flash('pro');
  const sb = await getServerSupabase();
  const { error } = await sb
    .from('host_passes')
    .update({ status: 'active' })
    .eq('id', passId)
    .eq('host_id', user.id);
  if (error) flash('error', error.message);
  revalidatePath(MANAGE_PATH);
  flash('reactivated');
}
