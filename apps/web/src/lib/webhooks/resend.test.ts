import { describe, it, expect } from 'vitest';

import type { EmailSuppressionPort, EmailSuppressionReason } from '@pickupvb/domain';
import { handleResendEvent, type ResendEvent } from './resend';

/**
 * Audit P2 #3: a hard bounce or complaint must suppress the address; a soft
 * (transient) bounce and every non-failure event must NOT. These pin the
 * classification with a fake port so no Supabase is touched.
 */
function fakeSuppressions(): {
  port: EmailSuppressionPort;
  calls: { address: string; reason: EmailSuppressionReason; messageId?: string }[];
} {
  const calls: { address: string; reason: EmailSuppressionReason; messageId?: string }[] = [];
  const port: EmailSuppressionPort = {
    listSuppressed: async () => [],
    suppress: async (address, reason, providerMessageId) => {
      calls.push({
        address,
        reason,
        ...(providerMessageId ? { messageId: providerMessageId } : {}),
      });
    },
  };
  return { port, calls };
}

function event(over: Partial<ResendEvent>): ResendEvent {
  return { type: 'email.delivered', data: { to: ['a@example.com'], email_id: 'em_1' }, ...over };
}

describe('handleResendEvent — suppression classification (audit P2 #3)', () => {
  it('suppresses on a permanent bounce', async () => {
    const { port, calls } = fakeSuppressions();
    const res = await handleResendEvent(
      event({
        type: 'email.bounced',
        data: { to: ['dead@example.com'], email_id: 'em_2', bounce: { type: 'Permanent' } },
      }),
      port,
    );
    expect(res.suppressed).toBe(1);
    expect(calls).toEqual([{ address: 'dead@example.com', reason: 'bounced', messageId: 'em_2' }]);
  });

  it('suppresses a bounce with no/undetermined type (fail safe)', async () => {
    const { port, calls } = fakeSuppressions();
    await handleResendEvent(
      event({ type: 'email.bounced', data: { to: ['x@example.com'] } }),
      port,
    );
    expect(calls.map((c) => c.reason)).toEqual(['bounced']);
  });

  it('does NOT suppress a transient (soft) bounce', async () => {
    const { port, calls } = fakeSuppressions();
    const res = await handleResendEvent(
      event({
        type: 'email.bounced',
        data: { to: ['busy@example.com'], bounce: { type: 'Transient' } },
      }),
      port,
    );
    expect(res.suppressed).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('suppresses on a complaint', async () => {
    const { port, calls } = fakeSuppressions();
    await handleResendEvent(
      event({ type: 'email.complained', data: { to: ['spammed@example.com'] } }),
      port,
    );
    expect(calls).toEqual([{ address: 'spammed@example.com', reason: 'complained' }]);
  });

  it('ignores delivered / opened / clicked', async () => {
    const { port, calls } = fakeSuppressions();
    for (const type of ['email.delivered', 'email.opened', 'email.clicked', 'email.sent']) {
      await handleResendEvent(event({ type }), port);
    }
    expect(calls).toHaveLength(0);
  });

  it('suppresses every recipient on a multi-address bounce', async () => {
    const { port, calls } = fakeSuppressions();
    const res = await handleResendEvent(
      event({ type: 'email.complained', data: { to: ['a@example.com', 'b@example.com'] } }),
      port,
    );
    expect(res.suppressed).toBe(2);
    expect(calls.map((c) => c.address)).toEqual(['a@example.com', 'b@example.com']);
  });
});
