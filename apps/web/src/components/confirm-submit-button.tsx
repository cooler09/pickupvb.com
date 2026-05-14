'use client';

import { useFormStatus } from 'react-dom';
import { useState } from 'react';

/**
 * Submit button that asks for confirmation before posting its parent form.
 * Used for RSVP join/leave so the user doesn't accidentally trigger them.
 */
export function ConfirmSubmitButton({
    label,
    pendingLabel,
    confirmMessage,
    className,
}: {
    label: string;
    pendingLabel: string;
    confirmMessage: string;
    className?: string;
}) {
    const { pending } = useFormStatus();
    const [confirmed, setConfirmed] = useState(false);

    return (
        <button
            type="submit"
            disabled={pending}
            onClick={(e) => {
                if (confirmed) return;
                if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
                    e.preventDefault();
                    return;
                }
                setConfirmed(true);
            }}
            className={
                className ??
                'rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50'
            }
        >
            {pending ? pendingLabel : label}
        </button>
    );
}
