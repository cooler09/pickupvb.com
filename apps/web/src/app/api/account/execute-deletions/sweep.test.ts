import { describe, it, expect, vi } from 'vitest';
import { DeletionRequest, DeletionRequestId, type UserId } from '@pickupvb/domain';
import { runDeletionSweep, type DeletionPort } from './sweep';

function due(id: string): DeletionRequest {
  return DeletionRequest.request({
    id: DeletionRequestId(id),
    userId: `user-${id}` as UserId,
    scheduledFor: new Date('2026-05-01T00:00:00.000Z'), // already elapsed
  });
}

describe('runDeletionSweep', () => {
  it('purges every due request and reports the counts', async () => {
    const executed: string[] = [];
    const port: DeletionPort = {
      findDue: async () => [due('a'), due('b'), due('c')],
      execute: async (req) => {
        executed.push(String(req.id));
      },
    };
    const onError = vi.fn();
    const result = await runDeletionSweep(port, new Date(), onError);
    expect(executed).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ due: 3, purged: 3, failed: 0 });
    expect(onError).not.toHaveBeenCalled();
  });

  it('isolates a failing purge: the rest still run and it is reported, not thrown', async () => {
    const executed: string[] = [];
    const port: DeletionPort = {
      findDue: async () => [due('a'), due('boom'), due('c')],
      execute: async (req) => {
        if (String(req.id) === 'boom') throw new Error('stripe down');
        executed.push(String(req.id));
      },
    };
    const onError = vi.fn();
    const result = await runDeletionSweep(port, new Date(), onError);
    // 'boom' failed but 'a' and 'c' still purged — a failure never strands the rest.
    expect(executed).toEqual(['a', 'c']);
    expect(result).toEqual({ due: 3, purged: 2, failed: 1 });
    expect(onError).toHaveBeenCalledOnce();
    expect(String((onError.mock.calls[0]![0] as DeletionRequest).id)).toBe('boom');
  });

  it('does nothing when no requests are due', async () => {
    const port: DeletionPort = {
      findDue: async () => [],
      execute: vi.fn(),
    };
    const result = await runDeletionSweep(port, new Date(), vi.fn());
    expect(result).toEqual({ due: 0, purged: 0, failed: 0 });
    expect(port.execute).not.toHaveBeenCalled();
  });
});
