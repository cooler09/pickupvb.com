'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { field } from '@/lib/form-data';
import { log } from '@/lib/log';
import { consumeRateLimit, getClientIp, rateLimitKey } from '@/lib/rate-limit';
import { buildClaimEmailRedirect } from '@/lib/server-redirects';
import { getViewer } from '@/lib/server-auth';
import type { TablesUpdate } from '@pickupvb/supabase';

export type ClaimState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Convert the current anonymous session into a permanent account.
 *
 * GoTrue requires that an anon user gets an email (or phone) BEFORE a
 * password can be set:
 *   "Updating password of an anonymous user without an email or phone is
 *   not allowed"
 *
 * So the conversion is two events, with the user clicking through email in
 * between:
 *   1. (here) updateUser({ email }) — Supabase sends a confirmation link.
 *      `is_anonymous` stays true until they click it.
 *   2. (after they click the link) /auth/callback exchanges the code for a
 *      session whose `is_anonymous` is now false. From there we send them to
 *      /reset-password to set their password.
 *
 * First/last name are saved to user metadata + profiles immediately — they
 * don't depend on email confirmation.
 */
export async function claimAccount(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const email = field(formData, 'email');
  const firstName = field(formData, 'first_name');
  const lastName = field(formData, 'last_name');

  const fieldErrors: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) fieldErrors.email = 'Enter a valid email address.';
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Please fix the highlighted fields.', fieldErrors };
  }

  const viewer = await getViewer();
  if (!viewer) {
    return { error: 'No active session. Sign up as a guest for an event first.' };
  }
  if (!viewer.isAnonymous) {
    return { error: 'Your account is already permanent.' };
  }
  const { supabase, user } = viewer;

  // Step 1: stash the names in user_metadata + profiles. Doesn't require
  // email/phone, so it's safe to do pre-confirmation.
  if (firstName || lastName) {
    const { error: metaErr } = await supabase.auth.updateUser({
      data: {
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
      },
    });
    if (metaErr) {
      await log.error('[claim] updateUser(metadata) failed', metaErr);
    }

    const updates: TablesUpdate<'profiles'> = {
      display_name: [firstName, lastName].filter(Boolean).join(' '),
    };
    if (firstName) updates['first_name'] = firstName;
    if (lastName) updates['last_name'] = lastName;
    await supabase.from('profiles').update(updates).eq('id', user.id);
  }

  // Step 2: attach the email. Supabase sends a confirmation link; until the
  // user clicks it the email stays in `email_change` and `is_anonymous`
  // stays true. The user CANNOT set a password until after confirmation —
  // emailRedirectTo sends them through /auth/callback to /reset-password.
  // Thread the gate's `next` (e.g. /events/new) through the confirm →
  // set-password chain so the user lands where they were headed. Same-origin
  // relative only — reject `//evil.com` / `/\evil.com` (mirrors /auth/callback).
  const next = field(formData, 'next');
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : null;
  const emailRedirectTo = await buildClaimEmailRedirect(safeNext ?? undefined);

  // Rate-limit before the email send so an attacker can't replay this
  // form to spam a target with confirmation emails. Audit P2 #6.
  const ip = await getClientIp();
  const [ipGate, emailGate] = await Promise.all([
    consumeRateLimit({ key: rateLimitKey('claim', 'ip', ip), limit: 20, windowSeconds: 3600 }),
    consumeRateLimit({ key: rateLimitKey('claim', 'email', email), limit: 5, windowSeconds: 3600 }),
  ]);
  const blocked = !ipGate.allowed ? ipGate : !emailGate.allowed ? emailGate : null;
  if (blocked) {
    const mins = Math.max(1, Math.ceil(blocked.retryAfterSeconds / 60));
    return {
      error: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
    };
  }

  const { error: emailErr } = await supabase.auth.updateUser({ email }, { emailRedirectTo });
  if (emailErr) {
    await log.error('[claim] updateUser(email) failed', emailErr);
    // The address already belongs to another account — point them at sign-in
    // (the /claim page renders a "Sign in instead" link) instead of leaking
    // GoTrue's raw message. Keep unknown failures generic.
    if (/already.*(registered|in use|exists)/i.test(emailErr.message)) {
      return {
        error:
          "That email is already linked to an account. If it's yours, sign in instead — your guest signups won't merge automatically.",
      };
    }
    return { error: "We couldn't send the confirmation email. Please try again." };
  }

  revalidatePath('/');
  redirect(
    `/claim/check-email?to=${encodeURIComponent(email)}${
      safeNext ? `&next=${encodeURIComponent(safeNext)}` : ''
    }`,
  );
}
