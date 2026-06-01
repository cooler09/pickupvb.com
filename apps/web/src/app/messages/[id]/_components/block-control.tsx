'use client';

import { useState, useTransition } from 'react';
import { blockUser, unblockUser } from '@/app/_actions/chat-actions';

/**
 * Block / unblock toggle for a DM counterpart (ADR 0028, Phase 3). Optimistic
 * with rollback. Blocking takes effect via `is_blocked_pair` in RLS — once
 * blocked, neither party can send (the composer surfaces the rejection), so the
 * toggle is the single control; no extra disable wiring on the view.
 */
export function BlockControl({
  otherUserId,
  initiallyBlocked,
}: {
  otherUserId: string;
  initiallyBlocked: boolean;
}) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = !blocked;
      setBlocked(next);
      const res = next ? await blockUser(otherUserId) : await unblockUser(otherUserId);
      if (!res.ok) setBlocked(!next); // revert on failure
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="text-muted shrink-0 text-xs hover:text-red-600 disabled:opacity-50"
    >
      {blocked ? 'Unblock' : 'Block'}
    </button>
  );
}
