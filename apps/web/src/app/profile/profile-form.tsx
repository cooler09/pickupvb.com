'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { POSITIONS, POSITION_LABEL } from '@/lib/enum-labels';
import { Alert } from '@/components/alert';
import { updateProfile, type ProfileFormState } from './actions';

type Profile = {
    first_name: string | null;
    last_name: string | null;
    display_name: string;
    home_city: string | null;
    auto_accept_team_invites: boolean;
    primary_position: string | null;
    secondary_position: string | null;
    tertiary_position: string | null;
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

function PositionSelect({
    name,
    label,
    defaultValue,
}: {
    name: string;
    label: string;
    defaultValue: string | null;
}) {
    return (
        <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-fg/70">
                {label}
            </span>
            <select
                name={name}
                defaultValue={defaultValue ?? ''}
                className="mt-1 w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
            >
                <option value="">— None —</option>
                {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                        {POSITION_LABEL[p]}
                    </option>
                ))}
            </select>
        </label>
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

            <fieldset className="space-y-3 rounded-md border border-border-base p-3">
                <legend className="px-1 text-sm font-medium">Positions</legend>
                <p className="px-1 text-xs text-fg/60">
                    Helps captains find you when picking up free agents.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                    <PositionSelect
                        name="primary_position"
                        label="Primary"
                        defaultValue={profile.primary_position}
                    />
                    <PositionSelect
                        name="secondary_position"
                        label="Secondary"
                        defaultValue={profile.secondary_position}
                    />
                    <PositionSelect
                        name="tertiary_position"
                        label="Third"
                        defaultValue={profile.tertiary_position}
                    />
                </div>
            </fieldset>

            <div className="block text-sm text-fg/70">
                Email: <span className="font-medium text-fg">{email}</span>
            </div>

            <fieldset className="space-y-2 rounded-md border border-border-base p-3">
                <legend className="px-1 text-sm font-medium">Team invites</legend>
                <label className="flex items-start gap-2 text-sm">
                    <input
                        name="auto_accept_team_invites"
                        type="checkbox"
                        defaultChecked={profile.auto_accept_team_invites}
                        className="mt-1"
                    />
                    <span>
                        <span className="font-medium">Auto-accept team invites</span>
                        <span className="mt-0.5 block text-xs text-fg/60">
                            Skip the confirmation step — captains can add you to their team
                            roster directly.
                        </span>
                    </span>
                </label>
            </fieldset>

            {state.error && <Alert variant="error">{state.error}</Alert>}
            {state.success && !state.error && (
                <Alert variant="success">Profile updated.</Alert>
            )}

            <SubmitButton />
        </form>
    );
}
