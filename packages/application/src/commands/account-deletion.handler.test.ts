import { describe, it, expect } from 'vitest';
import {
  ConflictError,
  DeletionRequest,
  DeletionRequestId,
  NotFoundError,
  type DeletionRequestRepository,
  type UserId,
} from '@pickupvb/domain';
import { CancelAccountDeletionCommand, RequestAccountDeletionCommand } from '../messages/index';
import {
  CancelAccountDeletionHandler,
  DEFAULT_GRACE_DAYS,
  RequestAccountDeletionHandler,
} from './account-deletion.handler.js';

const USER = 'user-1';

/** In-memory repo enforcing the one-live-request rule via findActiveByUser. */
class FakeRepo implements DeletionRequestRepository {
  saved: DeletionRequest[] = [];
  private active: DeletionRequest | null = null;

  constructor(active: DeletionRequest | null = null) {
    this.active = active;
  }
  async findActiveByUser(_userId: UserId): Promise<DeletionRequest | null> {
    return this.active;
  }
  async save(request: DeletionRequest): Promise<void> {
    this.saved.push(request);
    this.active = request.isScheduled ? request : null;
  }
  async findDueForExecution(): Promise<DeletionRequest[]> {
    return [];
  }
}

describe('RequestAccountDeletionHandler', () => {
  it('arms a scheduled request ~graceDays out and returns the cancel-by date', async () => {
    const repo = new FakeRepo();
    const before = Date.now();
    const res = await new RequestAccountDeletionHandler(repo).execute(
      new RequestAccountDeletionCommand(USER, 'moving on'),
    );
    const saved = repo.saved[0]!;
    expect(saved.status).toBe('scheduled');
    expect(saved.reason).toBe('moving on');
    const graceMs = DEFAULT_GRACE_DAYS * 24 * 60 * 60 * 1000;
    expect(res.scheduledFor.getTime()).toBeGreaterThanOrEqual(before + graceMs - 1000);
    expect(res.scheduledFor.getTime()).toBeLessThanOrEqual(Date.now() + graceMs + 1000);
  });

  it('rejects a second request while one is already scheduled', async () => {
    const active = DeletionRequest.request({
      id: DeletionRequestId('req-1'),
      userId: USER as UserId,
      scheduledFor: new Date(Date.now() + 1_000_000),
    });
    const repo = new FakeRepo(active);
    await expect(
      new RequestAccountDeletionHandler(repo).execute(new RequestAccountDeletionCommand(USER)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.saved).toHaveLength(0);
  });
});

describe('CancelAccountDeletionHandler', () => {
  it('cancels the live request', async () => {
    const active = DeletionRequest.request({
      id: DeletionRequestId('req-1'),
      userId: USER as UserId,
      scheduledFor: new Date(Date.now() + 1_000_000),
    });
    const repo = new FakeRepo(active);
    await new CancelAccountDeletionHandler(repo).execute(new CancelAccountDeletionCommand(USER));
    expect(repo.saved[0]!.status).toBe('cancelled');
  });

  it('throws NotFoundError when there is no live request', async () => {
    const repo = new FakeRepo(null);
    await expect(
      new CancelAccountDeletionHandler(repo).execute(new CancelAccountDeletionCommand(USER)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
