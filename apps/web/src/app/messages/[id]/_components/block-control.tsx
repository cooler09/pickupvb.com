'use client';

import { useTransition } from 'react';
import { blockUser, unblockUser } from '@/app/_actions/chat-actions';

/**
 * Block / unblock toggle for a DM counterpart (ADR 0028, Phase 3). Controlled:
 * the parent ({@link DmThread}) owns `blocked` so the same state also drives the
 * composer banner (audit M-9). Optimistic with rollback — `onChange` flips
 * immediately and reverts if the server call fails. Blocking takes effect via
 * `is_blocked_pair` in RLS.
 */
export function BlockControl({
  otherUserId,
  blocked,
  onChange,
}: {
  otherUserId: string;
  blocked: boolean;
  onChange: (next: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = !blocked;
      onChange(next); // optimistic
      const res = next ? await blockUser(otherUserId) : await unblockUser(otherUserId);
      if (!res.ok) onChange(!next); // revert on failure
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={blocked}
      className="text-muted hover:text-md-error -my-1 shrink-0 rounded px-2 py-1.5 text-xs disabled:opacity-50"
    >
      {blocked ? 'Unblock' : 'Block'}
    </button>
  );
}
