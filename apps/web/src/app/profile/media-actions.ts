'use server';

/**
 * Server actions for managing videos on your own profile (standalone posts not
 * attached to an event). Event-attached posts are managed from the event media
 * sub-page; these cover the "post a video to my profile" flow.
 */

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { CreateMediaPostSchema } from '@pickupvb/types';
import { CreateMediaPostCommand, RemoveMediaPostCommand } from '@pickupvb/application';
import {
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { getMediaHandlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { requireRealUser } from '@/lib/server-auth';

// Live streams are inherently event-scoped, so profile posts are videos/clips.
const KINDS = ['match_video', 'clip'] as const;

export type AddProfileMediaState = { error?: string; ok?: boolean };

async function revalidateProfile(userId: string): Promise<void> {
  revalidatePath('/profile');
  // The public profile is keyed by handle and ISR-cached; evict it eagerly.
  const supabase = await getServerSupabase();
  const { data } = await supabase.from('profiles').select('handle').eq('id', userId).maybeSingle();
  const handle = (data as { handle: string } | null)?.handle;
  if (handle) revalidatePath(`/players/${handle}`);
}

export async function addProfileMediaAction(
  _prev: AddProfileMediaState,
  formData: FormData,
): Promise<AddProfileMediaState> {
  const { user } = await requireRealUser('/profile');

  const kindRaw = field(formData, 'kind');
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'clip';
  const raw = {
    eventId: null,
    matchId: null,
    kind,
    videoUrl: field(formData, 'videoUrl'),
    title: field(formData, 'title'),
    description: fieldOrUndefined(formData, 'description') ?? '',
  };

  let dto;
  try {
    dto = CreateMediaPostSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: err.issues[0]?.message ?? 'Please check the form fields.' };
    }
    return { error: 'Could not parse form input.' };
  }

  const { createMediaPost } = await getMediaHandlers();
  try {
    await createMediaPost.execute(new CreateMediaPostCommand(user.id, dto));
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: "You've reached the daily limit for posting videos. Try again tomorrow." };
    }
    if (err instanceof ValidationError) return { error: err.message };
    return { error: err instanceof Error ? err.message : 'Could not post the video.' };
  }

  await revalidateProfile(user.id);
  return { ok: true };
}

export async function removeProfileMediaFromForm(
  postId: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser('/profile');
  const { removeMediaPost } = await getMediaHandlers();
  try {
    await removeMediaPost.execute(new RemoveMediaPostCommand(postId, user.id));
  } catch (err) {
    // Already gone or not permitted — fall through to a refresh either way.
    if (!(err instanceof NotFoundError) && !(err instanceof UnauthorizedError)) throw err;
  }
  await revalidateProfile(user.id);
}
