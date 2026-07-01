'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  CreatePollCommand,
  DeletePollCommand,
  SetPollStatusCommand,
  UpdatePollCommand,
  type PollQuestionDraft,
} from '@pickupvb/application';
import { DomainError } from '@pickupvb/domain';
import { getPollHandlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import type { PollActionResult, PollFormValues } from './_components/poll-form-types';

/** Map the builder's viewer-local `datetime-local` string to a `Date | null`. */
function parseClosesAt(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDraftQuestions(values: PollFormValues): PollQuestionDraft[] {
  return values.questions.map((q) => ({
    prompt: q.prompt,
    kind: q.kind,
    required: q.required,
    options: q.options.map((o) => ({ label: o.label })),
  }));
}

/**
 * Create a poll (ADR 0041). Called from the `'use client'` builder with the
 * structured form values. Redirects to the host dashboard on success; returns a
 * typed error for the builder to surface inline on a domain validation failure.
 */
export async function createPollAction(args: {
  eventId: string | null;
  groupId: string | null;
  values: PollFormValues;
}): Promise<PollActionResult> {
  const { user } = await requireRealUser('/polls/new');
  let newId: string;
  try {
    const { createPoll } = await getPollHandlers();
    const result = await createPoll.execute(
      new CreatePollCommand(user.id, {
        eventId: args.eventId,
        groupId: args.groupId,
        title: args.values.title,
        description: args.values.description,
        closesAt: parseClosesAt(args.values.closesAt),
        showRespondentNames: args.values.showRespondentNames,
        questions: toDraftQuestions(args.values),
      }),
    );
    newId = result.id;
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  redirect(`/polls/${newId}`);
}

/**
 * Update a poll (ADR 0041). `includeQuestions` is true only when the poll has no
 * responses yet — the builder omits the structural payload once responses exist,
 * and the aggregate enforces the same guard.
 */
export async function updatePollAction(
  pollId: string,
  args: { values: PollFormValues; includeQuestions: boolean },
): Promise<PollActionResult> {
  const { user } = await requireRealUser(`/polls/${pollId}/edit`);
  try {
    const { updatePoll } = await getPollHandlers();
    await updatePoll.execute(
      new UpdatePollCommand(
        pollId,
        user.id,
        {
          title: args.values.title,
          description: args.values.description,
          closesAt: parseClosesAt(args.values.closesAt),
          showRespondentNames: args.values.showRespondentNames,
        },
        args.includeQuestions ? toDraftQuestions(args.values) : null,
      ),
    );
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath(`/polls/${pollId}`);
  redirect(`/polls/${pollId}`);
}

/** Close or reopen a poll from the host dashboard. */
export async function setPollStatusAction(
  pollId: string,
  status: 'open' | 'closed',
): Promise<PollActionResult> {
  const { user } = await requireRealUser(`/polls/${pollId}`);
  try {
    const { setPollStatus } = await getPollHandlers();
    await setPollStatus.execute(new SetPollStatusCommand(pollId, user.id, status));
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath(`/polls/${pollId}`);
  return { ok: true };
}

/** Delete a poll and all its responses. Redirects to the poll list on success. */
export async function deletePollAction(pollId: string): Promise<PollActionResult> {
  const { user } = await requireRealUser(`/polls/${pollId}`);
  try {
    const { deletePoll } = await getPollHandlers();
    await deletePoll.execute(new DeletePollCommand(pollId, user.id));
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  redirect('/polls');
}
