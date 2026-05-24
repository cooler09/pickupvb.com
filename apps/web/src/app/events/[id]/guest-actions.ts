'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { JoinEventCommand } from '@pickupvb/application';
import { CapacityExceededError, ConflictError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field } from '@/lib/form-data';
import { log } from '@/lib/log';
import { consumeRateLimit, getClientIp } from '@/lib/rate-limit';
import { getServerSupabase } from '@/lib/supabase';
import { verifyTurnstileToken } from '@/lib/turnstile';

export type GuestSignupState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Anonymous guest signup flow:
 *   1. Verify Cloudflare Turnstile token (bot gate — anon auth opens up a
 *      free auth.users row per visitor, so the captcha is non-negotiable).
 *   2. If the visitor doesn't already have an anon session cookie, call
 *      supabase.auth.signInAnonymously() to mint one.
 *   3. Persist the visitor's chosen display_name (and optional email) onto
 *      the auto-created profiles row + auth.users metadata.
 *   4. Insert a normal event_attendees row through the app's existing
 *      JoinEventCommand (capacity + visibility checks reuse the same path
 *      as logged-in users).
 *
 * Conversion to a permanent account later is one `auth.updateUser({ email })`
 * call — same auth.users.id, same attendee history.
 */
export async function signupAsGuest(
  eventId: string,
  _prev: GuestSignupState,
  formData: FormData,
): Promise<GuestSignupState> {
  const displayName = field(formData, 'display_name');
  const email = field(formData, 'email');
  const turnstileToken = field(formData, 'cf-turnstile-response');

  const fieldErrors: Record<string, string> = {};
  if (displayName.length < 1 || displayName.length > 80) {
    fieldErrors.display_name = 'Name is required (1–80 characters).';
  }
  if (email.length > 0 && !EMAIL_RE.test(email)) {
    fieldErrors.email = 'That email address looks invalid.';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Please fix the highlighted fields.', fieldErrors };
  }

  const turnstile = await verifyTurnstileToken(turnstileToken || null);
  if (!turnstile.ok) {
    return { error: turnstile.error ?? 'Verification failed.' };
  }

  const supabase = await getServerSupabase();

  // (1) Reuse an existing session if any; otherwise mint a new anon user.
  const {
    data: { user: existing },
  } = await supabase.auth.getUser();

  let userId: string | null = existing?.id ?? null;
  if (!userId) {
    const { data, error } = await supabase.auth.signInAnonymously({
      options: { data: { display_name: displayName } },
    });
    if (error || !data.user) {
      return {
        error:
          error?.message ?? 'Could not start a guest session. Anonymous sign-ins may be disabled.',
      };
    }
    userId = data.user.id;
  }

  // (2) Sync the chosen name (and optional email) onto profile + auth user.
  await supabase
    .from('profiles')
    .update({ display_name: displayName } as never)
    .eq('id', userId);

  if (email.length > 0) {
    // Rate-limit the email-bearing path so a bot can't replay this form
    // to mail-bomb a target. Audit P2 #6. We throttle by IP regardless,
    // and additionally by email when one was supplied. Empty-email
    // guests still consume an anon auth.users row, but the abuse vector
    // for P2 #6 is specifically Supabase-sent confirmation emails.
    const ip = await getClientIp();
    const [ipGate, emailGate] = await Promise.all([
      consumeRateLimit({
        key: `guest-signup:ip:${ip}`,
        limit: 20,
        windowSeconds: 3600,
      }),
      consumeRateLimit({
        key: `guest-signup:email:${email.toLowerCase()}`,
        limit: 5,
        windowSeconds: 3600,
      }),
    ]);
    const blocked = !ipGate.allowed ? ipGate : !emailGate.allowed ? emailGate : null;
    if (blocked) {
      const mins = Math.max(1, Math.ceil(blocked.retryAfterSeconds / 60));
      return {
        error: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      };
    }

    // Triggers email confirmation via Supabase if confirmations are on.
    // We don't fail the signup if this errors — the attendee row matters.
    const { error: updErr } = await supabase.auth.updateUser({ email });
    if (updErr && !/already.*registered/i.test(updErr.message)) {
      log.warn('[guest-signup] updateUser email failed', { error: updErr.message });
    }
  }

  // (3) Join the event through the normal command (capacity + RLS).
  try {
    await handlers.joinEvent.execute(new JoinEventCommand(eventId, userId));
  } catch (err) {
    if (err instanceof CapacityExceededError) return { error: 'This event is full.' };
    if (err instanceof ConflictError) {
      // Already RSVPed (e.g. resubmit after refresh) — treat as success.
      revalidatePath(`/events/${eventId}`);
      redirect(`/events/${eventId}?rsvp=already`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?rsvp=guest_joined`);
}
