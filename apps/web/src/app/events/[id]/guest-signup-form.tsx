'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { signupAsGuest, type GuestSignupState } from './guest-actions';

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
            {state.error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {state.error}
                </div>
            )}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="email" className={labelClass}>
                        Email <span className="text-fg/50">(optional)</span>
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
                <div>
                    <label htmlFor="phone" className={labelClass}>
                        Phone <span className="text-fg/50">(optional)</span>
                    </label>
                    <input
                        id="phone"
                        name="phone"
                        type="tel"
                        maxLength={40}
                        autoComplete="tel"
                        className={inputClass}
                    />
                    <Err name="phone" errors={state.fieldErrors} />
                </div>
            </div>
            <div>
                <label htmlFor="notes" className={labelClass}>
                    Notes <span className="text-fg/50">(optional, e.g. &ldquo;bringing 2 friends&rdquo;)</span>
                </label>
                <textarea id="notes" name="notes" rows={2} maxLength={500} className={inputClass} />
                <Err name="notes" errors={state.fieldErrors} />
            </div>
            <p className="text-xs text-muted">
                You don&apos;t need an account. We&apos;ll show you a link to cancel after signing up.
            </p>
            <div className="flex justify-end">
                <SubmitBtn />
            </div>
        </form>
    );
}
