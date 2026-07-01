import { randomUUID } from 'node:crypto';
import {
  NotFoundError,
  Poll,
  UnauthorizedError,
  type AnalyticsPort,
  type PollQuestionInput,
  type PollWriteStore,
} from '@pickupvb/domain';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import type { PollQuestionDraft } from '../messages/poll.js';
import {
  CreatePollCommand,
  DeletePollCommand,
  SetPollStatusCommand,
  UpdatePollCommand,
} from '../messages/poll.js';

/** Mint stable ids for a draft's questions + options at the handler boundary
 * (the domain stays pure; ids are generated here like `CreateGroupHandler`). */
function withIds(questions: ReadonlyArray<PollQuestionDraft>): PollQuestionInput[] {
  return questions.map((q) => ({
    id: randomUUID(),
    prompt: q.prompt,
    kind: q.kind,
    required: q.required,
    options: q.options.map((o) => ({ id: randomUUID(), label: o.label })),
  }));
}

/**
 * Create a poll (ADR 0041). The aggregate validates the config; the DB trigger
 * assigns the share short code. Returns the new poll id for the redirect to the
 * host dashboard.
 */
export class CreatePollHandler {
  constructor(
    private readonly repo: PollWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ creatorId, input }: CreatePollCommand): Promise<{ id: string }> {
    const poll = Poll.create({
      id: randomUUID(),
      creatorId,
      eventId: input.eventId,
      groupId: input.groupId,
      title: input.title,
      description: input.description,
      closesAt: input.closesAt,
      showRespondentNames: input.showRespondentNames,
      questions: withIds(input.questions),
    });
    await this.repo.add(poll);
    if (this.analytics) dispatchAnalyticsOutbox(poll, this.analytics);
    return { id: poll.id };
  }
}

/**
 * Update a poll (ADR 0041). Metadata (title / description / close time /
 * name-visibility) is always applied. When `questions` is provided it's a
 * structural edit — the aggregate refuses it once any response exists (a
 * full-replace would cascade-delete `poll_answers`), so the caller only sends
 * questions while the poll has zero responses.
 */
export class UpdatePollHandler {
  constructor(
    private readonly repo: PollWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ pollId, actorId, metadata, questions }: UpdatePollCommand): Promise<void> {
    const poll = await this.repo.findById(pollId);
    if (!poll) throw new NotFoundError('poll', pollId);
    if (poll.creatorId !== actorId) {
      throw new UnauthorizedError('Only the poll’s creator can edit it.');
    }
    poll.setMetadata(metadata);
    if (questions) {
      const responseCount = await this.repo.countResponses(pollId);
      poll.replaceQuestions(withIds(questions), responseCount > 0);
    }
    await this.repo.saveMetadata(poll);
    if (questions) await this.repo.replaceStructure(poll);
    if (this.analytics) dispatchAnalyticsOutbox(poll, this.analytics);
  }
}

/** Close or reopen a poll (ADR 0041). */
export class SetPollStatusHandler {
  constructor(
    private readonly repo: PollWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ pollId, actorId, status }: SetPollStatusCommand): Promise<void> {
    const poll = await this.repo.findById(pollId);
    if (!poll) throw new NotFoundError('poll', pollId);
    if (poll.creatorId !== actorId) {
      throw new UnauthorizedError('Only the poll’s creator can change its status.');
    }
    if (status === 'closed') poll.close();
    else poll.reopen();
    await this.repo.saveMetadata(poll);
    if (this.analytics) dispatchAnalyticsOutbox(poll, this.analytics);
  }
}

/** Delete a poll and all its responses (ADR 0041). Creator-only — the load is
 * RLS-gated to the creator, and the delete RLS policy enforces it again. */
export class DeletePollHandler {
  constructor(private readonly repo: PollWriteStore) {}

  async execute({ pollId, actorId }: DeletePollCommand): Promise<void> {
    const poll = await this.repo.findById(pollId);
    if (!poll) throw new NotFoundError('poll', pollId);
    if (poll.creatorId !== actorId) {
      throw new UnauthorizedError('Only the poll’s creator can delete it.');
    }
    await this.repo.delete(pollId);
  }
}
