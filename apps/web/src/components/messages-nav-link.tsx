'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { subscribeToNotifications } from '@/lib/subscribe-notifications';

/**
 * Site-header "Messages" link with a live unread badge (ADR 0028 Phase 2 + the
 * ADR 0027 Realtime path). The `initialUnread` count is server-rendered from
 * `count_unread_conversations`; from there the badge increments live when a new
 * `chat.message.received` notification arrives over the shared notifications
 * channel (the same signal the {@link NotificationBell} consumes).
 *
 * The live increment is an approximate nudge between navigations: a DM ping is
 * coalesced (one per conversation per unread window), so each increment tracks a
 * newly-active conversation; the exact count re-syncs from the server RPC on the
 * next navigation (including landing on `/messages`, which marks read). Rooms
 * join the live signal once room pings land (notifications audit P2). Styled to
 * match {@link NotificationBell}.
 */
export function MessagesNavLink({
  userId,
  initialUnread,
}: {
  userId: string;
  initialUnread: number;
}) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(
    () =>
      subscribeToNotifications(userId, (row) => {
        if (row.kind === 'chat.message.received') setUnread((u) => u + 1);
      }),
    [userId],
  );

  const badge = unread > 99 ? '99+' : String(unread);
  return (
    <Link
      href="/messages"
      aria-label={`Messages${unread > 0 ? ` (${unread} unread)` : ''}`}
      className="tap-target text-fg/70 hover:bg-fg/5 hover:text-primary focus-visible:ring-primary relative rounded-md transition-colors focus:outline-none focus-visible:ring-2"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      {unread > 0 && (
        <span className="bg-primary ring-surface text-primary-fg absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold ring-2">
          {badge}
        </span>
      )}
    </Link>
  );
}
