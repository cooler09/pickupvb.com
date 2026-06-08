'use client';

import { useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import { useFormState, useFormStatus } from 'react-dom';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { updateHandle, type HandleFormState } from '../actions';

const initial: HandleFormState = { error: null, success: false };

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('sm')}>
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}

export function HandleEditor({ currentHandle }: { currentHandle: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState(updateHandle, initial);
  const saved = state.success && !state.error;
  const errorRef = useAlertReveal(state, Boolean(state.error || saved));

  if (!editing && !saved) {
    return (
      <div className="text-muted flex items-center gap-2 text-xs">
        <span>
          Your public URL: <span className="text-fg/80 font-mono">/players/{currentHandle}</span>
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
      {(state.error || saved) && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          {state.error && <Alert variant="error">{state.error}</Alert>}
          {saved && (
            <Alert variant="success">
              Handle updated. Old links to your profile will no longer work.
            </Alert>
          )}
        </div>
      )}
      <label className="text-fg/70 block text-xs font-medium tracking-wide uppercase">Handle</label>
      <div className="flex items-center gap-2">
        <span className="text-muted text-sm">/players/</span>
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
          className="border-border-base bg-md-surface-container flex-1 rounded-md border px-2 py-1 font-mono text-sm"
        />
        <SaveBtn />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-muted text-xs hover:underline"
        >
          Cancel
        </button>
      </div>
      <p className="text-muted text-xs">
        3–65 lowercase letters, numbers, or dashes. Changing this breaks any existing links to your
        profile.
      </p>
    </form>
  );
}
