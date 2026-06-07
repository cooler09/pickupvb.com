'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import {
  errorButtonClass,
  errorOutlinedButtonClass,
  errorTextButtonClass,
} from '@/components/primary-button';
import { fieldInputClass, fieldLabelClass } from '@/components/field-styles';
import { cancelEventAction } from './cancel-actions';
import { useAlertReveal } from '@/components/use-alert-reveal';

type State = { error?: string; ok?: boolean };
const initialState: State = {};

export function CancelEventPanel({
  eventId,
  attendeeCount,
  paidAttendeeCount,
}: {
  eventId: string;
  attendeeCount: number;
  paidAttendeeCount: number;
}) {
  const action = cancelEventAction.bind(null, eventId);
  const [state, formAction] = useFormState(action, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-shape-sm border-md-error/30 bg-md-error-container border p-4">
      <h2 className="text-md-on-error-container text-sm font-semibold">Cancel event</h2>
      <p className="text-md-on-error-container/80 mt-1 text-xs">
        Marks the event cancelled, refunds all paid attendees ({paidAttendeeCount} of{' '}
        {attendeeCount}), and emails everyone who signed up.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${errorOutlinedButtonClass('sm')} mt-3`}
        >
          Cancel event…
        </button>
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          <div>
            <label htmlFor="cancel-reason" className={fieldLabelClass}>
              Reason (shown to attendees, optional)
            </label>
            <textarea
              id="cancel-reason"
              name="reason"
              rows={3}
              maxLength={500}
              placeholder="Weather, low signups, venue conflict…"
              className={fieldInputClass}
            />
          </div>
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
              Keep event
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
      {pending ? 'Cancelling…' : 'Yes, cancel event'}
    </button>
  );
}
