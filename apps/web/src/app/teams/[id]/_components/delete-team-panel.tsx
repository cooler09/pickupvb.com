'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { deleteTeamAction } from '../delete-actions';

type State = { error?: string; ok?: boolean };
const initialState: State = {};

/**
 * Captain-only "Danger zone" panel rendered inside `TeamViewerChrome` once
 * the viewer is confirmed to be the captain. Two-step confirm.
 */
export function DeleteTeamPanel({ teamId, teamName }: { teamId: string; teamName: string }) {
  const action = deleteTeamAction.bind(null, teamId);
  const [state, formAction] = useFormState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
      <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">Delete team</h2>
      <p className="mt-1 text-xs text-red-900/80 dark:text-red-200/80">
        Hides <strong>{teamName}</strong> from every public surface. Historical tournament
        registrations are retained, but the team page will 404 and the slug stays reserved. Upcoming
        registrations must be withdrawn first.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-900/40"
        >
          Delete team…
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
              Keep team
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
      {pending ? 'Deleting…' : 'Yes, delete team'}
    </button>
  );
}
