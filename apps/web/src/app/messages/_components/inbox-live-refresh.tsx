'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToNotifications } from '@/lib/subscribe-notifications';

/**
 * Keeps the server-rendered inbox fresh (audit MU-15). `/messages` is a server
 * component, so a message arriving while the user sits on it would otherwise
 * leave the list (previews, unread dots, ordering) stale until the next
 * navigation — only the nav badge updated live. This island subscribes to the
 * same shared `notifications:{uid}` Broadcast topic the badge uses (ADR 0027)
 * and calls `router.refresh()` on a `chat.message.received` ping, re-running the
 * server component to reconcile the list. The ping is coalesced upstream (one
 * per conversation per unread window), so refreshes stay bounded on a busy room.
 * Renders nothing.
 */
export function InboxLiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(
    () =>
      subscribeToNotifications(userId, (row) => {
        if (row.kind === 'chat.message.received') router.refresh();
      }),
    [userId, router],
  );
  return null;
}
