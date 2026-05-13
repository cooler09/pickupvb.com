'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateProfile, type ProfileFormState } from './actions';

type Profile = {
    first_name: string | null;
    last_name: string | null;
    display_name: string;
    home_city: string | null;
};

const initialState: ProfileFormState = { error: null, success: false };

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
            {pending ? 'Saving…' : 'Save changes'}
        </button>
    );
}

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
    const [state, formAction] = useFormState(updateProfile, initialState);

    return (
        <form action={formAction} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="text-sm font-medium">First name</span>
                    <input
                        name="first_name"
                        type="text"
                        autoComplete="given-name"
                        defaultValue={profile.first_name ?? ''}
                        maxLength={60}
                        className="mt-1 w-full rounded-md border border-border-base px-3 py-2"
                    />
                </label>
                <label className="block">
                    <span className="text-sm font-medium">Last name</span>
                    <input
                        name="last_name"
                        type="text"
                        autoComplete="family-name"
                        defaultValue={profile.last_name ?? ''}
                        maxLength={60}
                        className="mt-1 w-full rounded-md border border-border-base px-3 py-2"
                    />
                </label>
            </div>

            <label className="block">
                <span className="text-sm font-medium">Display name</span>
                <input
                    name="display_name"
                    type="text"
                    required
                    defaultValue={profile.display_name}
                    maxLength={80}
                    className="mt-1 w-full rounded-md border border-border-base px-3 py-2"
                />
                <span className="mt-1 block text-xs text-fg/60">
                    Shown publicly on events and rosters. Defaults to your first + last name.
                </span>
            </label>

            <label className="block">
                <span className="text-sm font-medium">Home city</span>
                <input
                    name="home_city"
                    type="text"
                    autoComplete="address-level2"
                    defaultValue={profile.home_city ?? ''}
                    maxLength={120}
                    className="mt-1 w-full rounded-md border border-border-base px-3 py-2"
                />
            </label>

            <div className="block text-sm text-fg/70">
                Email: <span className="font-medium text-fg">{email}</span>
            </div>

            {state.error && (
                <div
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                    {state.error}
                </div>
            )}
            {state.success && !state.error && (
                <div
                    role="status"
                    className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary"
                >
                    Profile updated.
                </div>
            )}

            <SubmitButton />
        </form>
    );
}
