'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { claimAccount, type ClaimState } from './actions';
import {
  fieldErrorClass as errorClass,
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

const initial: ClaimState = {};

function Err({ name, errors }: { name: string; errors: Record<string, string> | undefined }) {
  const msg = errors?.[name];
  return msg ? <p className={errorClass}>{msg}</p> : null;
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Sending…' : 'Send confirmation email'}
    </button>
  );
}

export default function ClaimForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(claimAccount, initial);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  return (
    <form action={formAction} className="space-y-3">
      {/* Where to land after the email-confirm → set-password chain (e.g. the
          /events/new host gate that sent the user here). Threaded through
          emailRedirectTo by the action; honored by /reset-password. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{state.error}</Alert>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="first_name" className={labelClass}>
            First name
          </label>
          <input id="first_name" name="first_name" maxLength={60} className={inputClass} />
        </div>
        <div>
          <label htmlFor="last_name" className={labelClass}>
            Last name
          </label>
          <input id="last_name" name="last_name" maxLength={60} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={120}
          autoComplete="email"
          className={inputClass}
        />
        <Err name="email" errors={state.fieldErrors} />
      </div>
      <div className="flex justify-end">
        <SubmitBtn />
      </div>
      <p className="text-muted text-xs">
        We&apos;ll email you a confirmation link. After you click it you&apos;ll be asked to choose
        a password — then you can sign in from any device with the same signups.
      </p>
    </form>
  );
}
