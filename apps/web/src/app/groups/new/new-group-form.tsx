'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { FieldError, fieldA11y } from '@/components/field-error';
import { createGroupAction, type GroupFormState } from '../group-form-actions';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

const initial: GroupFormState = {};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Creating…' : 'Create group'}
    </button>
  );
}

export default function NewGroupForm() {
  const [state, formAction] = useFormState(createGroupAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          className={inputClass}
          {...fieldA11y('name', state.fieldErrors)}
        />
        <FieldError name="name" errors={state.fieldErrors} />
      </div>
      <div>
        <label htmlFor="slug" className={labelClass}>
          Slug (URL handle)
        </label>
        <input
          id="slug"
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
          placeholder="vb-club-of-vb"
          className={inputClass}
          {...fieldA11y('slug', state.fieldErrors)}
        />
        <p className="text-muted mt-1 text-xs">3–40 chars, lowercase letters, numbers, dashes.</p>
        <FieldError name="slug" errors={state.fieldErrors} />
      </div>
      <div>
        <label htmlFor="description" className={labelClass}>
          Description <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="home_city" className={labelClass}>
            Home city
          </label>
          <input id="home_city" name="home_city" maxLength={80} className={inputClass} />
        </div>
        <div>
          <label htmlFor="region" className={labelClass}>
            Region / state
          </label>
          <input id="region" name="region" maxLength={80} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="avatar_url" className={labelClass}>
          Avatar URL <span className="text-fg/50">(optional)</span>
        </label>
        <input id="avatar_url" name="avatar_url" type="url" className={inputClass} />
      </div>
      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}
