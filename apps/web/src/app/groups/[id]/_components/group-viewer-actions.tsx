'use client';

import { useEffect, useState } from 'react';
import {
  neutralButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/primary-button';
import Link from 'next/link';
import type { Route } from 'next';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { followGroup, unfollowGroup } from '@/app/groups/follow-actions';
import { ShareLink } from '@/components/share-link';
import { SubmitButton } from '@/components/submit-button';

type Props = {
  groupId: string;
  groupSlug: string;
  groupName: string;
  returnPath: string;
  /** User IDs currently in `group_members` with owner/admin role. */
  managerIds: ReadonlyArray<string>;
};

type ViewerState =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'signed-in'; userId: string; isFollowing: boolean; canManage: boolean };

/**
 * Renders the viewer-conditional action row for `/groups/[id]` — follow /
 * unfollow, share, and (for owners/admins) Host event + Edit links.
 * Lives in a client island so the surrounding page can stay ISR-cacheable.
 * Hydrates with one `supabase.auth.getUser()` + one `group_followers`
 * lookup.
 */
export function GroupViewerActions({
  groupId,
  groupSlug,
  groupName,
  returnPath,
  managerIds,
}: Props) {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });

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
      const { data: follow } = await supabase
        .from('group_followers')
        .select('group_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setState({
        status: 'signed-in',
        userId: user.id,
        isFollowing: Boolean(follow),
        canManage: managerIds.includes(user.id),
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [groupId, managerIds]);

  // Loading: render a low-impact placeholder so the row keeps its height.
  if (state.status === 'loading') {
    return (
      <>
        <span
          aria-hidden="true"
          className="border-border-base bg-fg/5 inline-block h-8 w-24 animate-pulse rounded-md border"
        />
        <ShareLink path={`/groups/${groupSlug}`} title={groupName} />
      </>
    );
  }

  if (state.status === 'anon') {
    return (
      <>
        <Link
          href={`/login?next=${encodeURIComponent(returnPath)}`}
          className={neutralButtonClass('sm')}
        >
          Sign in to follow
        </Link>
        <ShareLink path={`/groups/${groupSlug}`} title={groupName} />
      </>
    );
  }

  return (
    <>
      {state.isFollowing ? (
        <form action={unfollowGroup.bind(null, groupId, returnPath)}>
          <SubmitButton className={neutralButtonClass('sm')}>✓ Following</SubmitButton>
        </form>
      ) : (
        <form action={followGroup.bind(null, groupId, returnPath)}>
          <SubmitButton className={primaryButtonClass('sm')}>+ Follow</SubmitButton>
        </form>
      )}
      <ShareLink path={`/groups/${groupSlug}`} title={groupName} />
      {state.canManage && (
        <>
          <Link
            href={`/events/new?host_group=${groupSlug}` as Route}
            className={`${secondaryButtonClass('sm')} ml-auto`}
          >
            Host an event
          </Link>
          <Link href={`/groups/${groupSlug}/polls` as Route} className={neutralButtonClass('sm')}>
            Polls
          </Link>
          <Link href={`/groups/${groupSlug}/edit` as Route} className={neutralButtonClass('sm')}>
            Edit
          </Link>
          <Link href={`/groups/${groupSlug}/billing` as Route} className={neutralButtonClass('sm')}>
            Club &amp; payouts
          </Link>
        </>
      )}
    </>
  );
}

type ManageMembersProps = {
  groupSlug: string;
  managerIds: ReadonlyArray<string>;
};

/**
 * Client island for the "Manage members →" CTA in the members section.
 * Renders only when the viewer is an owner/admin. Mirrors the same
 * hydration pattern as `GroupViewerActions`.
 */
export function GroupManageMembersLink({ groupSlug, managerIds }: ManageMembersProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || user.is_anonymous) return;
      if (managerIds.includes(user.id) && !cancelled) setShow(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [managerIds]);

  if (!show) return null;
  return (
    <Link
      href={`/groups/${groupSlug}/members` as Route}
      className="text-primary text-sm font-medium hover:underline"
    >
      Manage members →
    </Link>
  );
}
