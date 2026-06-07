import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `notifyNewFollower` lights up the `social.follow.new` kind, which had a
 * template but no trigger. These pin the decisions that would silently
 * regress: it pings the *followed* user (never self), reads the follower name
 * from `profiles_public`, and coalesces a follow/unfollow/re-follow churn so
 * the bell isn't spammed. Supabase + the `notify` fan-out are mocked at the
 * module boundary so no IO happens.
 */
const h = vi.hoisted(() => ({
  adminFactory: vi.fn(),
  notify: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@pickupvb/supabase', () => ({ createSupabaseAdminClient: h.adminFactory }));
vi.mock('@/lib/notify', () => ({ notify: h.notify }));
vi.mock('@/lib/log', () => ({ log: { warn: h.warn } }));

import { notifyNewFollower } from './notify-follow';

type Canned = {
  follower: { display_name: string | null } | null;
  recentUnread: { id: string }[];
};

function fakeAdmin(canned: Canned) {
  function builder(data: unknown) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'is', 'limit']) b[m] = chain;
    b['maybeSingle'] = () => Promise.resolve({ data, error: null });
    b['then'] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(onF, onR);
    return b;
  }
  return {
    from: (table: string) => {
      if (table === 'profiles_public') return builder(canned.follower);
      if (table === 'notifications') return builder(canned.recentUnread);
      return builder(null);
    },
  };
}

function setCanned(canned: Canned) {
  h.adminFactory.mockReturnValue(fakeAdmin(canned));
}

beforeEach(() => {
  h.notify.mockReset();
  h.notify.mockResolvedValue(undefined);
  h.adminFactory.mockReset();
  h.warn.mockReset();
});

describe('notifyNewFollower', () => {
  it('does nothing (and never builds the admin client) for a self-follow', async () => {
    await notifyNewFollower({ followerId: 'u1', followedId: 'u1' });
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.adminFactory).not.toHaveBeenCalled();
  });

  it('pings the followed user with the follower name from profiles_public', async () => {
    setCanned({ follower: { display_name: 'Pat' }, recentUnread: [] });
    await notifyNewFollower({ followerId: 'follower', followedId: 'followed' });
    expect(h.notify).toHaveBeenCalledTimes(1);
    const [kind, userId, payload] = h.notify.mock.calls[0]!;
    expect(kind).toBe('social.follow.new');
    expect(userId).toBe('followed');
    expect(payload).toMatchObject({ followerId: 'follower', followerName: 'Pat' });
  });

  it('coalesces: skips when an unread follow ping from the same follower exists', async () => {
    setCanned({ follower: { display_name: 'Pat' }, recentUnread: [{ id: 'existing' }] });
    await notifyNewFollower({ followerId: 'follower', followedId: 'followed' });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('falls back to "Someone" when the follower card is missing', async () => {
    setCanned({ follower: null, recentUnread: [] });
    await notifyNewFollower({ followerId: 'follower', followedId: 'followed' });
    const [, , payload] = h.notify.mock.calls[0]!;
    expect((payload as { followerName: string }).followerName).toBe('Someone');
  });
});
