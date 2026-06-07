import type { HTMLAttributes } from 'react';

/**
 * Shared form-field error primitive.
 *
 * Pairs an inline error message (visible) with the ARIA wiring a screen
 * reader needs to associate it with the input. Use `fieldA11y(name, errors)`
 * to spread `aria-invalid` + `aria-describedby` onto the input, then render
 * `<FieldError name={name} errors={state.fieldErrors} />` underneath.
 *
 * Co-located here (rather than per-form) so the wiring stays consistent
 * — accessibility audits caught several forms shipping the error text but
 * forgetting the aria attributes that announce it.
 */

/** Stable id for the error element so `aria-describedby` can reference it. */
function errorId(name: string): string {
  return `${name}-error`;
}

export function fieldA11y(
  name: string,
  errors: Record<string, string> | undefined,
): Pick<HTMLAttributes<HTMLElement>, 'aria-invalid' | 'aria-describedby'> {
  const hasError = !!errors?.[name];
  return hasError
    ? { 'aria-invalid': true, 'aria-describedby': errorId(name) }
    : { 'aria-invalid': false };
}

export function FieldError({
  name,
  errors,
  className = 'mt-1 text-xs text-md-error',
}: {
  name: string;
  errors: Record<string, string> | undefined;
  className?: string;
}) {
  const msg = errors?.[name];
  if (!msg) return null;
  return (
    <p id={errorId(name)} role="alert" className={className}>
      {msg}
    </p>
  );
}
