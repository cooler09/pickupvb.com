'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { TextField } from '@/components/text-field';
import { createTeamAction, type TeamFormState } from '../actions';

const initial: TeamFormState = {};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Creating…' : 'Create team'}
    </button>
  );
}

export default function NewTeamForm() {
  const [state, formAction] = useFormState(createTeamAction, initial);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{state.error}</Alert>
        </div>
      )}
      <TextField name="name" label="Team name" errors={state.fieldErrors} required maxLength={80} />
      <p className="text-muted text-xs">
        A team is just your group of players. You can sign it up for tournaments and leagues of any
        format.
      </p>
      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}
