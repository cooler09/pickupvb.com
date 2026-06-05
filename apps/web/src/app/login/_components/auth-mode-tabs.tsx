'use client';

import type { AuthMode } from '../_lib/friendly-error';

type Props = {
  mode: AuthMode;
  onChange: (next: AuthMode) => void;
};

/**
 * Sign in / Sign up segmented toggle for the auth screen. Controlled — the
 * parent owns the `mode` state and resets banners when it switches.
 */
export function AuthModeTabs({ mode, onChange }: Props) {
  const signUp = mode === 'sign-up';
  return (
    <div className="border-border-base grid grid-cols-2 rounded-md border p-1 text-sm">
      <button
        type="button"
        aria-pressed={!signUp}
        onClick={() => onChange('sign-in')}
        className={`rounded px-3 py-1.5 font-medium transition ${
          !signUp ? 'bg-primary text-primary-fg' : 'text-fg/70'
        }`}
      >
        Sign in
      </button>
      <button
        type="button"
        aria-pressed={signUp}
        onClick={() => onChange('sign-up')}
        className={`rounded px-3 py-1.5 font-medium transition ${
          signUp ? 'bg-primary text-primary-fg' : 'text-fg/70'
        }`}
      >
        Sign up
      </button>
    </div>
  );
}
