'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { useState } from 'react';
import { sendEventBroadcast } from '../broadcast-actions';
import { useAlertReveal } from '@/components/use-alert-reveal';

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
  const errorRef = useAlertReveal(state, Boolean(state.error));
  const [open, setOpen] = useState(false);

  if (attendeeCount === 0) return null;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-shape-sm border-border-base bg-md-surface-container border p-4"
    >
      <summary className="text-fg cursor-pointer text-sm font-semibold">
        Message attendees <span className="text-muted font-normal">({attendeeCount})</span>
      </summary>
      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label htmlFor="broadcast-subject" className="text-muted mb-1 block text-xs font-medium">
            Subject (optional)
          </label>
          <input
            id="broadcast-subject"
            name="subject"
            type="text"
            maxLength={120}
            placeholder="Important update"
            className="border-border-base bg-bg w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="broadcast-body" className="text-muted mb-1 block text-xs font-medium">
            Message
          </label>
          <textarea
            id="broadcast-body"
            name="body"
            required
            rows={5}
            maxLength={2000}
            placeholder="Heads up — we moved to court 3."
            className="border-border-base bg-bg w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        {state.error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            className="text-md-error text-sm outline-none"
            role="alert"
          >
            {state.error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <SubmitButton />
          <p className="text-muted text-xs">Goes to all attendees by email + in-app.</p>
        </div>
      </form>
    </details>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Sending…' : 'Send message'}
    </button>
  );
}
