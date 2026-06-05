'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { addProfileMediaAction, type AddProfileMediaState } from '../media-actions';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { fieldInputClass as inputClass } from '@/components/field-styles';

const initialState: AddProfileMediaState = {};

export function AddProfileVideoForm() {
  const [state, formAction] = useFormState(addProfileMediaAction, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error || state.ok));

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pv-kind" className="text-muted mb-1 block text-xs font-medium">
            Type
          </label>
          <select id="pv-kind" name="kind" className={inputClass} defaultValue="clip">
            <option value="clip">Clip / highlight</option>
            <option value="match_video">Match video</option>
          </select>
        </div>
        <div>
          <label htmlFor="pv-title" className="text-muted mb-1 block text-xs font-medium">
            Title
          </label>
          <input
            id="pv-title"
            name="title"
            type="text"
            required
            minLength={3}
            maxLength={200}
            placeholder="Best dig of the summer"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="pv-url" className="text-muted mb-1 block text-xs font-medium">
          Video link
        </label>
        <input
          id="pv-url"
          name="videoUrl"
          type="url"
          required
          placeholder="https://youtube.com/watch?v=… · instagram.com/reel/…"
          className={inputClass}
        />
      </div>
      {(state.error || state.ok) && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          {state.error && (
            <p className="text-sm text-red-500" role="alert">
              {state.error}
            </p>
          )}
          {state.ok && <p className="text-sm text-green-600">Video added to your profile.</p>}
        </div>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <p className="text-muted text-xs">
          YouTube &amp; Twitch play inline on your profile; other links open in a new tab.
        </p>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Adding…' : 'Add video'}
    </button>
  );
}
