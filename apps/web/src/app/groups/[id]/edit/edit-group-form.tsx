'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Alert } from '@/components/alert';
import { updateGroupAction, type GroupFormState } from '@/app/groups/actions';

const initial: GroupFormState = {};
const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
    'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary';

function SubmitBtn() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
            {pending ? 'Saving…' : 'Save changes'}
        </button>
    );
}

type Group = {
    id: string;
    name: string;
    description: string;
    avatar_url: string | null;
    home_city: string | null;
    region: string | null;
};

export default function EditGroupForm({ group }: { group: Group }) {
    const action = updateGroupAction.bind(null, group.id);
    const [state, formAction] = useFormState(action, initial);
    return (
        <form action={formAction} className="space-y-4">
            {state.error && <Alert variant="error">{state.error}</Alert>}
            <div>
                <label htmlFor="name" className={labelClass}>Name</label>
                <input id="name" name="name" required maxLength={80} defaultValue={group.name} className={inputClass} />
            </div>
            <div>
                <label htmlFor="description" className={labelClass}>Description</label>
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
                    <label htmlFor="home_city" className={labelClass}>Home city</label>
                    <input
                        id="home_city"
                        name="home_city"
                        maxLength={80}
                        defaultValue={group.home_city ?? ''}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label htmlFor="region" className={labelClass}>Region / state</label>
                    <input
                        id="region"
                        name="region"
                        maxLength={80}
                        defaultValue={group.region ?? ''}
                        className={inputClass}
                    />
                </div>
            </div>
            <div>
                <label htmlFor="avatar_url" className={labelClass}>Avatar URL</label>
                <input
                    id="avatar_url"
                    name="avatar_url"
                    type="url"
                    defaultValue={group.avatar_url ?? ''}
                    className={inputClass}
                />
            </div>
            <div className="flex justify-end">
                <SubmitBtn />
            </div>
        </form>
    );
}
