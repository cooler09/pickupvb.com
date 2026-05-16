'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { sendEventBroadcast } from '../broadcast-actions';

type State = { ok?: boolean; error?: string };
const initialState: State = {};

export function HostBroadcastPanel({
    eventId,
    attendeeCount,
}: {
    eventId: string;
    attendeeCount: number;
}) {
    const action = sendEventBroadcast.bind(null, eventId);
    const [state, formAction] = useFormState(action, initialState);
    const [open, setOpen] = useState(false);

    if (attendeeCount === 0) return null;

    return (
        <details
            open={open}
            onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
            className="rounded-lg border border-border-base bg-surface p-4"
        >
            <summary className="cursor-pointer text-sm font-semibold text-fg">
                Message attendees{' '}
                <span className="font-normal text-muted">
                    ({attendeeCount})
                </span>
            </summary>
            <form action={formAction} className="mt-4 space-y-3">
                <div>
                    <label
                        htmlFor="broadcast-subject"
                        className="mb-1 block text-xs font-medium text-muted"
                    >
                        Subject (optional)
                    </label>
                    <input
                        id="broadcast-subject"
                        name="subject"
                        type="text"
                        maxLength={120}
                        placeholder="Important update"
                        className="w-full rounded-md border border-border-base bg-bg px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label
                        htmlFor="broadcast-body"
                        className="mb-1 block text-xs font-medium text-muted"
                    >
                        Message
                    </label>
                    <textarea
                        id="broadcast-body"
                        name="body"
                        required
                        rows={5}
                        maxLength={2000}
                        placeholder="Heads up — we moved to court 3."
                        className="w-full rounded-md border border-border-base bg-bg px-3 py-2 text-sm"
                    />
                </div>
                {state.error && (
                    <p className="text-sm text-red-500" role="alert">
                        {state.error}
                    </p>
                )}
                <div className="flex items-center gap-3">
                    <SubmitButton />
                    <p className="text-xs text-muted">
                        Goes to all attendees by email + in-app.
                    </p>
                </div>
            </form>
        </details>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
            {pending ? 'Sending…' : 'Send message'}
        </button>
    );
}
