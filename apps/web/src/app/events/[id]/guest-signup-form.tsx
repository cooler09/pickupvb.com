'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Alert } from '@/components/alert';
import { signupAsGuest, type GuestSignupState } from './guest-actions';
import { TurnstileWidget } from '@/components/turnstile-widget';
import {
  fieldErrorClass as errorClass,
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

const initial: GuestSignupState = {};

function Err({ name, errors }: { name: string; errors: Record<string, string> | undefined }) {
  const msg = errors?.[name];
  return msg ? <p className={errorClass}>{msg}</p> : null;
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {pending ? 'Signing up…' : 'Sign me up'}
    </button>
  );
}

export default function GuestSignupForm({ eventId }: { eventId: string }) {
  const action = signupAsGuest.bind(null, eventId);
  const [state, formAction] = useFormState(action, initial);
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      <div>
        <label htmlFor="display_name" className={labelClass}>
          Name
        </label>
        <input
          id="display_name"
          name="display_name"
          required
          maxLength={80}
          autoComplete="name"
          className={inputClass}
        />
        <Err name="display_name" errors={state.fieldErrors} />
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email <span className="text-fg/50">(optional — lets you claim this signup later)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={120}
          autoComplete="email"
          className={inputClass}
        />
        <Err name="email" errors={state.fieldErrors} />
      </div>

      <TurnstileWidget />

      <p className="text-muted text-xs">
        No password required. We&apos;ll create a temporary guest session so you can manage or
        cancel your signup from any device this browser is signed in on.
      </p>
      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}
