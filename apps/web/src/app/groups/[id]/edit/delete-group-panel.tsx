'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { deleteGroupAction } from './delete-actions';

type State = { error?: string; ok?: boolean };
const initialState: State = {};

/**
 * Owner-only "Danger zone" panel on the group edit page. Two-step
 * confirm to avoid an accidental click. Mirrors the shape of
 * `cancel-event-panel.tsx`.
 */
export function DeleteGroupPanel({ groupId, groupName }: { groupId: string; groupName: string }) {
  const action = deleteGroupAction.bind(null, groupId);
  const [state, formAction] = useFormState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
      <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">Delete group</h2>
      <p className="mt-1 text-xs text-red-900/80 dark:text-red-200/80">
        Hides <strong>{groupName}</strong> from every public surface. Members and follow history are
        retained, but the group page will 404 and the slug stays reserved. Past events keep their
        host attribution. Upcoming events must be cancelled or reassigned first.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-900/40"
        >
          Delete group…
        </button>
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          {state.error && (
            <p className="text-sm text-red-700 dark:text-red-300" role="alert">
              {state.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <SubmitButton />
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40"
            >
              Keep group
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Yes, delete group'}
    </button>
  );
}
