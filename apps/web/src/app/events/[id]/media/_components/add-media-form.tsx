'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { useState } from 'react';
import { addMediaAction, type AddMediaState } from '../actions';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { fieldInputClass as inputClass } from '@/components/field-styles';

const initialState: AddMediaState = {};

export function AddMediaForm({ eventId }: { eventId: string }) {
  const action = addMediaAction.bind(null, eventId);
  const [state, formAction] = useFormState(action, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  const [open, setOpen] = useState(false);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="border-border-base bg-surface rounded-shape-sm border p-4"
    >
      <summary className="text-fg cursor-pointer text-sm font-semibold">
        Post a video, stream, or clip
      </summary>
      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label htmlFor="media-kind" className="text-muted mb-1 block text-xs font-medium">
            Type
          </label>
          <select id="media-kind" name="kind" className={inputClass} defaultValue="clip">
            <option value="live_stream">Live stream</option>
            <option value="match_video">Match video</option>
            <option value="clip">Clip / highlight</option>
          </select>
        </div>
        <div>
          <label htmlFor="media-url" className="text-muted mb-1 block text-xs font-medium">
            Video link
          </label>
          <input
            id="media-url"
            name="videoUrl"
            type="url"
            required
            placeholder="https://youtube.com/watch?v=… · twitch.tv/… · instagram.com/reel/…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="media-title" className="text-muted mb-1 block text-xs font-medium">
            Title
          </label>
          <input
            id="media-title"
            name="title"
            type="text"
            required
            minLength={3}
            maxLength={200}
            placeholder="Court 1 final — match point"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="media-desc" className="text-muted mb-1 block text-xs font-medium">
            Description (optional)
          </label>
          <textarea
            id="media-desc"
            name="description"
            rows={2}
            maxLength={2000}
            className={inputClass}
          />
        </div>
        {state.error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            className="text-sm text-red-500 outline-none"
            role="alert"
          >
            {state.error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <SubmitButton />
          <p className="text-muted text-xs">
            YouTube &amp; Twitch play inline. Instagram, TikTok, Facebook &amp; other links open in
            a new tab.
          </p>
        </div>
      </form>
    </details>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Posting…' : 'Post video'}
    </button>
  );
}
