'use server';

/**
 * Server actions for the event media sub-page (/events/[id]/media).
 *
 * `addMediaAction` is invoked from a `'use client'` form via `useFormState`, so
 * it returns a typed `{ error }` state (and `redirect`s on success). The button
 * actions (`*FromForm`) are plain `<form action={fn.bind(...)}>` submissions, so
 * they use flash-param redirects (`?notice=<code>`).
 *
 * Every mutator runs through `getMediaHandlers()` (user-scoped client → RLS /
 * the host-gated `feature_event_stream` RPC enforce authorization) and ends
 * with `revalidatePath` + `updateTag(eventCacheTag(id))` so the cached event
 * media summary on the detail page is evicted (AGENTS.md gotcha #1).
 */

import { redirect } from 'next/navigation';
import { revalidatePath, updateTag } from 'next/cache';
import { ZodError } from 'zod';
import { CreateMediaPostSchema } from '@pickupvb/types';
import {
  CreateMediaPostCommand,
  EndLiveStreamCommand,
  FeatureEventStreamCommand,
  RemoveMediaPostCommand,
  ReportMediaPostCommand,
  UnfeatureMediaPostCommand,
} from '@pickupvb/application';
import {
  ConflictError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { getMediaHandlers } from '@/lib/handlers';
import { eventCacheTag } from '@/lib/cache-tags';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { requireRealUser } from '@/lib/server-auth';

const KINDS = ['live_stream', 'match_video', 'clip'] as const;

function revalidateMedia(eventId: string): void {
  revalidatePath(`/events/${eventId}/media`);
  revalidatePath(`/events/${eventId}`);
  updateTag(eventCacheTag(eventId));
}

function back(eventId: string, code: string): never {
  redirect(`/events/${eventId}/media?notice=${code}`);
}

export type AddMediaState = { error?: string };

export async function addMediaAction(
  eventId: string,
  _prev: AddMediaState,
  formData: FormData,
): Promise<AddMediaState> {
  const { user } = await requireRealUser(`/events/${eventId}/media`);

  const kindRaw = field(formData, 'kind');
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'clip';
  const raw = {
    eventId,
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

  revalidateMedia(eventId);
  redirect(`/events/${eventId}/media?notice=posted`);
}

export async function reportMediaFromForm(
  eventId: string,
  postId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}/media`);
  const reasonRaw = fieldOrUndefined(formData, 'reason');
  const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;
  const { reportMediaPost } = await getMediaHandlers();
  try {
    await reportMediaPost.execute(new ReportMediaPostCommand(postId, user.id, reason));
  } catch (err) {
    if (err instanceof ConflictError) back(eventId, 'already');
    if (err instanceof NotFoundError) back(eventId, 'notfound');
    throw err;
  }
  revalidateMedia(eventId);
  back(eventId, 'reported');
}

export async function removeMediaFromForm(
  eventId: string,
  postId: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}/media`);
  const { removeMediaPost } = await getMediaHandlers();
  try {
    await removeMediaPost.execute(new RemoveMediaPostCommand(postId, user.id));
  } catch (err) {
    if (err instanceof UnauthorizedError) back(eventId, 'notallow');
    if (err instanceof NotFoundError) back(eventId, 'notfound');
    throw err;
  }
  revalidateMedia(eventId);
  back(eventId, 'removed');
}

export async function featureStreamFromForm(
  eventId: string,
  postId: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}/media`);
  const { featureEventStream } = await getMediaHandlers();
  try {
    await featureEventStream.execute(new FeatureEventStreamCommand(postId, user.id));
  } catch (err) {
    if (err instanceof UnauthorizedError) back(eventId, 'notallow');
    if (err instanceof ConflictError) back(eventId, 'error');
    if (err instanceof NotFoundError) back(eventId, 'notfound');
    throw err;
  }
  revalidateMedia(eventId);
  back(eventId, 'featured');
}

export async function unfeatureMediaFromForm(
  eventId: string,
  postId: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}/media`);
  const { unfeatureMediaPost } = await getMediaHandlers();
  try {
    await unfeatureMediaPost.execute(new UnfeatureMediaPostCommand(postId, user.id));
  } catch (err) {
    if (err instanceof UnauthorizedError) back(eventId, 'notallow');
    if (err instanceof NotFoundError) back(eventId, 'notfound');
    throw err;
  }
  revalidateMedia(eventId);
  back(eventId, 'unfeatured');
}

export async function endLiveStreamFromForm(
  eventId: string,
  postId: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}/media`);
  const { endLiveStream } = await getMediaHandlers();
  try {
    await endLiveStream.execute(new EndLiveStreamCommand(postId, user.id));
  } catch (err) {
    if (err instanceof UnauthorizedError) back(eventId, 'notallow');
    if (err instanceof ConflictError) back(eventId, 'error');
    if (err instanceof NotFoundError) back(eventId, 'notfound');
    throw err;
  }
  revalidateMedia(eventId);
  back(eventId, 'streamended');
}
