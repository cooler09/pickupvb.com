'use server';

import { revalidatePath } from 'next/cache';
import { ChangeHandleCommand, UpdateProfileCommand } from '@pickupvb/application';
import { ConflictError, NotFoundError, ValidationError } from '@pickupvb/domain';
import { fieldOrNull, bool } from '@/lib/form-data';
import { isPosition, type Position } from '@/lib/enum-labels';
import { normalizeHandle, normalizeWebsiteUrl } from '@/lib/social-handles';
import { requireSession } from '@/lib/server-auth';
import { getUserProfileHandlers } from '@/lib/handlers';
import { geocodePlace } from '@/lib/geocode';
import { captureOnboardingStep } from '@/lib/onboarding';

export type ProfileFormState = {
  error: string | null;
  success: boolean;
};

function readPosition(formData: FormData, key: string): Position | null {
  const v = formData.get(key);
  if (typeof v !== 'string' || v.length === 0) return null;
  return isPosition(v) ? v : null;
}

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const { supabase, user } = await requireSession();

  // Onboarding funnel (ADR 0035 / M1): snapshot whether the profile was already
  // "complete" (home city + ≥1 position — matching the domain catalog's
  // complete-profile rule) before this save, so we fire the step event only on
  // the incomplete→complete transition rather than on every subsequent edit.
  const { data: priorRow } = await supabase
    .from('profiles')
    .select('home_city, primary_position, secondary_position, tertiary_position')
    .eq('id', user.id)
    .maybeSingle();
  const prior = priorRow as {
    home_city: string | null;
    primary_position: string | null;
    secondary_position: string | null;
    tertiary_position: string | null;
  } | null;
  const profileWasComplete =
    Boolean(prior?.home_city) &&
    Boolean(prior?.primary_position || prior?.secondary_position || prior?.tertiary_position);

  const firstName = fieldOrNull(formData, 'first_name', 60);
  const lastName = fieldOrNull(formData, 'last_name', 60);
  const homeCity = fieldOrNull(formData, 'home_city', 120);
  const displayNameInput = fieldOrNull(formData, 'display_name', 80);
  const autoAcceptTeamInvites = bool(formData, 'auto_accept_team_invites');
  const showProBadge = bool(formData, 'show_pro_badge');
  // Discovery opt-in. The toggle defaults checked, so an unchecked box (absent
  // from the FormData) ⇒ `false` ⇒ the player goes private.
  const discoverable = bool(formData, 'discoverable');
  const primaryPosition = readPosition(formData, 'primary_position');
  const secondaryPosition = readPosition(formData, 'secondary_position');
  const tertiaryPosition = readPosition(formData, 'tertiary_position');

  // Social handles are stored as bare handles (no leading @, no URL
  // prefix). The shared normalizer in lib/social-handles strips both so
  // pasting a full profile URL Just Works.
  const instagramHandle = normalizeHandle(fieldOrNull(formData, 'instagram_handle', 200), 60);
  const tiktokHandle = normalizeHandle(fieldOrNull(formData, 'tiktok_handle', 200), 60);
  const twitterHandle = normalizeHandle(fieldOrNull(formData, 'twitter_handle', 200), 60);
  const facebookHandle = normalizeHandle(fieldOrNull(formData, 'facebook_handle', 200), 80);
  const youtubeHandle = normalizeHandle(fieldOrNull(formData, 'youtube_handle', 200), 80);
  const websiteUrl = normalizeWebsiteUrl(fieldOrNull(formData, 'website_url', 200));

  const fallbackName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    (user.email?.split('@')[0] ?? 'Player');
  const displayName = displayNameInput ?? fallbackName;

  if (!displayName) {
    return { error: 'Please enter a display name (or first/last name).', success: false };
  }

  const { updateProfile: handler } = await getUserProfileHandlers();
  try {
    await handler.execute(
      new UpdateProfileCommand(user.id, {
        displayName,
        firstName,
        lastName,
        homeCity,
        positions: {
          primary: primaryPosition,
          secondary: secondaryPosition,
          tertiary: tertiaryPosition,
        },
        socialHandles: {
          instagram: instagramHandle,
          tiktok: tiktokHandle,
          twitter: twitterHandle,
          facebook: facebookHandle,
          youtube: youtubeHandle,
          website: websiteUrl,
        },
        autoAcceptTeamInvites,
        showProBadge,
        discoverable,
      }),
    );
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message, success: false };
    if (err instanceof NotFoundError) return { error: 'Profile not found.', success: false };
    throw err;
  }

  // Geocode the home city → lat/lng for player "near me" discovery (PL-5).
  // Derived/cosmetic, so written directly here (like theme/hero/avatar, not
  // through the profile aggregate) and best-effort: a geocode miss or a cleared
  // city just nulls the coords, so the player drops out of proximity results.
  let coords: { latitude: number; longitude: number } | null = null;
  if (homeCity) {
    coords = await geocodePlace(homeCity).catch(() => null);
  }
  await supabase
    .from('profiles')
    .update({ latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null })
    .eq('id', user.id);

  // Fire the onboarding funnel event only when this save *completed* the profile
  // (home city + ≥1 position) for the first time. Fire-and-forget, consent-gated.
  const profileNowComplete =
    Boolean(homeCity) && Boolean(primaryPosition || secondaryPosition || tertiaryPosition);
  if (profileNowComplete && !profileWasComplete) {
    captureOnboardingStep(user.id, 'player', 'complete-profile');
  }

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  // The players directory (and its name search) is a discovery surface that now
  // reflects `discoverable` — and also shows the edited name/city/positions — so
  // bust its ISR cache on every save rather than waiting out the 60s TTL.
  revalidatePath('/players');
  return { error: null, success: true };
}

export type HandleFormState = {
  error: string | null;
  success: boolean;
};

export async function updateHandle(
  _prev: HandleFormState,
  formData: FormData,
): Promise<HandleFormState> {
  const { supabase, user } = await requireSession();

  const raw = String(formData.get('handle') ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return { error: 'Pick a handle.', success: false };

  // Look up old handle so we can revalidate its public URL too (a trivial
  // self-scoped read; the handle-shape rule + uniqueness now live in the
  // UserProfile aggregate / repository — ADR 0020).
  const { data: oldRow } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle();
  const oldHandle = (oldRow as { handle: string } | null)?.handle ?? null;

  const { changeHandle: handler } = await getUserProfileHandlers();
  try {
    await handler.execute(new ChangeHandleCommand(user.id, raw));
  } catch (err) {
    if (err instanceof ConflictError) {
      return { error: 'That handle is already taken — try another.', success: false };
    }
    if (err instanceof ValidationError) return { error: err.message, success: false };
    if (err instanceof NotFoundError) return { error: 'Profile not found.', success: false };
    throw err;
  }

  revalidatePath('/profile');
  revalidatePath(`/players/${raw}`);
  if (oldHandle && oldHandle !== raw) revalidatePath(`/players/${oldHandle}`);
  return { error: null, success: true };
}
