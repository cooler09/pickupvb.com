import { describe, it, expect } from 'vitest';
import type {
  InAppNotification,
  NotificationOutboxPort,
  NotificationPreferences,
  OutboxMessage,
} from '@pickupvb/domain';
import { dispatch } from './notify';

/**
 * `dispatch` is the fan-out behind `notify()` (ADR 0022). It's the
 * best-effort, silent-in-prod path every notification trigger hits, so these
 * pin which channels fire for a given kind + prefs. Uses a fake
 * `NotificationOutboxPort` so no Supabase is touched.
 */
function fakePort(prefs: NotificationPreferences | null, email: string | null) {
  const enqueued: OutboxMessage[] = [];
  const enqueueCalls: OutboxMessage[][] = [];
  const inApp: InAppNotification[] = [];
  const port: NotificationOutboxPort = {
    loadPreferences: async () => prefs,
    getUserEmail: async () => email,
    enqueue: async (messages) => {
      enqueueCalls.push(messages);
      enqueued.push(...messages);
    },
    insertInApp: async (n) => {
      inApp.push(n);
    },
  };
  return { port, enqueued, enqueueCalls, inApp };
}

const allOff: NotificationPreferences = {
  emailEnabled: false,
  smsEnabled: false,
  pushEnabled: false,
  inAppEnabled: false,
  smsPhone: null,
  smsOptedOutAt: null,
  channelOverrides: {},
};

const SIGNUP_PAYLOAD = {
  eventId: 'e1',
  eventTitle: 'Tuesday Pickup',
  startsAt: '2026-06-01T18:00:00.000Z',
  location: 'Norfolk Rec',
};

describe('dispatch — transactional kind (event.signup.confirmed)', () => {
  it('fans out to in-app + email even when all prefs are off (transactional bypass)', async () => {
    const { port, enqueued, inApp } = fakePort(allOff, 'me@example.com');
    await dispatch(port, 'event.signup.confirmed', 'u1', SIGNUP_PAYLOAD);
    expect(inApp).toHaveLength(1);
    expect(enqueued.map((m) => m.channel)).toEqual(['email']);
    expect(enqueued[0]?.toAddress).toBe('me@example.com');
  });

  it('skips the email channel when the user has no email', async () => {
    const { port, enqueued, inApp } = fakePort(allOff, null);
    await dispatch(port, 'event.signup.confirmed', 'u1', SIGNUP_PAYLOAD);
    expect(inApp).toHaveLength(1);
    expect(enqueued).toHaveLength(0);
  });

  it('namespaces the idempotency key per channel + kind', async () => {
    const { port, enqueued } = fakePort(allOff, 'me@example.com');
    await dispatch(port, 'event.signup.confirmed', 'u1', SIGNUP_PAYLOAD, {
      idempotencyKey: 'evt-42',
    });
    expect(enqueued[0]?.idempotencyKey).toBe('email:event.signup.confirmed:evt-42');
  });

  it('batches the fan-out into a single enqueue call (one DB kick)', async () => {
    const { port, enqueueCalls } = fakePort(allOff, 'me@example.com');
    await dispatch(port, 'event.signup.confirmed', 'u1', SIGNUP_PAYLOAD);
    // Every outbox row for one dispatch goes in one insert → one worker kick (ADR 0026).
    expect(enqueueCalls).toHaveLength(1);
  });

  it('makes no enqueue call when no channel resolves to an outbox row', async () => {
    const { port, enqueueCalls, inApp } = fakePort(allOff, null);
    await dispatch(port, 'event.signup.confirmed', 'u1', SIGNUP_PAYLOAD);
    // In-app still fires (transactional bypass); no outbox row → no kick.
    expect(inApp).toHaveLength(1);
    expect(enqueueCalls).toHaveLength(0);
  });
});

describe('dispatch — chat.message.received (push + in_app, preference-gated)', () => {
  const CHAT_PAYLOAD = {
    conversationId: 'c1',
    senderId: 's1',
    senderName: 'Pat',
    preview: 'hey are you coming tonight?',
  };

  it('fans out to in-app + push when both are enabled', async () => {
    const prefs: NotificationPreferences = { ...allOff, pushEnabled: true, inAppEnabled: true };
    const { port, enqueued, inApp } = fakePort(prefs, 'me@example.com');
    await dispatch(port, 'chat.message.received', 'u1', CHAT_PAYLOAD);
    expect(inApp).toHaveLength(1);
    // No email — a DM is not an email-worthy event.
    expect(enqueued.map((m) => m.channel)).toEqual(['push']);
    // Push rows carry the recipient user id as the address (lib/notify.ts).
    expect(enqueued[0]?.toAddress).toBe('u1');
  });

  it('is non-transactional: suppressed entirely when the user opted out', async () => {
    const { port, enqueued, inApp } = fakePort(allOff, 'me@example.com');
    await dispatch(port, 'chat.message.received', 'u1', CHAT_PAYLOAD);
    expect(inApp).toHaveLength(0);
    expect(enqueued).toHaveLength(0);
  });
});

describe('dispatch — preference gating (social.follow.new, in_app default)', () => {
  it('delivers in-app when no prefs row exists (default-on)', async () => {
    const { port, inApp } = fakePort(null, null);
    await dispatch(port, 'social.follow.new', 'u1', { followerId: 'f1', followerName: 'Pat' });
    expect(inApp).toHaveLength(1);
  });

  it('suppresses in-app when the user disabled it', async () => {
    const { port, inApp, enqueued } = fakePort(allOff, 'me@example.com');
    await dispatch(port, 'social.follow.new', 'u1', { followerId: 'f1', followerName: 'Pat' });
    expect(inApp).toHaveLength(0);
    expect(enqueued).toHaveLength(0);
  });
});
