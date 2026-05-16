'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Alert } from '@/components/alert';
import { signupAsGuest, type GuestSignupState } from './guest-actions';
import { TurnstileWidget } from '@/components/turnstile-widget';

const initial: GuestSignupState = {};
const labelClass = 'block text-xs font-medium text-fg';
const inputClass =
    'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const errorClass = 'mt-1 text-xs text-red-600';

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
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
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
                <label htmlFor="display_name" className={labelClass}>Name</label>
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

            <p className="text-xs text-muted">
                No password required. We&apos;ll create a temporary guest session so you can
                manage or cancel your signup from any device this browser is signed in on.
            </p>
            <div className="flex justify-end">
                <SubmitBtn />
            </div>
        </form>
    );
}
