import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  DeletionRequest,
  DeletionRequestId,
  NotFoundError,
  UserId,
  type DeletionRequestRepository,
} from '@pickupvb/domain';
import { CancelAccountDeletionCommand, RequestAccountDeletionCommand } from '../messages/index';

/** Default grace window: the user can cancel within this many days before the
 * cron purges the account. Locked at 30 days (privacy P1 #2 / ADR 0029). */
export const DEFAULT_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Arm account deletion (ADR 0029). Refuses if the user already has a live
 * request (`ConflictError`), otherwise writes a `scheduled` request with
 * `scheduledFor = now + graceDays`. Returns the request so the caller can show
 * the cancel-by date and fire the confirmation notification.
 */
export class RequestAccountDeletionHandler {
  constructor(
    private readonly repo: DeletionRequestRepository,
    private readonly graceDays: number = DEFAULT_GRACE_DAYS,
  ) {}

  async execute({
    userId,
    reason,
  }: RequestAccountDeletionCommand): Promise<{ id: string; scheduledFor: Date }> {
    const uid = UserId(userId);
    const existing = await this.repo.findActiveByUser(uid);
    if (existing) {
      throw new ConflictError('Account deletion is already scheduled.', {
        scheduledFor: existing.scheduledFor.toISOString(),
      });
    }
    const scheduledFor = new Date(Date.now() + this.graceDays * DAY_MS);
    const request = DeletionRequest.request({
      id: DeletionRequestId(randomUUID()),
      userId: uid,
      scheduledFor,
      reason,
    });
    await this.repo.save(request);
    return { id: request.id, scheduledFor };
  }
}

/**
 * Cancel a pending deletion within the grace window. `NotFoundError` if the
 * user has no live request; the aggregate guards the scheduled→cancelled
 * transition.
 */
export class CancelAccountDeletionHandler {
  constructor(private readonly repo: DeletionRequestRepository) {}

  async execute({ userId }: CancelAccountDeletionCommand): Promise<void> {
    const request = await this.repo.findActiveByUser(UserId(userId));
    if (!request) throw new NotFoundError('deletion request', userId);
    request.cancel();
    await this.repo.save(request);
  }
}
