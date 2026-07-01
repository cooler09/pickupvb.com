import { AggregateRoot } from '../shared/aggregate-root.js';
import { idConstructor, type Brand } from '../shared/brand.js';
import type { DomainEvent } from '../shared/domain-event.js';
import { InvariantViolation, ValidationError } from '../shared/result.js';
import { EventId, UserId } from '../events/volleyball-event.js';
import { GroupId } from '../groups/group.js';
import { maskPublicText } from '../moderation/content-moderation.js';

export type { EventId, UserId, GroupId };

export type PollId = Brand<string, 'PollId'>;
export const PollId = idConstructor<'PollId'>();
export type PollQuestionId = Brand<string, 'PollQuestionId'>;
export const PollQuestionId = idConstructor<'PollQuestionId'>();
export type PollOptionId = Brand<string, 'PollOptionId'>;
export const PollOptionId = idConstructor<'PollOptionId'>();

/** A single-select question takes exactly one option; a multi-select takes any. */
export type PollQuestionKind = 'single' | 'multi';
export type PollStatus = 'open' | 'closed';

const TITLE_ERROR = 'Poll title is required (1–200 chars).';
const PROMPT_ERROR = 'Every question needs a prompt (1–300 chars).';
const LABEL_ERROR = 'Every option needs a label (1–200 chars).';

export interface PollOption {
  id: PollOptionId;
  label: string;
}

export interface PollQuestion {
  id: PollQuestionId;
  prompt: string;
  kind: PollQuestionKind;
  required: boolean;
  options: ReadonlyArray<PollOption>;
}

/** The nested shape a create/edit command hands the aggregate. Ids are minted
 * at the boundary (like `Group.create`'s `id`) so the domain stays pure. */
export interface PollQuestionInput {
  id: string;
  prompt: string;
  kind: PollQuestionKind;
  required: boolean;
  options: ReadonlyArray<{ id: string; label: string }>;
}

/** The always-editable metadata (never structural — safe to change after
 * responses land). */
export interface PollMetadataEdit {
  title: string;
  description: string;
  closesAt: Date | null;
  showRespondentNames: boolean;
}

export class PollCreated implements DomainEvent {
  readonly type = 'poll.created';
  readonly occurredAt = new Date();
  constructor(public readonly aggregateId: string) {}
}

export class PollClosed implements DomainEvent {
  readonly type = 'poll.closed';
  readonly occurredAt = new Date();
  constructor(public readonly aggregateId: string) {}
}

/**
 * Public poll aggregate (ADR 0041). A poll is owned by a creator and OPTIONALLY
 * scoped to an event XOR a group. It models its **config** — the ordered
 * questions + options and the always-editable metadata (title, description,
 * close time, name-visibility toggle, open/closed status).
 *
 * Responses are deliberately **not** modeled here. They arrive sessionlessly
 * from strangers (no account), are unbounded, and are validated + written by the
 * `submit_poll_response` SECURITY DEFINER RPC (the sessionless trust boundary) —
 * loading them all to record one would be the wrong shape (same reasoning as
 * `event_attendees`). The aggregate's only tie to them is the structural-edit
 * guard: `replaceQuestions` refuses to run once any response exists, because a
 * full-replace would cascade-delete `poll_answers`.
 */
export class Poll extends AggregateRoot<PollId> {
  private constructor(
    id: PollId,
    private readonly _creatorId: UserId,
    private readonly _eventId: EventId | null,
    private readonly _groupId: GroupId | null,
    private _title: string,
    private _description: string,
    private _status: PollStatus,
    private _closesAt: Date | null,
    private _showRespondentNames: boolean,
    private _questions: PollQuestion[],
    private readonly _createdAt: Date,
  ) {
    super(id);
  }

  static create(props: {
    id: string;
    creatorId: string;
    eventId?: string | null;
    groupId?: string | null;
    title: string;
    description?: string;
    closesAt?: Date | null;
    showRespondentNames?: boolean;
    questions: ReadonlyArray<PollQuestionInput>;
  }): Poll {
    if (props.eventId && props.groupId) {
      throw new InvariantViolation('A poll attaches to an event or a group, not both.');
    }
    const title = Poll.assertTitle(props.title);
    const questions = Poll.buildQuestions(props.questions);
    const poll = new Poll(
      PollId(props.id),
      UserId(props.creatorId),
      props.eventId ? EventId(props.eventId) : null,
      props.groupId ? GroupId(props.groupId) : null,
      title,
      maskPublicText((props.description ?? '').trim()),
      'open',
      props.closesAt ?? null,
      props.showRespondentNames ?? true,
      questions,
      new Date(),
    );
    poll.raise(new PollCreated(poll.id));
    return poll;
  }

