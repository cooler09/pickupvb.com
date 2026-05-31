'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Alert } from '@/components/alert';
import { FieldError, fieldA11y } from '@/components/field-error';
import { TextField } from '@/components/text-field';
import { createTeamAction, type TeamFormState } from '../actions';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

const initial: TeamFormState = {};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {pending ? 'Creating…' : 'Create team'}
    </button>
  );
}

export default function NewTeamForm() {
  const [state, formAction] = useFormState(createTeamAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <TextField name="name" label="Team name" errors={state.fieldErrors} required maxLength={80} />
      <div>
        <label htmlFor="format" className={labelClass}>
          Format
        </label>
        <select
          id="format"
          name="format"
          required
          defaultValue=""
          className={inputClass}
          {...fieldA11y('format', state.fieldErrors)}
        >
          <option value="" disabled>
            Pick a format…
          </option>
          {Object.entries(FORMAT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-muted mt-1 text-xs">
          A team can only sign up for tournaments matching its format.
        </p>
        <FieldError name="format" errors={state.fieldErrors} />
      </div>
      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}
