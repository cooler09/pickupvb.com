import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation } from '../shared/result.js';
import { idConstructor, type Brand } from '../shared/brand.js';
import type { UserId } from '../events/volleyball-event.js';

export type DeletionRequestId = Brand<string, 'DeletionRequestId'>;
export const DeletionRequestId = idConstructor<'DeletionRequestId'>();

/** Lifecycle of a "delete my account" request (privacy P1 #2, ADR 0029).
 * `scheduled` is the only live state; the others are terminal. */
export type DeletionStatus = 'scheduled' | 'executed' | 'cancelled';

/**
 * Account-deletion request aggregate (ADR 0029).
 *
 * Models the streamlined, grace-windowed erasure flow: an authenticated user
 * arms deletion → a `scheduled` request is written with a future
 * `scheduledFor`; a daily cron executes it once that passes; the user may cancel
 * any time before then. There is no email-confirm gate — the requester is
 * already authenticated, and the grace window + cancel are the safety net.
 *
 * The aggregate owns the state machine `scheduled → executed | cancelled` and
 * its guards; the actual purge (profile scrub, Stripe cancel, auth-row delete)
 * is session-less infrastructure orchestration that lives in the web/cron layer
 * and calls {@link markExecuted} only after a clean purge.
 */
export class DeletionRequest extends AggregateRoot<DeletionRequestId> {
  private constructor(
    id: DeletionRequestId,
    private readonly _userId: UserId,
    private _status: DeletionStatus,
    private readonly _reason: string | null,
    private readonly _requestedAt: Date,
    private readonly _scheduledFor: Date,
    private _resolvedAt: Date | null,
  ) {
    super(id);
  }

  /** Arm a fresh request. `scheduledFor` is computed at the application boundary
   * (now + grace window) so the grace policy lives in one place. */
  static request(props: {
    id: DeletionRequestId;
    userId: UserId;
    scheduledFor: Date;
    requestedAt?: Date;
    reason?: string | null;
  }): DeletionRequest {
    return new DeletionRequest(
      props.id,
      props.userId,
      'scheduled',
      props.reason ?? null,
      props.requestedAt ?? new Date(),
      props.scheduledFor,
      null,
    );
  }

  /** Rehydrate a persisted row without re-validating. */
  static fromPersistence(props: {
    id: DeletionRequestId;
    userId: UserId;
    status: DeletionStatus;
    reason: string | null;
    requestedAt: Date;
    scheduledFor: Date;
    resolvedAt: Date | null;
  }): DeletionRequest {
    return new DeletionRequest(
      props.id,
      props.userId,
      props.status,
      props.reason,
      props.requestedAt,
      props.scheduledFor,
      props.resolvedAt,
    );
  }

  get userId(): UserId {
    return this._userId;
  }
  get status(): DeletionStatus {
    return this._status;
  }
  get reason(): string | null {
    return this._reason;
  }
  get requestedAt(): Date {
    return this._requestedAt;
  }
  get scheduledFor(): Date {
    return this._scheduledFor;
  }
  get resolvedAt(): Date | null {
    return this._resolvedAt;
  }
  get isScheduled(): boolean {
    return this._status === 'scheduled';
  }

  /** Is the request due to execute at `now`? (scheduled and past its window.) */
  isDue(now: Date): boolean {
    return this._status === 'scheduled' && this._scheduledFor.getTime() <= now.getTime();
  }

  /** User cancels within the grace window. Only a live request can be cancelled. */
  cancel(now: Date = new Date()): void {
    this.assertScheduled('cancel');
    this._status = 'cancelled';
    this._resolvedAt = now;
  }

  /** The cron stamps the request executed — only after a successful purge. */
  markExecuted(now: Date = new Date()): void {
    this.assertScheduled('execute');
    this._status = 'executed';
    this._resolvedAt = now;
  }

  private assertScheduled(action: string): void {
    if (this._status !== 'scheduled') {
      throw new InvariantViolation(
        `Cannot ${action} a deletion request in state '${this._status}'.`,
        { status: this._status },
      );
    }
  }
}

export interface DeletionRequestRepository {
  /** The user's single live (`scheduled`) request, or `null`. */
  findActiveByUser(userId: UserId): Promise<DeletionRequest | null>;
  /** Insert a new request or persist a state transition (cancel / execute). */
  save(request: DeletionRequest): Promise<void>;
  /** `scheduled` requests whose `scheduledFor` has passed — the cron's work list. */
  findDueForExecution(now: Date, limit: number): Promise<DeletionRequest[]>;
}
