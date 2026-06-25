'use client';

import { forwardRef, useState, type ForwardedRef } from 'react';
import { TextField, type TextFieldProps } from './text-field';

/**
 * Password input built on {@link TextField} with a built-in show/hide toggle.
 *
 * The toggle flips the input `type` between `password` and `text` and lives in
 * the field's trailing slot as a real `<button>` (labelled, `aria-pressed`),
 * marked `trailingInteractive` so it stays reachable by assistive tech.
 *
 * It owns `type` and the trailing slot, so those props are not accepted —
 * everything else (label, name, autoComplete, required, value/onChange, …)
 * passes straight through to the single-line `TextField`.
 */
type PasswordFieldProps = Omit<
  Extract<TextFieldProps, { multiline?: false }>,
  'multiline' | 'type' | 'trailingIcon' | 'trailingInteractive'
>;

// Stroked eye / eye-off, matching the house icon language (24×24, currentColor,
// strokeWidth 1.8 — see components/icon.tsx).
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export const PasswordField = forwardRef(function PasswordField(
  props: PasswordFieldProps,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      ref={ref}
      type={visible ? 'text' : 'password'}
      trailingInteractive
      trailingIcon={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="text-fg/60 hover:bg-fg/5 hover:text-fg -mr-1 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
        >
          <EyeIcon off={visible} />
        </button>
      }
    />
  );
});
