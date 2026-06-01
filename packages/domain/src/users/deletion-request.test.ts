import { describe, it, expect } from 'vitest';
import { DeletionRequest, DeletionRequestId } from './deletion-request.js';
import type { UserId } from './user-profile.js';
import { InvariantViolation } from '../shared/result.js';

const ID = DeletionRequestId('req-1');
const USER = 'user-1' as UserId;

function scheduled(scheduledFor: Date): DeletionRequest {
  return DeletionRequest.request({ id: ID, userId: USER, scheduledFor });
}

describe('DeletionRequest', () => {
  it('request() starts in scheduled with the given window and no resolution', () => {
    const future = new Date('2026-06-30T00:00:00.000Z');
    const req = scheduled(future);
    expect(req.status).toBe('scheduled');
    expect(req.isScheduled).toBe(true);
    expect(req.scheduledFor).toEqual(future);
    expect(req.resolvedAt).toBeNull();
  });

  it('isDue() is true only once scheduledFor has passed', () => {
    const req = scheduled(new Date('2026-06-30T00:00:00.000Z'));
    expect(req.isDue(new Date('2026-06-29T23:59:59.000Z'))).toBe(false);
    expect(req.isDue(new Date('2026-06-30T00:00:01.000Z'))).toBe(true);
  });

  it('cancel() moves scheduled → cancelled and stamps resolvedAt', () => {
    const req = scheduled(new Date('2026-06-30T00:00:00.000Z'));
    const at = new Date('2026-06-01T12:00:00.000Z');
    req.cancel(at);
    expect(req.status).toBe('cancelled');
    expect(req.resolvedAt).toEqual(at);
    expect(req.isScheduled).toBe(false);
  });

  it('markExecuted() moves scheduled → executed and stamps resolvedAt', () => {
    const req = scheduled(new Date('2026-06-30T00:00:00.000Z'));
    const at = new Date('2026-07-01T00:00:00.000Z');
    req.markExecuted(at);
    expect(req.status).toBe('executed');
    expect(req.resolvedAt).toEqual(at);
  });

  it('cannot cancel or execute a request that already left scheduled', () => {
    const cancelled = scheduled(new Date('2026-06-30T00:00:00.000Z'));
    cancelled.cancel();
    expect(() => cancelled.cancel()).toThrow(InvariantViolation);
    expect(() => cancelled.markExecuted()).toThrow(InvariantViolation);

    const executed = scheduled(new Date('2026-06-30T00:00:00.000Z'));
    executed.markExecuted();
    expect(() => executed.markExecuted()).toThrow(InvariantViolation);
    expect(() => executed.cancel()).toThrow(InvariantViolation);
  });

  it('fromPersistence rehydrates without forcing a transition', () => {
    const req = DeletionRequest.fromPersistence({
      id: ID,
      userId: USER,
      status: 'cancelled',
      reason: 'moving on',
      requestedAt: new Date('2026-05-01T00:00:00.000Z'),
      scheduledFor: new Date('2026-05-31T00:00:00.000Z'),
      resolvedAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    expect(req.status).toBe('cancelled');
    expect(req.reason).toBe('moving on');
  });
});
