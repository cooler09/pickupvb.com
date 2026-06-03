'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { updateGroupAction, type GroupFormState } from '@/app/groups/group-form-actions';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

const initial: GroupFormState = {};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

type Group = {
  id: string;
  name: string;
  description: string;
  homeCity: string | null;
  region: string | null;
};

export default function EditGroupForm({ group }: { group: Group }) {
  const action = updateGroupAction.bind(null, group.id);
  const [state, formAction] = useFormState(action, initial);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{state.error}</Alert>
        </div>
      )}
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={group.name}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={group.description}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="home_city" className={labelClass}>
            Home city
          </label>
          <input
            id="home_city"
            name="home_city"
            maxLength={80}
            defaultValue={group.homeCity ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="region" className={labelClass}>
            Region / state
          </label>
          <input
            id="region"
            name="region"
            maxLength={80}
            defaultValue={group.region ?? ''}
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}
