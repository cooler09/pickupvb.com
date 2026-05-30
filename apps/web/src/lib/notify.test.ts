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
  const inApp: InAppNotification[] = [];
  const port: NotificationOutboxPort = {
    loadPreferences: async () => prefs,
    getUserEmail: async () => email,
    enqueue: async (m) => {
      enqueued.push(m);
    },
    insertInApp: async (n) => {
      inApp.push(n);
    },
  };
  return { port, enqueued, inApp };
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
