'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { claimAccount, type ClaimState } from './actions';

const initial: ClaimState = {};
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
            {pending ? 'Saving…' : 'Create my account'}
        </button>
    );
}

export default function ClaimForm() {
    const [state, formAction] = useFormState(claimAccount, initial);
    return (
        <form action={formAction} className="space-y-3">
            {state.error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {state.error}
                </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="first_name" className={labelClass}>First name</label>
                    <input id="first_name" name="first_name" maxLength={60} className={inputClass} />
                </div>
                <div>
                    <label htmlFor="last_name" className={labelClass}>Last name</label>
                    <input id="last_name" name="last_name" maxLength={60} className={inputClass} />
                </div>
            </div>
            <div>
                <label htmlFor="email" className={labelClass}>Email</label>
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
            <div>
                <label htmlFor="password" className={labelClass}>Password</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={inputClass}
                />
                <Err name="password" errors={state.fieldErrors} />
                <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
            </div>
            <div className="flex justify-end">
                <SubmitBtn />
            </div>
            <p className="text-xs text-muted">
                Supabase will email you a confirmation link. Until you click it, you can
                still sign in with email + password but other apps may not see the address as
                verified.
            </p>
        </form>
    );
}
