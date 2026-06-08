'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import type { MessageView } from '@pickupvb/domain';
import { ConversationView } from '@/components/conversation-view';
import { BlockControl } from './block-control';

type Props = {
  conversationId: string;
  viewerId: string;
  /** Counterpart's display name (the thread heading). */
  heading: string;
  otherUserId: string;
  otherHandle: string;
  initiallyBlocked: boolean;
  participants: { id: string; name: string }[];
  initialMessages: MessageView[];
  initialHasMore: boolean;
  initialNextBefore: string | null;
};

/**
 * DM thread body — the counterpart title row (profile link + block toggle) and
 * the live {@link ConversationView}, sharing one `blocked` state so blocking
 * immediately swaps the composer for a banner instead of letting the next send
 * fail against RLS (audit M-9). Rooms and DMs with a deleted counterpart don't
 * use this — they have no block relationship to manage.
 */
export function DmThread({
  conversationId,
  viewerId,
  heading,
  otherUserId,
  otherHandle,
  initiallyBlocked,
  participants,
  initialMessages,
  initialHasMore,
  initialNextBefore,
}: Props) {
  const [blocked, setBlocked] = useState(initiallyBlocked);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/players/${otherHandle}` as Route}
          className="text-title-lg truncate font-bold hover:underline"
        >
          {heading}
        </Link>
        <BlockControl otherUserId={otherUserId} blocked={blocked} onChange={setBlocked} />
      </div>
      <ConversationView
        conversationId={conversationId}
        viewerId={viewerId}
        kind="dm"
        blocked={blocked}
        initialMessages={initialMessages}
        initialHasMore={initialHasMore}
        initialNextBefore={initialNextBefore}
        participants={participants}
      />
    </>
  );
}
