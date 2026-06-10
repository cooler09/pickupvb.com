'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import {
  errorButtonClass,
  errorOutlinedButtonClass,
  errorTextButtonClass,
} from '@/components/primary-button';
import { deleteGroupAction } from './delete-actions';
import { useAlertReveal } from '@/components/use-alert-reveal';

type State = { error?: string };
const initialState: State = {};

/**
 * Owner-only "Danger zone" panel on the group edit page. Two-step
 * confirm to avoid an accidental click. Mirrors the shape of
 * `cancel-event-panel.tsx`.
 */
export function DeleteGroupPanel({ groupId, groupName }: { groupId: string; groupName: string }) {
  const action = deleteGroupAction.bind(null, groupId);
  const [state, formAction] = useFormState(action, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-shape-sm border-md-error/30 bg-md-error-container border p-4">
      <h2 className="text-md-on-error-container text-sm font-semibold">Delete group</h2>
      <p className="text-md-on-error-container/80 mt-1 text-xs">
        Hides <strong>{groupName}</strong> from every public surface. Members and follow history are
        retained, but the group page will 404 and the slug stays reserved. Past events keep their
        host attribution. Upcoming events must be cancelled or reassigned first.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${errorOutlinedButtonClass('sm')} mt-3`}
        >
          Delete group…
        </button>
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          {state.error && (
            <p
              ref={errorRef}
              tabIndex={-1}
              className="text-md-error text-sm outline-none"
              role="alert"
            >
              {state.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <SubmitButton />
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={errorTextButtonClass('sm')}
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
    <button type="submit" disabled={pending} className={errorButtonClass('md')}>
      {pending ? 'Deleting…' : 'Yes, delete group'}
    </button>
  );
}
