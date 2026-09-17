import type { PollMetadataEdit, PollQuestionKind, PollStatus } from '@pickupvb/domain';

// ---- Poll commands (ADR 0041) -------------------------------------------

/** A question as drafted in the builder — no ids yet (the handler mints them,
 * mirroring `CreateGroupHandler`'s `randomUUID`). */
export interface PollQuestionDraft {
  prompt: string;
  kind: PollQuestionKind;
  required: boolean;
  options: ReadonlyArray<{ label: string }>;
}

export interface CreatePollInput {
  eventId: string | null;
  groupId: string | null;
  title: string;
  description: string;
  closesAt: Date | null;
  showRespondentNames: boolean;
  questions: ReadonlyArray<PollQuestionDraft>;
}

export class CreatePollCommand {
  constructor(
    public readonly creatorId: string,
    public readonly input: CreatePollInput,
  ) {}
}

export class UpdatePollCommand {
  constructor(
    public readonly pollId: string,
    /** The caller — must own the poll (RLS enforces; the handler pre-flights). */
    public readonly actorId: string,
    public readonly metadata: PollMetadataEdit,
    /** New questions to full-replace with, or `null` to leave the structure
     * untouched (a metadata-only edit — the only kind allowed once responses
     * exist). */
    public readonly questions: ReadonlyArray<PollQuestionDraft> | null,
  ) {}
}

export class SetPollStatusCommand {
  constructor(
    public readonly pollId: string,
    public readonly actorId: string,
    public readonly status: PollStatus,
  ) {}
}

export class DeletePollCommand {
  constructor(
    public readonly pollId: string,
    public readonly actorId: string,
  ) {}
}
