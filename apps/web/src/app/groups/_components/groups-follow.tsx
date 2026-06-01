'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { followGroup, unfollowGroup } from '@/app/groups/follow-actions';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';

/**
 * Follow-from-the-directory support for `/groups` (G-2) — the groups twin of
 * `players-follow.tsx` (PL-2). The page stays sessionless + ISR; this client
 * provider resolves the viewer + their followed-group set **once** for the
 * whole grid (one `auth.getUser()` + one `group_followers` lookup scoped to
 * the visible ids — the viewer reads their own edges, which the owner-only
 * RLS select policy allows), and each card's {@link GroupFollowButton} reads
 * context. Buttons render only for a signed-in (non-anon) viewer, so the
 * server-rendered HTML is unchanged — follow is progressive enhancement.
 */
type FollowCtx = {
  ready: boolean;
  /** null = anonymous / not signed in (no follow affordance). */
  viewerId: string | null;
  following: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  toggle: (groupId: string) => void;
};

const Ctx = createContext<FollowCtx | null>(null);

export function GroupsFollowProvider({
  groupIds,
  children,
}: {
  groupIds: string[];
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [following, setFollowing] = useState<ReadonlySet<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  const idsKey = groupIds.join(',');

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    async function load() {
      const ids = idsKey ? idsKey.split(',') : [];
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) {
          setViewerId(null);
          setReady(true);
        }
        return;
      }
      if (!cancelled) setViewerId(user.id);
      if (ids.length > 0) {
        const { data: edges } = await supabase
          .from('group_followers')
          .select('group_id')
          .eq('user_id', user.id)
          .in('group_id', ids);
        if (!cancelled && edges) {
          setFollowing(new Set((edges as { group_id: string }[]).map((e) => e.group_id)));
        }
      }
      if (!cancelled) setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  function toggle(groupId: string) {
    const wasFollowing = following.has(groupId);
    setFollowing((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setPendingIds((prev) => new Set(prev).add(groupId));
    void (async () => {
      try {
        if (wasFollowing) await unfollowGroup(groupId, '/groups');
        else await followGroup(groupId, '/groups');
      } catch {
        setFollowing((prev) => {
          const next = new Set(prev);
          if (wasFollowing) next.add(groupId);
          else next.delete(groupId);
          return next;
        });
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      }
    })();
  }

  return (
    <Ctx.Provider value={{ ready, viewerId, following, pendingIds, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * Per-card follow toggle. Renders nothing while the viewer is resolving or for
 * anonymous viewers, so the ISR/anon shell is untouched and the button is pure
 * progressive enhancement.
 */
export function GroupFollowButton({ groupId }: { groupId: string }) {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.ready || ctx.viewerId === null) return null;

  const isFollowing = ctx.following.has(groupId);
  const pending = ctx.pendingIds.has(groupId);

  return (
    <button
      type="button"
      onClick={() => ctx.toggle(groupId)}
      disabled={pending}
      aria-pressed={isFollowing}
      // `relative z-10` lifts the button above the card's stretched-link
      // overlay so it captures its own click instead of navigating.
      className={`relative z-10 shrink-0 ${
        isFollowing ? secondaryButtonClass('sm') : primaryButtonClass('sm')
      }`}
    >
      {isFollowing ? '✓ Following' : '+ Follow'}
    </button>
  );
}