  static fromPersistence(props: {
    id: string;
    creatorId: string;
    eventId: string | null;
    groupId: string | null;
    title: string;
    description: string;
    status: PollStatus;
    closesAt: Date | null;
    showRespondentNames: boolean;
    questions: ReadonlyArray<PollQuestion>;
    createdAt: Date;
  }): Poll {
    return new Poll(
      PollId(props.id),
      UserId(props.creatorId),
      props.eventId ? EventId(props.eventId) : null,
      props.groupId ? GroupId(props.groupId) : null,
      props.title,
      props.description,
      props.status,
      props.closesAt,
      props.showRespondentNames,
      props.questions.map((q) => ({ ...q, options: [...q.options] })),
      props.createdAt,
    );
  }

  // ---- Metadata (always editable) -------------------------------------------

  /** Apply the non-structural fields. Safe after responses exist. */
  setMetadata(edit: PollMetadataEdit): void {
    this._title = Poll.assertTitle(edit.title);
    this._description = maskPublicText(edit.description.trim());
    this._closesAt = edit.closesAt;
    this._showRespondentNames = edit.showRespondentNames;
  }

  /** Replace the questions/options wholesale. Refused once any response exists:
   * the adapter's replace is a cascade-delete, which would wipe `poll_answers`.
   * The caller passes `hasResponses` (a `countResponses` read) so the guard
   * lives with the invariant rather than in the SQL layer. */
  replaceQuestions(questions: ReadonlyArray<PollQuestionInput>, hasResponses: boolean): void {
    if (hasResponses) {
      throw new InvariantViolation('Cannot change a poll’s questions after people have responded.');
    }
    this._questions = Poll.buildQuestions(questions);
  }

  close(): void {
    if (this._status === 'closed') return;
    this._status = 'closed';
    this.raise(new PollClosed(this.id));
  }

  reopen(): void {
    this._status = 'open';
  }

  // ---- Getters --------------------------------------------------------------

  get creatorId(): UserId {
    return this._creatorId;
  }
  get eventId(): EventId | null {
    return this._eventId;
  }
  get groupId(): GroupId | null {
    return this._groupId;
  }
  get title(): string {
    return this._title;
  }
  get description(): string {
    return this._description;
  }
  get status(): PollStatus {
    return this._status;
  }
  get closesAt(): Date | null {
    return this._closesAt;
  }
  get showRespondentNames(): boolean {
    return this._showRespondentNames;
  }
  get questions(): ReadonlyArray<PollQuestion> {
    return this._questions;
  }
  get createdAt(): Date {
    return this._createdAt;
  }

  // ---- Validation helpers ---------------------------------------------------

  private static assertTitle(raw: string): string {
    const title = raw.trim();
    if (title.length < 1 || title.length > 200) {
      throw new ValidationError(TITLE_ERROR, { field: 'title' });
    }
    return maskPublicText(title);
  }

  private static buildQuestions(input: ReadonlyArray<PollQuestionInput>): PollQuestion[] {
    if (input.length < 1) {
      throw new ValidationError('A poll needs at least one question.', { field: 'questions' });
    }
    return input.map((q) => {
      const prompt = q.prompt.trim();
      if (prompt.length < 1 || prompt.length > 300) {
        throw new ValidationError(PROMPT_ERROR, { field: 'prompt' });
      }
      if (q.kind !== 'single' && q.kind !== 'multi') {
        throw new ValidationError(`Unknown question kind: ${q.kind}`, { field: 'kind' });
      }
      if (q.options.length < 1) {
        throw new ValidationError('Every question needs at least one option.', {
          field: 'options',
        });
      }
      const options: PollOption[] = q.options.map((o) => {
        const label = o.label.trim();
        if (label.length < 1 || label.length > 200) {
          throw new ValidationError(LABEL_ERROR, { field: 'label' });
        }
        return { id: PollOptionId(o.id), label: maskPublicText(label) };
      });
      return {
        id: PollQuestionId(q.id),
        prompt: maskPublicText(prompt),
        kind: q.kind,
        required: q.required,
        options,
      };
    });
  }
}

// ---- Write port (adapter lives in @pickupvb/infrastructure) -----------------

export interface PollWriteStore {
  findById(id: string): Promise<Poll | null>;
  /** INSERT a new poll + its questions + options. */
  add(poll: Poll): Promise<void>;
  /** UPDATE the poll's metadata columns only (never touches questions). */
  saveMetadata(poll: Poll): Promise<void>;
  /** Full-replace the questions/options (delete + re-insert). Only ever called
   * when `countResponses === 0` — the aggregate enforces that via
   * `replaceQuestions`. */
  replaceStructure(poll: Poll): Promise<void>;
  /** How many people have responded — feeds the structural-edit guard. */
  countResponses(pollId: string): Promise<number>;
  delete(pollId: string): Promise<void>;
}
