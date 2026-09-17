'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { errorOutlinedButtonClass, neutralButtonClass } from '@/components/primary-button';
import { deletePollAction, setPollStatusAction } from '../../actions';

/** Host dashboard controls: edit, close/reopen, delete. Client component so the
 * destructive delete can confirm and the toggle can run in a transition. */
export function PollAdminControls({
  pollId,
  status,
}: {
  pollId: string;
  status: 'open' | 'closed';
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/polls/${pollId}/edit`} className={neutralButtonClass('sm')}>
        Edit
      </Link>
      <button
        type="button"
        className={neutralButtonClass('sm')}
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setPollStatusAction(pollId, status === 'open' ? 'closed' : 'open');
          })
        }
      >
        {status === 'open' ? 'Close poll' : 'Reopen poll'}
      </button>
      <button
        type="button"
        className={errorOutlinedButtonClass('sm')}
        disabled={pending}
        onClick={() => {
          if (!window.confirm('Delete this poll and all its responses? This cannot be undone.')) {
            return;
          }
          start(async () => {
            await deletePollAction(pollId);
          });
        }}
      >
        Delete
      </button>
    </div>
  );
}
