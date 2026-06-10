'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { addFriend, removeFriend } from '@/app/friends/actions';
import { startDmWithUser, blockUser, unblockUser } from '@/app/_actions/chat-actions';
import { ShareLink } from '@/components/share-link';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import { useToast } from '@/components/toast';

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
  | { status: 'other'; isFollowing: boolean; isBlocked: boolean };

const menuItemClass =
  'state-layer data-[highlighted]:bg-fg/5 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm outline-none';

/**
 * Renders the viewer-conditional CTA row for `/players/[id]` — follow /
 * unfollow / sign-in / edit-profile, plus share and a `⋯` overflow menu
 * (block / unblock — PUB-11). Lives in a client island so the surrounding
 * profile page can stay ISR-cacheable. Hydrates with one
 * `supabase.auth.getUser()` and (if the viewer is signed in but not looking at
 * their own profile) parallel `friendships` + `user_blocks` lookups.
 */
export function PlayerViewerActions({ profileId, profileHandle, profileName, returnPath }: Props) {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });
  const [isPending, startTransition] = useTransition();
  const [isMessaging, startMessaging] = useTransition();
  const [isBlocking, startBlocking] = useTransition();
  const router = useRouter();
  const { show } = useToast();

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
      const [{ data: edge }, { data: blockRow }] = await Promise.all([
        supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', user.id)
          .eq('friend_id', profileId)
          .maybeSingle(),
        // `user_blocks_select` is owner-scoped (`blocker_id = auth.uid()`), so
        // this only ever returns the viewer's own block of this profile.
        supabase
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', user.id)
          .eq('blocked_id', profileId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setState({ status: 'other', isFollowing: Boolean(edge), isBlocked: Boolean(blockRow) });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  function handleFollow() {
    const blocked = state.status === 'other' ? state.isBlocked : false;
    startTransition(async () => {
      setState({ status: 'other', isFollowing: true, isBlocked: blocked });
      try {
        await addFriend(profileId, returnPath);
      } catch {
        setState({ status: 'other', isFollowing: false, isBlocked: blocked });
        show({ variant: 'error', message: 'Couldn’t follow. Try again.' });
      }
    });
  }

  function handleUnfollow() {
    const blocked = state.status === 'other' ? state.isBlocked : false;
    startTransition(async () => {
      setState({ status: 'other', isFollowing: false, isBlocked: blocked });
      try {
        await removeFriend(profileId, returnPath);
      } catch {
        setState({ status: 'other', isFollowing: true, isBlocked: blocked });
        show({ variant: 'error', message: 'Couldn’t unfollow. Try again.' });
      }
    });
  }

  function handleMessage() {
    startMessaging(async () => {
      const res = await startDmWithUser(profileId);
      if (res.ok) {
        router.push(`/messages/${res.value.conversationId}` as Route);
      } else {
        show({
          variant: 'error',
          message:
            res.error === 'forbidden'
              ? 'You can’t message this person.'
              : 'Couldn’t open the conversation. Try again.',
        });
      }
    });
  }

  function handleBlock() {
    if (state.status !== 'other') return;
    const following = state.isFollowing;
    startBlocking(async () => {
      setState({ status: 'other', isFollowing: following, isBlocked: true });
      const res = await blockUser(profileId);
      if (!res.ok) {
        setState({ status: 'other', isFollowing: following, isBlocked: false });
        show({ variant: 'error', message: 'Couldn’t block. Try again.' });
        return;
      }
      show({ variant: 'success', message: `Blocked ${profileName}.` });
    });
  }

  function handleUnblock() {
    if (state.status !== 'other') return;
    const following = state.isFollowing;
    startBlocking(async () => {
      setState({ status: 'other', isFollowing: following, isBlocked: false });
      const res = await unblockUser(profileId);
      if (!res.ok) {
        setState({ status: 'other', isFollowing: following, isBlocked: true });
        show({ variant: 'error', message: 'Couldn’t unblock. Try again.' });
      }
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
        <Link href={'/profile' as Route} className={primaryButtonClass('sm')}>
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
          className={primaryButtonClass('sm')}
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
          type="button"
          onClick={handleUnfollow}
          disabled={isPending}
          aria-pressed={true}
          className={neutralButtonClass('sm')}
        >
          ✓ Following
        </button>
      ) : (
        <button
          type="button"
          onClick={handleFollow}
          disabled={isPending}
          aria-pressed={false}
          className={primaryButtonClass('sm')}
        >
          + Follow
        </button>
      )}
      {/* A blocked pair can't DM (RLS `is_blocked_pair`), so hide Message rather
          than offer an action that's guaranteed to fail. */}
      {!state.isBlocked && (
        <button
          type="button"
          onClick={handleMessage}
          disabled={isMessaging}
          className={neutralButtonClass('sm')}
        >
          {isMessaging ? 'Opening…' : 'Message'}
        </button>
      )}
      <ShareLink path={`/players/${profileHandle}`} title={profileName} />

      <RadixDropdownMenu.Root>
        <RadixDropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${profileName}`}
            className="tap-target border-border-base bg-bg hover:bg-fg/5 text-fg inline-flex items-center justify-center rounded-md border"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="12" cy="19" r="1.7" />
            </svg>
          </button>
        </RadixDropdownMenu.Trigger>
        <RadixDropdownMenu.Portal>
          <RadixDropdownMenu.Content
            align="end"
            sideOffset={6}
            aria-label={`More actions for ${profileName}`}
            className="md-menu-motion border-border-base bg-md-surface-container-high text-fg shadow-elevation-2 z-50 min-w-48 overflow-hidden rounded-md border py-1"
          >
            {state.isBlocked ? (
              <RadixDropdownMenu.Item
                className={menuItemClass}
                disabled={isBlocking}
                onSelect={handleUnblock}
              >
                Unblock {profileName}
              </RadixDropdownMenu.Item>
            ) : (
              <RadixDropdownMenu.Item
                className={`${menuItemClass} text-md-error`}
                disabled={isBlocking}
                onSelect={handleBlock}
              >
                Block {profileName}
              </RadixDropdownMenu.Item>
            )}
          </RadixDropdownMenu.Content>
        </RadixDropdownMenu.Portal>
      </RadixDropdownMenu.Root>
    </>
  );
}
