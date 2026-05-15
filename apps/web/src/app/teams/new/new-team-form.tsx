'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createTeamAction, type TeamFormState } from '../actions';
import { FORMAT_LABEL } from '@/lib/enum-labels';

const initial: TeamFormState = {};
const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
    'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const errorClass = 'mt-1 text-xs text-red-600';

function FieldError({ name, errors }: { name: string; errors: Record<string, string> | undefined }) {
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
            {pending ? 'Creating…' : 'Create team'}
        </button>
    );
}

export default function NewTeamForm() {
    const [state, formAction] = useFormState(createTeamAction, initial);
    return (
        <form action={formAction} className="space-y-4">
            {state.error && (
                <div
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                    {state.error}
                </div>
            )}
            <div>
                <label htmlFor="name" className={labelClass}>Team name</label>
                <input id="name" name="name" required maxLength={80} className={inputClass} />
                <FieldError name="name" errors={state.fieldErrors} />
            </div>
            <div>
                <label htmlFor="format" className={labelClass}>Format</label>
                <select id="format" name="format" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                        Pick a format…
                    </option>
                    {Object.entries(FORMAT_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-muted">
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
