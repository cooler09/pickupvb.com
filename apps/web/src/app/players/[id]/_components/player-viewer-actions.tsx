'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { addFriend, removeFriend } from '@/app/friends/actions';
import { startDmWithUser } from '@/app/_actions/chat-actions';
import { ShareLink } from '@/components/share-link';

type Props = {
  profileId: string;
  profileHandle: string;
  profileName: string;
  returnPath: string;
};

type ViewerState =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'self' }
  | { status: 'other'; isFollowing: boolean };

/**
 * Renders the viewer-conditional CTA row for `/players/[id]` — follow /
 * unfollow / sign-in / edit-profile, plus share. Lives in a client island
 * so the surrounding profile page can stay ISR-cacheable. Hydrates with
 * one `supabase.auth.getUser()` and (if the viewer is signed in but not
 * looking at their own profile) one `friendships` lookup.
 */
export function PlayerViewerActions({ profileId, profileHandle, profileName, returnPath }: Props) {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });
  const [isPending, startTransition] = useTransition();
  const [isMessaging, startMessaging] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) setState({ status: 'anon' });
        return;
      }
      if (user.id === profileId) {
        if (!cancelled) setState({ status: 'self' });
        return;
      }
      const { data: edge } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('friend_id', profileId)
        .maybeSingle();
      if (cancelled) return;
      setState({ status: 'other', isFollowing: Boolean(edge) });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  function handleFollow() {
    startTransition(async () => {
      setState({ status: 'other', isFollowing: true });
      try {
        await addFriend(profileId, returnPath);
      } catch {
        setState({ status: 'other', isFollowing: false });
      }
    });
  }

  function handleUnfollow() {
    startTransition(async () => {
      setState({ status: 'other', isFollowing: false });
      try {
        await removeFriend(profileId, returnPath);
      } catch {
        setState({ status: 'other', isFollowing: true });
      }
    });
  }

  function handleMessage() {
    startMessaging(async () => {
      const res = await startDmWithUser(profileId);
      if (res.ok) router.push(`/messages/${res.value.conversationId}` as Route);
    });
  }

  if (state.status === 'loading') {
    return (
      <>
        <span
          aria-hidden="true"
          className="border-border-base bg-fg/5 inline-block h-8 w-24 animate-pulse rounded-md border"
        />
        <ShareLink path={`/players/${profileHandle}`} title={profileName} />
      </>
    );
  }

  if (state.status === 'self') {
    return (
      <>
        <Link
          href={'/profile' as Route}
          className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Edit profile →
        </Link>
        <ShareLink path={`/players/${profileHandle}`} title={profileName} />
      </>
    );
  }

  if (state.status === 'anon') {
    return (
      <>
        <Link
          href={`/login?next=${encodeURIComponent(returnPath)}` as Route}
          className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Sign in to follow
        </Link>
        <ShareLink path={`/players/${profileHandle}`} title={profileName} />
      </>
    );
  }

  return (
    <>
      {state.isFollowing ? (
        <button
          onClick={handleUnfollow}
          disabled={isPending}
          className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          ✓ Following
        </button>
      ) : (
        <button
          onClick={handleFollow}
          disabled={isPending}
          className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          + Follow
        </button>
      )}
      <button
        onClick={handleMessage}
        disabled={isMessaging}
        className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
      >
        {isMessaging ? 'Opening…' : 'Message'}
      </button>
      <ShareLink path={`/players/${profileHandle}`} title={profileName} />
    </>
  );
}
