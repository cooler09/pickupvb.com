'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { addFriend, removeFriend } from '@/app/friends/actions';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';

/**
 * Follow-from-the-directory support for `/players` (PL-2). The page itself
 * stays a sessionless, ISR-cached server component; this client provider
 * resolves the viewer + their following-set **once** for the whole grid
 * (one `auth.getUser()` + one `friendships` lookup scoped to the visible
 * ids), and each card's {@link FollowButton} reads from context. Buttons
 * render only for a signed-in viewer looking at someone else, so the
 * server-rendered (anon) HTML is unchanged — follow is progressive
 * enhancement layered on after hydration.
 */
type FollowCtx = {
  ready: boolean;
  /** null = anonymous / not signed in (no follow affordance). */
  viewerId: string | null;
  following: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  toggle: (playerId: string) => void;
};

const Ctx = createContext<FollowCtx | null>(null);

export function PlayersFollowProvider({
  playerIds,
  children,
}: {
  playerIds: string[];
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [following, setFollowing] = useState<ReadonlySet<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  const idsKey = playerIds.join(',');

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
          .from('friendships')
          .select('friend_id')
          .eq('user_id', user.id)
          .in('friend_id', ids);
        if (!cancelled && edges) {
          setFollowing(new Set((edges as { friend_id: string }[]).map((e) => e.friend_id)));
        }
      }
      if (!cancelled) setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  function toggle(playerId: string) {
    const wasFollowing = following.has(playerId);
    // Optimistic flip; revert on failure.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setPendingIds((prev) => new Set(prev).add(playerId));
    void (async () => {
      try {
        if (wasFollowing) await removeFriend(playerId, '/players');
        else await addFriend(playerId, '/players');
      } catch {
        setFollowing((prev) => {
          const next = new Set(prev);
          if (wasFollowing) next.add(playerId);
          else next.delete(playerId);
          return next;
        });
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
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
 * Per-card follow toggle. Renders nothing while the viewer is resolving, for
 * anonymous viewers, or on the viewer's own card — so the ISR/anon shell is
 * untouched and the button is pure progressive enhancement.
 */
export function FollowButton({ playerId }: { playerId: string }) {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.ready) return null;
  if (ctx.viewerId === null || ctx.viewerId === playerId) return null;

  const isFollowing = ctx.following.has(playerId);
  const pending = ctx.pendingIds.has(playerId);

  return (
    <button
      type="button"
      onClick={() => ctx.toggle(playerId)}
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
