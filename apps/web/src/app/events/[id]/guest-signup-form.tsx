'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { signupAsGuest, type GuestSignupState } from './guest-actions';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { GuestSignupFields } from './_components/guest-signup-fields';

const initial: GuestSignupState = {};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
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
      <GuestSignupFields errors={state.fieldErrors} />

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
