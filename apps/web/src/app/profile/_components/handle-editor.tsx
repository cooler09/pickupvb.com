'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Alert } from '@/components/alert';
import { updateHandle, type HandleFormState } from '../actions';

const initial: HandleFormState = { error: null, success: false };

function SaveBtn() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
            {pending ? 'Saving…' : 'Save'}
        </button>
    );
}

export function HandleEditor({ currentHandle }: { currentHandle: string }) {
    const [editing, setEditing] = useState(false);
    const [state, formAction] = useFormState(updateHandle, initial);
    const saved = state.success && !state.error;

    if (!editing && !saved) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted">
                <span>
                    Your public URL:{' '}
                    <span className="font-mono text-fg/80">/players/{currentHandle}</span>
                </span>
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-primary hover:underline"
                >
                    Change
                </button>
            </div>
        );
    }

    return (
        <form action={formAction} className="space-y-2">
            {state.error && <Alert variant="error">{state.error}</Alert>}
            {saved && (
                <Alert variant="success">
                    Handle updated. Old links to your profile will no longer work.
                </Alert>
            )}
            <label className="block text-xs font-medium uppercase tracking-wide text-fg/70">
                Handle
            </label>
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted">/players/</span>
                <input
                    name="handle"
                    defaultValue={currentHandle}
                    required
                    minLength={3}
                    maxLength={65}
                    pattern="[a-z0-9][a-z0-9-]{1,63}[a-z0-9]"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="flex-1 rounded-md border border-border-base bg-surface px-2 py-1 font-mono text-sm"
                />
                <SaveBtn />
                <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-xs text-muted hover:underline"
                >
                    Cancel
                </button>
            </div>
            <p className="text-xs text-muted">
                3–65 lowercase letters, numbers, or dashes. Changing this breaks any
                existing links to your profile.
            </p>
        </form>
    );
}
